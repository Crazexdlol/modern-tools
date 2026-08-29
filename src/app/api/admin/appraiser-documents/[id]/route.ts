import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  const { data: row, error: fetchErr } = await service
    .from('appraiser_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await service.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await service.from('appraiser_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
