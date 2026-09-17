import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/admin/users/[id]/companies → { companyIds: string[] }
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse
  const { id: targetUserId } = await params
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_companies')
    .select('company_id')
    .eq('user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companyIds: ((data ?? []) as { company_id: string }[]).map(r => r.company_id) })
}

// PUT /api/admin/users/[id]/companies { companyIds: string[] }
// Syncs user_companies for the target user to exactly `companyIds`.
// Repoints active_company_id to a remaining company (or null) if the current
// active_company_id got revoked in the update.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id: targetUserId } = await params
  const body = await request.json().catch(() => null) as { companyIds?: unknown } | null
  if (!body || !Array.isArray(body.companyIds)) {
    return NextResponse.json({ error: 'body { companyIds: string[] } required' }, { status: 400 })
  }
  const desired = new Set(body.companyIds.filter((v): v is string => typeof v === 'string'))

  const svc = createServiceClient()

  const { data: current } = await svc
    .from('user_companies')
    .select('company_id')
    .eq('user_id', targetUserId)
  const currentSet = new Set(((current ?? []) as { company_id: string }[]).map(r => r.company_id))

  const toAdd = [...desired].filter(id => !currentSet.has(id))
  const toRemove = [...currentSet].filter(id => !desired.has(id))

  if (toAdd.length > 0) {
    const { error } = await svc.from('user_companies').insert(
      toAdd.map(company_id => ({ user_id: targetUserId, company_id, granted_by: caller!.userId })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (toRemove.length > 0) {
    const { error } = await svc
      .from('user_companies')
      .delete()
      .eq('user_id', targetUserId)
      .in('company_id', toRemove)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Repoint active_company_id if the current one got revoked.
  const { data: prof } = await svc
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('active_company_id' as any).eq('id', targetUserId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeId = (prof as any)?.active_company_id as string | null | undefined
  if (activeId && !desired.has(activeId)) {
    const fallback = [...desired][0] ?? null
    await svc
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ active_company_id: fallback } as any)
      .eq('id', targetUserId)
  }

  return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length })
}
