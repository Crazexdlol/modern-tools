import { createClient } from './client'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'

// ── ACV History ──────────────────────────────────────────────────────────────

export type ClaimStatus = 'open' | 'closed'

export interface ACVHistoryEntry {
  id: string
  date: string
  // Stable creation timestamp — set once by the DB (`default now()`), never
  // updated. Optional in the interface because callers that construct entries
  // to *write* (e.g. ClaimWorkspace's saveToHistory) leave it to the DB; every
  // read via rowToEntry populates it, falling back to `date` for the rare
  // pre-column row.
  createdAt?: string
  mode: string
  vehicle: string
  vin: string
  maNumber: string
  acv: number
  claim: ClaimInfo
  comps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
  mileageRate?: number
  status?: ClaimStatus
  // Role-based workflow columns (see supabase/migration-roles.sql). Writes go
  // through dedicated API routes (Task 6) — saveACVHistory intentionally does
  // NOT include these in its payload, and the column-guard trigger will reject
  // appraiser attempts to change them anyway.
  assignedTo?: string | null    // uuid | null; null = unassigned
  submittedAt?: string | null   // ISO timestamp | null
  submittedBy?: string | null   // uuid | null
  // Award / Closing Notes editor state (jsonb blob; shape lives in comp-finder).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reportsState?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auctionListings?: any[]
  // Per-claim Estimate Dispute result (jsonb; shape lives in the estimate tab).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  estimate?: any
  // Documents tab metadata (files live in the claim-documents storage bucket).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documents?: any[]
  // Diminished Value tab state (jsonb; shape lives in the DV tab).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dv?: any
  // Reports tab — Invoice state (jsonb; shape lives in reports-tab.tsx).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice?: any
  // Storage Charges tab state (jsonb; shape = StorageState in acv/types.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage?: any
  // Status phase (set via /api/claims/[id]/phase; cleared by setting null).
  statusPhase?: string | null
  statusPhaseSetAt?: string | null
  // Reason the claim was closed (set via /api/claims/[id]/approve).
  //   'completed' — normal course, ran to closure
  //   'cancelled' — pulled (client withdrew, wrong assignment, duplicate, etc)
  //   null        — either the claim isn't closed, or it was closed before the
  //                 close_reason column was added (legacy rows).
  closeReason?: 'completed' | 'cancelled' | null
  // Timestamp the claim was closed (set via /api/claims/[id]/approve; cleared
  // by /api/claims/[id]/reopen). Null for open claims and for closed rows
  // that predate the closed_at migration and had no submitted_at to backfill.
  closedAt?: string | null
  // Canonical client the claim's clientName resolves to. Null on claims
  // created before the Marketing rollout (backfilled in a later session).
  clientId?: string | null
  // Team-wide star flag — anyone can toggle, everyone sees it. Set via
  // /api/claims/[id]/star. Default false; undefined = column not yet
  // migrated (graceful degradation).
  starred?: boolean
  // acv_history.assigned_at — timestamp when this claim was most recently
  // (re)assigned. Used with openedAt below to derive the "unread" gray
  // highlight on the appraiser dashboard.
  assignedAt?: string | null
  // user_claim_views.opened_at for the current auth user; null if this user
  // has never opened this claim (or the migration hasn't run yet).
  openedAt?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): ACVHistoryEntry {
  return {
    id: row.id,
    date: row.date,
    createdAt: row.created_at ?? row.date,
    mode: row.mode,
    vehicle: row.vehicle,
    vin: row.vin,
    maNumber: row.ma_number,
    acv: Number(row.acv),
    claim: row.claim as ClaimInfo,
    comps: row.comps as SelectedComp[],
    adjustments: row.adjustments as ACVAdjustments,
    result: row.result as ACVResult,
    mileageRate: Number(row.mileage_rate ?? 0),
    status: row.status === 'closed' ? 'closed' : 'open',
    assignedTo: row.assigned_to ?? null,
    submittedAt: row.submitted_at ?? null,
    submittedBy: row.submitted_by ?? null,
    reportsState: row.reports_state ?? undefined,
    auctionListings: row.auction_listings ?? undefined,
    estimate: row.estimate ?? undefined,
    documents: row.documents ?? undefined,
    dv: row.dv ?? undefined,
    invoice: row.invoice ?? undefined,
    storage: row.storage ?? undefined,
    statusPhase: row.status_phase ?? null,
    statusPhaseSetAt: row.status_phase_set_at ?? null,
    closeReason: row.close_reason === 'completed' || row.close_reason === 'cancelled' ? row.close_reason : null,
    closedAt: row.closed_at ?? null,
    clientId: row.client_id ?? null,
    starred: row.starred === true,
    assignedAt: row.assigned_at ?? null,
  }
}

