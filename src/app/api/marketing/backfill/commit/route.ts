// POST /api/marketing/backfill/commit — accepts Henry's approved clusters
// and creates client records + backfills acv_history.client_id for every
// claim whose ClaimInfo.clientName is one of the cluster's variants.
//
// Body shape:
// {
//   approvals: Array<{
//     canonicalName: string
//     type: 'adjuster' | 'body_shop' | 'attorney' | 'insurance_company'
//     variants: string[] // raw clientName values to match on
//   }>
// }
//
// Skips (Henry marked skip) simply don't appear in the approvals list.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 300

interface Approval {
  canonicalName: string
  type: 'adjuster' | 'body_shop' | 'attorney' | 'insurance_company'
  variants: string[]
}

export async function POST(request: NextRequest) {
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: prof } = await supa.from('profiles').select('marketing_access').eq('id', user.id).maybeSingle()
  if (!prof || prof.marketing_access !== true) {
    return NextResponse.json({ error: 'marketing access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { approvals?: Approval[] } | null
  const approvals = Array.isArray(body?.approvals) ? body!.approvals! : []
  if (approvals.length === 0) {
    return NextResponse.json({ error: 'no approvals to commit' }, { status: 400 })
  }

  const service = createServiceClient()
  const results = {
    clientsCreated: 0,
    clientsReused: 0,
    claimsBackfilled: 0,
    failures: [] as Array<{ canonicalName: string; error: string }>,
  }

  // Pull existing clients once so we can reuse a canonical name that already
  // exists (case-insensitive match on name).
  const { data: existing } = await service.from('clients').select('id, name').is('archived_at', null)
  const existingByLower = new Map<string, string>()
  for (const c of (existing ?? [])) existingByLower.set(c.name.toLowerCase(), c.id)

  for (const a of approvals) {
    const canonical = a.canonicalName.trim()
    if (!canonical) continue

    // Reuse or create.
    let clientId = existingByLower.get(canonical.toLowerCase()) ?? null
    if (clientId) {
      results.clientsReused += 1
    } else {
      const { data: created, error: createErr } = await service.from('clients').insert({
        name: canonical, type: a.type, created_by: user.id,
      }).select('id').single()
      if (createErr || !created) {
        results.failures.push({ canonicalName: canonical, error: createErr?.message ?? 'insert failed' })
        continue
      }
      clientId = created.id
      results.clientsCreated += 1
    }

    // Backfill every claim whose ClaimInfo.clientName matches one of the variants.
    for (const variant of a.variants) {
      const v = variant.trim()
      if (!v) continue
      // Supabase-js jsonb equality via `claim->>clientName eq value` — use
      // the filter form so we don't have to write raw SQL.
      const { data: updated, error: updErr } = await service
        .from('acv_history')
        .update({ client_id: clientId })
        .filter('claim->>clientName', 'eq', v)
        .is('client_id', null)
        .select('id')
      if (updErr) {
        results.failures.push({ canonicalName: canonical, error: `variant "${v}": ${updErr.message}` })
        continue
      }
      results.claimsBackfilled += (updated?.length ?? 0)
    }
  }

  return NextResponse.json(results)
}
