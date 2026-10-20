import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { escapePostgrestLike } from '@/lib/postgrest-escape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface ClaimSearchResult {
  id: string
  maNumber: string | null
  vehicle: string | null
  vin: string | null
  status: string
  claimantName: string | null
  insuredName: string | null
  companyId: string | null
}

// Typeahead for the manual-match picker. Searches MA#, VIN, claimant/insured
// name, and the insurance claim number.
export async function GET(request: Request) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] as ClaimSearchResult[] })

  const supabase = createServiceClient()

  // Escape user input before interpolating into PostgREST .or() filters —
  // a `,` or `)` in q would otherwise break out of the clause and let the
  // caller inject additional predicates.
  const qSafe = escapePostgrestLike(q)

  // Try several columns in parallel — collect results, dedupe by id.
  const orClauses = [
    `ma_number.ilike.%${qSafe}%`,
    `vin.ilike.%${qSafe}%`,
    `vehicle.ilike.%${qSafe}%`,
  ].join(',')

  const { data: primary } = await supabase
    .from('acv_history')
    .select('id, ma_number, vehicle, vin, status, company_id, claim')
    .or(orClauses)
    .limit(15)

  // JSONB name search — Supabase doesn't allow OR across jsonb path filters
  // in one call, so do a small extra query.
  const { data: byName } = await supabase
    .from('acv_history')
    .select('id, ma_number, vehicle, vin, status, company_id, claim')
    .or(`claim->>clientName.ilike.%${qSafe}%,claim->>insuredName.ilike.%${qSafe}%,claim->>claimantName.ilike.%${qSafe}%,claim->>claimNumber.ilike.%${qSafe}%`)
    .limit(15)

  const byId = new Map<string, ClaimSearchResult>()
  for (const row of [...(primary ?? []), ...(byName ?? [])]) {
    if (byId.has(row.id)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (row.claim ?? {}) as any
    byId.set(row.id, {
      id: row.id,
      maNumber: row.ma_number,
      vehicle: row.vehicle,
      vin: row.vin,
      status: row.status,
      claimantName: c.claimantName ?? c.clientName ?? null,
      insuredName: c.insuredName ?? null,
      companyId: row.company_id,
    })
  }

  // Prefer open claims first.
  const results = Array.from(byId.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return (a.maNumber ?? '').localeCompare(b.maNumber ?? '')
  }).slice(0, 15)

  return NextResponse.json({ results })
}
