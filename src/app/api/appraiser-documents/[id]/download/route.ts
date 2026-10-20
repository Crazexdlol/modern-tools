import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const service = createServiceClient()

  const { data: row, error: fetchErr } = await service
    .from('appraiser_documents')
    .select('user_id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Self can view own; admin can view any.
  if (row.user_id !== caller!.userId && caller!.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // `download: true` forces Content-Disposition: attachment on the signed
  // URL response — so if an uploaded file ever slips past the mime guard
  // (e.g. .html / .svg) the browser downloads instead of rendering it,
  // closing the inline-XSS vector.
  const { data: signed, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 60, { download: true })
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? 'sign failed' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl })
}
