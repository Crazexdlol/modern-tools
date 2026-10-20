import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/admin/clients
//
// Returns every non-archived client via service role, bypassing the clients
// table's marketing_access RLS gate. Admin-only.
//
// Why: the browser-side `fetchAllClients()` relies on direct Supabase reads,
// which RLS restricts to users carrying `profiles.marketing_access = true`.
// Several admins deliberately don't have that flag (they don't do marketing
// work), so admin-only tooling like Settlement Analytics couldn't see any
// clients when they opened it — the picker was empty and the whole page was
// useless. This route gives admin surfaces a clean service-role read without
// relaxing the marketing_access gate on the Marketing tab itself.
export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()
  const { data, error } = await service
    .from('clients')
    .select('*')
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Shape rows into the browser-side `Client` interface (camelCase) so the
  // caller can drop in without refactoring. Mirrors `rowToClient` in
  // `src/lib/supabase/clients.ts` — kept inline to avoid pulling the
  // browser-only Supabase helper import into this server route.
  const allowedTypes = ['adjuster', 'body_shop', 'attorney', 'insurance_company']
  const clients = (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    type: allowedTypes.includes(r.type) ? r.type : 'adjuster',
    addressLine: r.address_line,
    city: r.city,
    state: r.state,
    zip: r.zip,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    email: r.email,
    website: r.website,
    notes: r.notes,
    lastMarketedAt: r.last_marketed_at,
    remarketIntervalDays: r.remarket_interval_days,
    nextRemarketAt: r.next_remarket_at,
    reminderSentAt: r.reminder_sent_at,
    archivedAt: r.archived_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
  return NextResponse.json({ clients })
}
