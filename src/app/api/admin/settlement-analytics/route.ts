import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/admin/settlement-analytics?clientId=<uuid>
//
// Aggregates settlement deltas across every CLOSED ACV claim for the given
// client. Returns a per-claim rows list; the client re-computes KPIs over
// its Ins. Co.-filtered subset so headline numbers always match the table.
// Small-N data (hundreds of rows per client at most) so a full row dump is
// cheaper than paginating.
//
// Deltas (sign conventions):
//   award − insCoOffer   positive = we settled above the Ins. Co. offer
//   award − maAcv        positive = we moved up from our original ACV
//   award − oaValue      positive = we won vs. OA; negative = OA won
//
// Field sources (priority order documented inline below):
//   Award       — notesData.agreementAmountNum → awardData.acvAmountNum → notesData.acvAmountNum
//   Ins. Co.    — notesData.insuranceOfferNum
//   OA value    — notesData.appraiserValueNum
//   MA ACV      — notesData.maValueNum (override) → acv_history.acv (calc result)
//
// Admin-only. Cancelled claims (close_reason='cancelled') excluded at the
// SQL layer; claims with 'other' in claimTypes excluded in the row loop.
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const service = createServiceClient()

  // Pull every closed ACV claim for this client. We need the full claim +
  // reports_state blobs to extract the four values. Cancelled claims
  // (close_reason = 'cancelled') are explicitly excluded — a cancelled claim
  // never settled, so its "award" / "OA value" fields are stale drafts that
  // would skew every KPI if included. Legacy closed rows with
  // close_reason = null predate the column and are treated as completed.
  let data: Array<Record<string, unknown>> | null = null
  let fetchErr: { code?: string; message?: string } | null = null
  {
    const r = await service
      .from('acv_history')
      .select('id, ma_number, acv, claim, reports_state, closed_at, status, close_reason, proceeded_to_umpire')
      .eq('client_id', clientId)
      .eq('status', 'closed')
      .or('close_reason.is.null,close_reason.neq.cancelled')
    data = r.data as typeof data
    fetchErr = r.error
  }
  // Pre-migration safety: proceeded_to_umpire column may not exist yet.
  // Retry without it so Settlement Analytics still loads.
  if (fetchErr && (fetchErr.code === '42703' || fetchErr.code === 'PGRST204')) {
    const r = await service
      .from('acv_history')
      .select('id, ma_number, acv, claim, reports_state, closed_at, status, close_reason')
      .eq('client_id', clientId)
      .eq('status', 'closed')
      .or('close_reason.is.null,close_reason.neq.cancelled')
    data = r.data as typeof data
    fetchErr = r.error
  }
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  interface Row {
    id: string
    maNumber: string | null
    insuredName: string | null
    insuranceCompany: string | null
    vehicle: string | null
    closedAt: string | null
    award: number | null
    insCoOffer: number | null
    oaValue: number | null
    maAcv: number | null
    deltaInsCo: number | null
    deltaMA: number | null
    deltaOA: number | null
    // Henry 2026-10-15: lets the UI filter out umpire claims from KPIs.
    // Null when the column doesn't exist yet (pre-migration).
    proceededToUmpire: boolean
  }

  const rows: Row[] = []
  for (const r of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claim: any = (r as any).claim ?? {}
    // Filter to ACV claim type only. Three cases:
    //   1. Empty `claimTypes`: legacy claim — pass through (back-compat).
    //   2. Includes 'other': always skip. 'Other' is the "unlock everything"
    //      marker on non-ACV workflows (anything from a quick desk task to
    //      a complex multi-tool review). These never settle as a strict
    //      ACV and would skew every KPI if included.
    //   3. Otherwise: must explicitly include 'acv' to count.
    const types: string[] = Array.isArray(claim.claimTypes) ? claim.claimTypes : []
    if (types.includes('other')) continue
    if (types.length > 0 && !types.includes('acv')) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notes: any = (r as any).reports_state?.notesData ?? {}
    // Field is "present" when it's a finite number. $0 is a legitimate value
    // (cancelled claim, denied settlement) and should count toward averages,
    // not be reported as "missing". The old `> 0` guard dropped real zeros.
    const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    // Three possible storage sites for the award amount, in order of trust:
    //   1. notesData.agreementAmountNum — written by BOTH the Award tab AND
    //      the Closing Notes tab (richest source; populated whenever either
    //      form is used).
    //   2. awardData.acvAmountNum       — only written by the Award tab, and
    //      its initial state default is literally `0`, so a bare 0 here
    //      almost always means "field never touched" rather than "cancelled
    //      claim settled at $0".
    //   3. notesData.acvAmountNum       — legacy; no current writer.
    // Prefer any NON-zero candidate (handles the ~121 historical claims
    // where only `agreementAmountNum` was filled in). Fall back to a bare 0
    // only when no non-zero source exists, so a deliberate $0 still counts.
    const agreementAmount    = asNum(notes.agreementAmountNum)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awardFromAwardData = asNum((r as any).reports_state?.awardData?.acvAmountNum)
    const awardFromNotesData = asNum(notes.acvAmountNum)
    const awardCandidates    = [agreementAmount, awardFromAwardData, awardFromNotesData]
    const nonZeroAward       = awardCandidates.find(c => c !== null && c !== 0)
    const anyZeroAward       = awardCandidates.some(c => c === 0)
    const award = nonZeroAward !== undefined ? nonZeroAward : (anyZeroAward ? 0 : null)
    const insCoOffer = asNum(notes.insuranceOfferNum)
    const oaValue = asNum(notes.appraiserValueNum)
    // MA ACV has two possible sources, in priority order:
    //   1. `notesData.maValueNum` — manual override typed into the Closing
    //      Notes "MA Value (ACV)" field. Admin can type any value here
    //      post-report; the Adjustments page shows an amber banner whenever
    //      this disagrees with the calculator so the mismatch isn't silent.
    //   2. `acv_history.acv` — the ACV calculator's output (`result.acv`
    //      saved on every save). Used when `maValueNum` is 0/unset.
    // Rationale for override-wins: when the admin manually corrects the MA
    // ACV in Closing Notes (e.g. after mid-flight comp changes, or a legacy
    // claim where the calculator produced a `-500` sentinel because no comps
    // were ever picked), Settlement Analytics must follow the typed value —
    // that's the number Modern Appraisers actually represented to the
    // insurance company. The ≤ 0 cases on both sources count as missing
    // since the only non-positive values we see today are half-filled-form
    // sentinels, never a legitimate MA ACV.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acvCol = asNum((r as any).acv)
    const maFromNotes = asNum(notes.maValueNum)
    const maAcv =
      maFromNotes !== null && maFromNotes > 0 ? maFromNotes
      : acvCol !== null && acvCol > 0 ? acvCol
      : null

    rows.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: (r as any).id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maNumber: (r as any).ma_number ?? null,
      insuredName: claim.insuredName ?? null,
      insuranceCompany: typeof claim.insuranceCompany === 'string' && claim.insuranceCompany.trim() ? claim.insuranceCompany.trim() : null,
      vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' ') || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      closedAt: (r as any).closed_at ?? null,
      award,
      insCoOffer,
      oaValue,
      maAcv,
      deltaInsCo: award !== null && insCoOffer !== null ? award - insCoOffer : null,
      deltaMA:    award !== null && maAcv      !== null ? award - maAcv      : null,
      deltaOA:    award !== null && oaValue    !== null ? award - oaValue    : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proceededToUmpire: (r as any).proceeded_to_umpire === true,
    })
  }

  // KPIs (missing counts, averages, non-settlement filter, violations) are
  // all computed CLIENT-SIDE over the Ins. Co.-filtered subset — see the
  // `kpis` useMemo in `settlement-analytics-client.tsx`. The server used to
  // return naive averages here but they shadowed the correct client-side
  // numbers and were never read by the UI, so they're dropped.

  return NextResponse.json({
    totalClaims: rows.length,
    claims: rows,
  })
}
