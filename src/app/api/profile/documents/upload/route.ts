import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateUploadedFile } from '@/lib/appraiser-doc-upload'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

// POST /api/profile/documents/upload — appraisers can upload their own.
// Mirrors /api/admin/appraiser-documents/upload but forces user_id to the
// caller. Admins can use the admin route to upload on behalf of someone.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  const kind = form.get('kind')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  const validation = validateUploadedFile(file)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const service = createServiceClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 })

  const { data, error: insertErr } = await service.from('appraiser_documents').insert({
    user_id: user.id,
    name: file.name,
    kind: typeof kind === 'string' && kind ? kind : null,
    storage_path: storagePath,
    size_bytes: file.size,
    content_type: file.type || null,
    uploaded_by: user.id,
  }).select().single()

  if (insertErr) {
    await service.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: insertErr.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, document: data })
}
