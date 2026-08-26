import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { name?: string; role?: 'admin' | 'appraiser' } | null
  if (!body || (body.name === undefined && body.role === undefined)) {
    return NextResponse.json({ error: 'name and/or role is required' }, { status: 400 })
  }
  if (body.role !== undefined && !['admin', 'appraiser'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or appraiser' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = body.name
  if (body.role !== undefined) patch.role = body.role

  const { error } = await service.from('profiles').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  if (id === caller!.userId) {
    return NextResponse.json({ error: 'Admins cannot delete themselves' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // profiles cascades via ON DELETE CASCADE. Existing claims' assigned_to
  // becomes null via ON DELETE SET NULL.
  return NextResponse.json({ ok: true })
}
