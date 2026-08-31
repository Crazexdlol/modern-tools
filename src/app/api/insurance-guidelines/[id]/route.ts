import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  if (typeof id !== 'string' || !id.trim()) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  const service = createServiceClient()
  // 404 explicitly if the row doesn't exist so the admin knows the click
  // did nothing (previously a bad id returned {ok:true} with 0 rows touched).
  const { data: existing } = await service
    .from('insurance_guidelines')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Guideline not found' }, { status: 404 })
  const { error } = await service.from('insurance_guidelines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
