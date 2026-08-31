import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/claims/duplicates?vin=X&claimNumber=Y&excludeId=Z
//
// Returns any OTHER claims (not `excludeId`) that share the same VIN and/or
// claim number. Uses the service client because appraisers only have access
// to their own claims via RLS — but we want to warn about duplicates across
// the whole book, not just theirs. Returns minimal identifying info per
// match (id, MA#, insured, vehicle, date) so the caller can render it.
//
// Any authenticated user can call. Matches are case-insensitive for VIN
// (VINs are canonically uppercase but users may type mixed case) and exact
// for claim number (they're formatted specifically per insurer).
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
  insuredName: string
  vehicle: string
  date: string
}

function rowToMatch(r: AcvRow): Match {
  return {
    id: r.id,
    maNumber: r.ma_number ?? '',
    insuredName: r.claim?.insuredName ?? '',
    vehicle: r.vehicle ?? '',
    date: r.date ?? '',
  }
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const vin = (url.searchParams.get('vin') ?? '').trim()
  const claimNumber = (url.searchParams.get('claimNumber') ?? '').trim()
  const excludeId = url.searchParams.get('excludeId') ?? null

  if (!vin && !claimNumber) {
    return NextResponse.json({ vinMatches: [], claimNumberMatches: [] })
  }

  const service = createServiceClient()

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

  return NextResponse.json({ vinMatches, claimNumberMatches })
}
