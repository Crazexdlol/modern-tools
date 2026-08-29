import { createClient } from './client'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'

// ── ACV History ──────────────────────────────────────────────────────────────

export type ClaimStatus = 'open' | 'closed'

export interface ACVHistoryEntry {
  id: string
  date: string
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
  // Status phase (set via /api/claims/[id]/phase; cleared by setting null).
  statusPhase?: string | null
  statusPhaseSetAt?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): ACVHistoryEntry {
  return {
    id: row.id,
    date: row.date,
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
    statusPhase: row.status_phase ?? null,
    statusPhaseSetAt: row.status_phase_set_at ?? null,
  }
}

// Returns null on a fetch error so callers can show a real error state
// instead of an empty-looking dashboard.
//
// List-view fetch: pulls only the columns the three list pages (dashboard,
// /claims, /completed-assignments) actually render. The fat jsonb blobs
// (comps, auction_listings, documents, reports_state, estimate, dv, invoice,
// adjustments, result) are intentionally omitted — on ~390 claims they'd
// balloon the response into multi-MB territory and stall login. Full-row
// fetch lives in fetchACVEntry(id) for the claim workspace.
export async function fetchACVHistory(): Promise<ACVHistoryEntry[] | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('acv_history')
    .select('id, date, mode, vehicle, vin, ma_number, acv, status, claim, assigned_to, submitted_at, submitted_by, status_phase, status_phase_set_at')
    .order('date', { ascending: false })

  if (error) {
    console.error('Failed to fetch ACV history:', error)
    return null
  }

  return (data ?? []).map(rowToEntry)
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

export async function saveACVHistory(entry: ACVHistoryEntry, editId?: string | null) {
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
      // documents/dv/invoice columns not migrated yet — save everything
      // else rather than losing the claim edit.
      delete payload.documents
      delete payload.dv
      delete payload.invoice
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
  const { error: insertError } = await supabase
    .from('acv_history')
    .insert({ id, user_id: user.id, ...payload })
  if (insertError) console.error('Failed to insert ACV history:', insertError)
}

export async function deleteACVHistory(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('acv_history').delete().eq('id', id)
  if (error) console.error('Failed to delete ACV history:', error)
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
