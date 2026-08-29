import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const form = await request.formData()
  const userId = form.get('userId')
  const file = form.get('file')
  const kind = form.get('kind')

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }

  const service = createServiceClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 })

  const { data, error: insertErr } = await service.from('appraiser_documents').insert({
    user_id: userId,
    name: file.name,
    kind: typeof kind === 'string' && kind ? kind : null,
    storage_path: storagePath,
    size_bytes: file.size,
    content_type: file.type || null,
    uploaded_by: caller!.userId,
  }).select().single()

  if (insertErr) {
    // Best-effort cleanup — if the metadata insert fails, remove the orphan blob
    await service.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: insertErr.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, document: data })
}