// Returns null on a fetch error so callers can show a real error state
// instead of an empty-looking dashboard.
//
// List-view fetch: pulls only the columns the two list pages (dashboard,
// /claims) actually render. The fat jsonb blobs
// (comps, auction_listings, documents, reports_state, estimate, dv, invoice,
// adjustments, result) are intentionally omitted — on ~390 claims they'd
// balloon the response into multi-MB territory and stall login. Full-row
// fetch lives in fetchACVEntry(id) for the claim workspace.
export async function fetchACVHistory(): Promise<ACVHistoryEntry[] | null> {
  const supabase = createClient()
  // Full column list — includes all newer columns (starred, close_reason).
  // If any newer column hasn't been migrated yet, we fall back to the core
  // column set so the dashboard stays alive. `starred` and `closeReason`
  // default gracefully (false / null) when absent, so the UI is fine either
  // way.
  const colsFull = 'id, date, created_at, mode, vehicle, vin, ma_number, acv, status, claim, assigned_to, assigned_at, submitted_at, submitted_by, status_phase, status_phase_set_at, starred, close_reason, closed_at'
  const colsCore = 'id, date, created_at, mode, vehicle, vin, ma_number, acv, status, claim, assigned_to, assigned_at, submitted_at, submitted_by, status_phase, status_phase_set_at'
  // Dashboard default: oldest at top (longest-open first). Users can click
  // the Days Open header to flip direction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] | null = null
  let { data: fullData, error } = await supabase
    .from('acv_history')
    .select(colsFull)
    .order('created_at', { ascending: true })
  data = fullData

  if (error && error.code === '42703') {
    const { data: fallback, error: err2 } = await supabase
      .from('acv_history')
      .select(colsCore)
      .order('created_at', { ascending: true })
    data = fallback
    error = err2
  }

  if (error) {
    console.error('Failed to fetch ACV history:', error)
    return null
  }

  const entries = (data ?? []).map(rowToEntry)

  // Pull the current user's opened_at rows so the dashboard can derive
  // isUnread (assigned_to = user AND (no row OR assigned_at > opened_at)).
  // Wrapped defensively: the table may not exist yet if the migration
  // hasn't run — in that case everything just shows as opened.
  const { data: { user } } = await supabase.auth.getUser()
  let viewsByClaimId = new Map<string, string>()
  if (user) {
    const { data: views, error: viewsErr } = await supabase
      .from('user_claim_views')
      .select('claim_id, opened_at')
      .eq('user_id', user.id)
    // 42P01 = table doesn't exist yet (pre-migration). Fall through with empty map.
    if (!viewsErr && views) {
      viewsByClaimId = new Map(views.map(v => [v.claim_id as string, v.opened_at as string]))
    }
  }

  return entries.map(e => ({ ...e, openedAt: viewsByClaimId.get(e.id) ?? null }))
}

export async function fetchACVEntry(id: string): Promise<ACVHistoryEntry | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('acv_history')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch ACV entry:', error)
    return null
  }

  return data ? rowToEntry(data) : null
}

export async function setClaimStatus(id: string, status: ClaimStatus) {
  const supabase = createClient()
  const { error } = await supabase
    .from('acv_history')
    .update({ status })
    .eq('id', id)
  if (error) console.error('Failed to set claim status:', error)
}

