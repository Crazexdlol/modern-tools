import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALL_CODES = ['main', 'qc', 'billing_delivery', 'payment'] as const
type Code = typeof ALL_CODES[number]

// GET — list the user's current dashboard grants.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await ctx.params
  const service = createServiceClient()
  const { data, error } = await service
    .from('user_dashboard_access')
    .select('dashboard_code, granted_at')
    .eq('user_id', id)
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ codes: [], migrationPending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ codes: (data ?? []).map(r => r.dashboard_code) })
}

// PUT — replace the user's dashboard grants with the provided set.
// Body: { codes: ("main"|"qc"|"billing_delivery"|"payment")[] }
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { codes?: string[] }
  if (!Array.isArray(body.codes)) {
    return NextResponse.json({ error: 'codes[] required' }, { status: 400 })
  }
  const wanted = new Set<Code>()
  for (const c of body.codes) {
    if ((ALL_CODES as readonly string[]).includes(c)) wanted.add(c as Code)
  }

  const service = createServiceClient()

  // Fetch current grants to compute add/remove sets (lets us leave granted_at
  // untouched on rows we're keeping).
  const { data: existing, error: readErr } = await service
    .from('user_dashboard_access')
    .select('dashboard_code')
    .eq('user_id', id)
  if (readErr) {
    if (readErr.code === '42P01') return NextResponse.json({ error: 'Migration pending' }, { status: 503 })
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }
  const current = new Set<Code>((existing ?? []).map(r => r.dashboard_code as Code))
  const toAdd: Code[] = [...wanted].filter(c => !current.has(c))
  const toRemove: Code[] = [...current].filter(c => !wanted.has(c))

  if (toRemove.length > 0) {
    const { error } = await service
      .from('user_dashboard_access')
      .delete()
      .eq('user_id', id)
      .in('dashboard_code', toRemove)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (toAdd.length > 0) {
    const { error } = await service
      .from('user_dashboard_access')
      .insert(toAdd.map(code => ({ user_id: id, dashboard_code: code, granted_by: caller!.userId })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, codes: [...wanted].sort() })
}
