import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'

// Response includes both `count` (always the true number of matches) and
// `matches` (per-row detail — admins only; non-admins get an empty array
// so they can't enumerate the whole book by VIN or claim number).

// GET /api/claims/duplicates?vin=X&claimNumber=Y&maNumber=Z&excludeId=W
//
// Returns any OTHER claims (not `excludeId`) that share the same VIN, claim
// number, or MA number. Uses the service client because appraisers only have
// access to their own claims via RLS — but we want to warn about duplicates
// across the whole book, not just theirs. Returns minimal identifying info
// per match (id, MA#, CL#, insured, vehicle, date) so the caller can render.
//
// Any authenticated user can call. VIN match is case-insensitive (VINs are
// canonically uppercase but users may type mixed case); claim # is exact
// (formatted specifically per insurer); MA # match is case-insensitive.
interface AcvRow {
  id: string
  ma_number: string | null
  vehicle: string | null
  vin: string | null
  date: string | null
  claim: { insuredName?: string; claimNumber?: string } | null
}

interface Match {
  id: string
  maNumber: string
  claimNumber: string
  insuredName: string
  vehicle: string
  date: string
}

function rowToMatch(r: AcvRow): Match {
  return {
    id: r.id,
    maNumber: r.ma_number ?? '',
    claimNumber: r.claim?.claimNumber ?? '',
    insuredName: r.claim?.insuredName ?? '',
    vehicle: r.vehicle ?? '',
    date: r.date ?? '',
  }
}

export async function GET(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const vin = (url.searchParams.get('vin') ?? '').trim()
  const claimNumber = (url.searchParams.get('claimNumber') ?? '').trim()
  const maNumber = (url.searchParams.get('maNumber') ?? '').trim()
  const excludeId = url.searchParams.get('excludeId') ?? null

  if (!vin && !claimNumber && !maNumber) {
    return NextResponse.json({
      vinMatches: [], vinCount: 0,
      claimNumberMatches: [], claimNumberCount: 0,
      maNumberMatches: [], maNumberCount: 0,
    })
  }

  // Duplicates search is scoped to the caller's active company — a Modern
  // Appraisers user searching by VIN won't get matches from Eagleview claims
  // (and vice versa). Falls back to unscoped raw service client when the
  // caller has no active company (pre-migration; column doesn't exist yet).
  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService
  const isAdmin = caller!.role === 'admin'

  let vinMatches: Match[] = []
  if (vin) {
    let q = service
      .from('acv_history')
      .select('id, ma_number, vehicle, vin, date, claim')
      .ilike('vin', vin)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    vinMatches = ((data as AcvRow[]) ?? []).map(rowToMatch)
  }

  let claimNumberMatches: Match[] = []
  if (claimNumber) {
    let q = service
      .from('acv_history')
      .select('id, ma_number, vehicle, vin, date, claim')
      .eq('claim->>claimNumber', claimNumber)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    claimNumberMatches = ((data as AcvRow[]) ?? []).map(rowToMatch)
  }

  let maNumberMatches: Match[] = []
  if (maNumber) {
    let q = service
      .from('acv_history')
      .select('id, ma_number, vehicle, vin, date, claim')
      .ilike('ma_number', maNumber)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    maNumberMatches = ((data as AcvRow[]) ?? []).map(rowToMatch)
  }

  // Redact per-row detail for non-admins: they still get the count (so the
  // "duplicate" warning still fires) but not the MA# / insured name /
  // vehicle of claims they don't otherwise have access to.
  return NextResponse.json({
    vinMatches: isAdmin ? vinMatches : [],
    vinCount: vinMatches.length,
    claimNumberMatches: isAdmin ? claimNumberMatches : [],
    claimNumberCount: claimNumberMatches.length,
    maNumberMatches: isAdmin ? maNumberMatches : [],
    maNumberCount: maNumberMatches.length,
  })
}