export async function saveACVHistory(
  entry: ACVHistoryEntry,
  editId?: string | null,
  activeCompanyId?: string | null,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const id = editId || entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // NOTE: no delete-before-upsert. Deleting and re-inserting dropped columns
  // that weren't part of this payload (reports_state), wiping the Opposing
  // Appraiser / Award / Closing Notes state on any save that omitted it.
  // Optional fields are included only when present so a save that omits them
  // (e.g. a claim-info-only save) never nulls a sibling tool's data.
  const payload: Record<string, unknown> = {
    date: entry.date,
    mode: entry.mode,
    vehicle: entry.vehicle,
    vin: entry.vin,
    ma_number: entry.maNumber,
    acv: entry.acv,
    claim: entry.claim,
    comps: entry.comps,
    adjustments: entry.adjustments,
    result: entry.result,
    mileage_rate: entry.mileageRate ?? 0,
  }
  if (entry.status !== undefined) payload.status = entry.status
  if (entry.reportsState !== undefined) payload.reports_state = entry.reportsState
  if (entry.auctionListings !== undefined) payload.auction_listings = entry.auctionListings
  if (entry.estimate !== undefined) payload.estimate = entry.estimate
  if (entry.documents !== undefined) payload.documents = entry.documents
  if (entry.dv !== undefined) payload.dv = entry.dv
  if (entry.invoice !== undefined) payload.invoice = entry.invoice
  if (entry.storage !== undefined) payload.storage = entry.storage
  if (entry.clientId !== undefined) payload.client_id = entry.clientId

  // Existence check first: an "update returned 0 rows" could mean either
  // "row not found" (correct to fall through to insert) OR "RLS blocked
  // the update" (falling through to insert would then 23505 or worse).
  // Doing the SELECT under the same anon-key policies distinguishes the
  // two cleanly — if we can SEE it, then a subsequent update failure is
  // real (permission-guard trigger, not RLS row filter), so we should
  // surface it, not paper over it with a duplicate insert.
  const { data: existing, error: existsErr } = await supabase
    .from('acv_history')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (existsErr) {
    console.error('Failed to check claim existence:', existsErr)
    return
  }

  if (existing) {
    // Row exists (and we can see it) — update only.
    let { error: updateError } = await supabase
      .from('acv_history')
      .update(payload)
      .eq('id', id)
    if (updateError && updateError.code === '42703') {
      // documents/dv/invoice/client_id columns not migrated yet — save
      // everything else rather than losing the claim edit.
      delete payload.documents
      delete payload.dv
      delete payload.invoice
      delete payload.storage
      delete payload.client_id
      ;({ error: updateError } = await supabase
        .from('acv_history')
        .update(payload)
        .eq('id', id))
    }
    if (updateError) {
      console.error('Failed to update ACV history:', updateError)
    }
    return
  }

  // Row not visible — either brand-new id we're creating, or someone
  // else's private claim we can't see. Attempt insert; on unique-violation
  // (23505) the row exists but is RLS-hidden from us — surface that as an
  // error rather than looping.
  //
  // Non-admins must self-assign on insert: acv_select RLS only exposes rows
  // where assigned_to = auth.uid(), so an unassigned insert would succeed
  // but leave the appraiser unable to read (or re-save) their own claim.
  // Admin inserts stay unassigned so the existing create-then-assign flow
  // in the admin UI is preserved.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const insertPayload: Record<string, unknown> = { id, user_id: user.id, ...payload }
  if (profile?.role !== 'admin') insertPayload.assigned_to = user.id
  // Post-migration RLS WITH CHECK requires company_id = active_company_id().
  // Stamp when we know it; RLS blocks the insert if we don't and the column
  // exists (which is the correct fail-loud behavior).
  if (activeCompanyId) insertPayload.company_id = activeCompanyId

  let { error: insertError } = await supabase
    .from('acv_history')
    .insert(insertPayload)
  if (insertError && insertError.code === '42703') {
    // Pre-migration fallback: drop company_id and retry.
    delete insertPayload.company_id
    ;({ error: insertError } = await supabase
      .from('acv_history')
      .insert(insertPayload))
  }
  if (insertError) {
    // Throw so the caller can surface a real error state (toast, retry, etc)
    // instead of leaving the "unsaved changes" pill stuck without explanation.
    console.error('Failed to insert ACV history:', insertError)
    throw new Error(insertError.message)
  }
}

// Returns true on success, false on failure. Callers (e.g. bulk delete)
// need this so they can distinguish "actually deleted" from "RLS blocked
// but we swallowed the error"; a silent success reload would leave the
// user thinking rows were removed when they weren't.
export async function deleteACVHistory(id: string): Promise<boolean> {
  const supabase = createClient()
  // Clean up storage bucket first — the RLS policy gates on the claim
  // existing, so after the row is deleted the objects become orphaned
  // (undeletable via RLS). Do this before the DB delete.
  try {
    const { data: files } = await supabase.storage.from('claim-documents').list(id)
    if (files && files.length > 0) {
      await supabase.storage.from('claim-documents').remove(
        files.map(f => `${id}/${f.name}`)
      )
    }
  } catch { /* storage cleanup best-effort */ }
  const { error } = await supabase.from('acv_history').delete().eq('id', id)
  if (error) {
    console.error('Failed to delete ACV history:', error)
    return false
  }
  return true
}

