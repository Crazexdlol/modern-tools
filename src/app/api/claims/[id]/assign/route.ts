import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { assignedTo?: string | null } | null
  if (body === null || (body.assignedTo !== null && typeof body.assignedTo !== 'string')) {
    return NextResponse.json({ error: 'assignedTo (uuid string or null) required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('acv_history')
    .update({ assigned_to: body.assignedTo })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
