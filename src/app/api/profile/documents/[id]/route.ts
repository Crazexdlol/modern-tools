import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const BUCKET = 'appraiser-documents'

// DELETE /api/profile/documents/[id] — appraisers can delete their own docs.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const service = createServiceClient()
  const { data: row, error: fetchErr } = await service
    .from('appraiser_documents')
    .select('user_id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your document' }, { status: 403 })
  }

  await service.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await service.from('appraiser_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