// ── Estimate History ─────────────────────────────────────────────────────────

export interface EstimateHistoryEntry {
  id: string
  date: string
  vehicle: Record<string, string>
  softwareA: string
  softwareB: string
  fileNameA: string
  fileNameB: string
  grandTotalA: number
  grandTotalB: number
  totalDifference: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim?: any
}

export async function fetchEstimateHistory(): Promise<EstimateHistoryEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('estimate_history')
    .select('*')
    .order('date', { ascending: false })

  if (error) {
    console.error('Failed to fetch estimate history:', error)
    return []
  }

  return (data ?? []).map(row => ({
    id: row.id,
    date: row.date,
    vehicle: row.vehicle as Record<string, string>,
    softwareA: row.software_a,
    softwareB: row.software_b,
    fileNameA: row.file_name_a,
    fileNameB: row.file_name_b,
    grandTotalA: Number(row.grand_total_a),
    grandTotalB: Number(row.grand_total_b),
    totalDifference: Number(row.total_difference),
    result: row.result,
    claim: row.claim,
  }))
}

export async function saveEstimateHistory(entry: EstimateHistoryEntry) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('estimate_history').upsert({
    id: entry.id,
    user_id: user.id,
    date: entry.date,
    vehicle: entry.vehicle,
    software_a: entry.softwareA,
    software_b: entry.softwareB,
    file_name_a: entry.fileNameA,
    file_name_b: entry.fileNameB,
    grand_total_a: entry.grandTotalA,
    grand_total_b: entry.grandTotalB,
    total_difference: entry.totalDifference,
    result: entry.result,
    claim: entry.claim,
  })

  if (error) console.error('Failed to save estimate history:', error)
}

export async function deleteEstimateHistory(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('estimate_history').delete().eq('id', id)
  if (error) console.error('Failed to delete estimate history:', error)
}

// ── Migration: localStorage → Supabase ───────────────────────────────────────

export async function migrateLocalStorageToSupabase() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Migrate ACV history
  const acvRaw = localStorage.getItem('modern-tools-acv-history')
  if (acvRaw) {
    try {
      const entries: ACVHistoryEntry[] = JSON.parse(acvRaw)
      if (entries.length > 0) {
        const rows = entries.map(e => ({
          id: e.id,
          user_id: user.id,
          date: e.date,
          mode: e.mode,
          vehicle: e.vehicle,
          vin: e.vin,
          ma_number: e.maNumber,
          acv: e.acv,
          claim: e.claim,
          comps: e.comps ?? [],
          adjustments: e.adjustments ?? {},
          result: e.result ?? {},
          mileage_rate: e.mileageRate ?? 0,
        }))
        const { error } = await supabase.from('acv_history').upsert(rows)
        if (!error) {
          localStorage.removeItem('modern-tools-acv-history')
        } else {
          console.error('ACV migration error:', error)
        }
      }
    } catch (err) {
      console.error('Failed to parse ACV localStorage:', err)
    }
  }

  // Migrate Estimate history
  const estRaw = localStorage.getItem('modern-tools-estimate-history')
  if (estRaw) {
    try {
      const entries: EstimateHistoryEntry[] = JSON.parse(estRaw)
      if (entries.length > 0) {
        const rows = entries.map(e => ({
          id: e.id,
          user_id: user.id,
          date: e.date,
          vehicle: e.vehicle,
          software_a: e.softwareA,
          software_b: e.softwareB,
          file_name_a: e.fileNameA,
          file_name_b: e.fileNameB,
          grand_total_a: e.grandTotalA,
          grand_total_b: e.grandTotalB,
          total_difference: e.totalDifference,
          result: e.result,
          claim: e.claim,
        }))
        const { error } = await supabase.from('estimate_history').upsert(rows)
        if (!error) {
          localStorage.removeItem('modern-tools-estimate-history')
        } else {
          console.error('Estimate migration error:', error)
        }
      }
    } catch (err) {
      console.error('Failed to parse estimate localStorage:', err)
    }
  }
}
