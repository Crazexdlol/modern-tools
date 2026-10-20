import type { SupabaseClient } from '@supabase/supabase-js'

export type Stage = 'main' | 'qc' | 'billing_delivery' | 'payment'

// Record a stage/assignee transition on a claim. Closes out whatever event
// is currently open for this claim and opens a new one with the given state.
//
// Called by every API route that mutates workflow_stage OR assigned_to on
// acv_history: /submit, /advance-workflow, /assign, /complete-report,
// /approve, /reopen.
//
// Idempotent-ish: if the "new" state matches the currently-open event
// (same stage + same assignee), does nothing. Prevents duplicate rows when
// a route patches a non-tracked column and happens to re-pass the same
// stage/assignee values.
//
// Pause-aware: if there's NO currently-open event, that means either
//   (a) this claim is excluded from cycle tracking (cycle_tracked_from
//       is NULL — legacy claim), or
//   (b) the claim is currently paused by a status phase that pauses
//       cycle time.
// In both cases, we open a fresh event with the new state. The "already
// in the right state → no-op" fast path above still applies.
//
// NOTE: the old "lazy backfill" (retroactive Main span from created_at)
// was removed on 2026-10-12. It was double-counting pre-ledger time onto
// current assignees. Initial-event tracking now happens via a DB trigger
// (open_initial_stage_event in migration-cycle-times-reset-and-pauses.sql)
// at claim-insert time.
//
// FAIL-SAFE: wraps every DB operation in try/catch and logs instead of
// throwing. Cycle-time tracking must NEVER break a claim workflow write.
// If the table doesn't exist yet (pre-migration) OR the service client
// hits any transient error, the parent write still succeeds.
export async function recordStageTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>,
  claimId: string,
  stage: Stage,
  assignedTo: string | null,
): Promise<void> {
  try {
    const now = new Date().toISOString()

    // Is the state the same? If so, nothing to record.
    const { data: current } = await service
      .from('claim_stage_events')
      .select('id, stage, assigned_to')
      .eq('claim_id', claimId)
      .is('exited_at', null)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (current && current.stage === stage && current.assigned_to === assignedTo) return

    // Close every open event for this claim (defensively — there should be
    // at most one, but older bugs or race conditions could leak extras).
    // If there are no open events (legacy / paused claim), this is a no-op.
    await service
      .from('claim_stage_events')
      .update({ exited_at: now })
      .eq('claim_id', claimId)
      .is('exited_at', null)

    // Legacy-claim guard: only open a new event if the claim opted into
    // cycle tracking. Avoids resurrecting a pre-reset claim into the
    // ledger just because someone reassigned it.
    const { data: claimRow } = await service
      .from('acv_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('cycle_tracked_from, status_phase' as any)
      .eq('id', claimId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (claimRow as any) ?? {}
    if (!row.cycle_tracked_from) return

    // Pause-aware: if the claim's current status_phase has
    // pauses_cycle_time=true, DO NOT open a new event — the claim is
    // meant to be paused, and a reassignment on a Hold-phased claim
    // should keep cycle time paused for the new assignee the same way
    // it was paused for the old one. Previously this always opened a
    // fresh event on reassign, which silently un-paused cycle time
    // whenever a Hold / Pending Repairs / Pending Information / Rough
    // Numbers claim moved to a different person. Henry 2026-10-15.
    if (row.status_phase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cfg } = await service
        .from('status_phase_configs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('pauses_cycle_time' as any)
        .eq('code', row.status_phase)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((cfg as any)?.pauses_cycle_time === true) return
    }

    // Open the new one.
    await service
      .from('claim_stage_events')
      .insert({ claim_id: claimId, stage, assigned_to: assignedTo, entered_at: now })
  } catch (err) {
    // Never bubble up — cycle-time telemetry is best-effort.
    // eslint-disable-next-line no-console
    console.error('[stage-events] recordStageTransition failed:', err)
  }
}

// Record a phase change on a claim. Only acts when the pause-state
// changes:
//   - entering a pause phase (previous phase doesn't pause → new phase
//     pauses): closes the currently open event. The claim is now
//     "paused" — no event accumulates time.
//   - leaving a pause phase (previous paused → new doesn't): opens a
//     fresh event with the claim's current workflow stage + assignee.
//   - non-pause → non-pause OR pause → pause: no-op (nothing changes).
//
// Call this AFTER updating acv_history.status_phase in the phase API.
//
// Fail-safe (same as recordStageTransition): swallow all errors, never
// break the parent write.
export async function recordPhaseChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>,
  claimId: string,
  newPhase: string | null,
  prevPhase: string | null,
): Promise<void> {
  try {
    if (newPhase === prevPhase) return

    // Resolve pause-status for both. A null phase = not paused.
    const codesToCheck = [newPhase, prevPhase].filter((c): c is string => !!c)
    let configs: { code: string; pauses_cycle_time: boolean }[] = []
    if (codesToCheck.length > 0) {
      const { data } = await service
        .from('status_phase_configs')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('code, pauses_cycle_time' as any)
        .in('code', codesToCheck)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configs = (data ?? []) as any
    }
    const pausedByCode = new Map(configs.map(c => [c.code, c.pauses_cycle_time === true]))
    const wasPaused = prevPhase ? (pausedByCode.get(prevPhase) ?? false) : false
    const nowPaused = newPhase ? (pausedByCode.get(newPhase) ?? false) : false
    if (wasPaused === nowPaused) return

    const now = new Date().toISOString()

    if (nowPaused) {
      // Entering pause — close whatever's open. Don't open a new event.
      await service
        .from('claim_stage_events')
        .update({ exited_at: now })
        .eq('claim_id', claimId)
        .is('exited_at', null)
      return
    }

    // Leaving pause — reopen a fresh event with current stage + assignee.
    // Legacy-claim guard: skip if the claim opted out of tracking.
    const { data: claimRow } = await service
      .from('acv_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('workflow_stage, assigned_to, cycle_tracked_from' as any)
      .eq('id', claimId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = claimRow as any
    if (!row?.cycle_tracked_from) return
    const rawStage = (row.workflow_stage ?? 'main') as string
    const normalizedStage =
      rawStage === 'billing' || rawStage === 'delivery' ? 'billing_delivery' : rawStage
    const stage: Stage = (['main', 'qc', 'billing_delivery', 'payment'].includes(normalizedStage)
      ? normalizedStage
      : 'main') as Stage
    await service.from('claim_stage_events').insert({
      claim_id: claimId,
      stage,
      assigned_to: row.assigned_to ?? null,
      entered_at: now,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stage-events] recordPhaseChange failed:', err)
  }
}

// Close out any open event without opening a new one. Used when a claim is
// closed (approve → closed) — the final event's exited_at gets stamped and
// no replacement is opened. Payment-stage events ALSO close here when the
// claim closes, so the payment-stage leaderboard can show elapsed time
// across all historical claims.
export async function closeOpenStageEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>,
  claimId: string,
): Promise<void> {
  try {
    await service
      .from('claim_stage_events')
      .update({ exited_at: new Date().toISOString() })
      .eq('claim_id', claimId)
      .is('exited_at', null)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stage-events] closeOpenStageEvent failed:', err)
  }
}
