import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// DELETE /api/insurance-guidelines/all
// Deletes every guideline row. Admin-only. Returns the count deleted.
// Use this before a fresh reimport to guarantee a clean slate.
export async function DELETE() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()
  const { data: rows, error: selErr } = await service
    .from('insurance_guidelines')
    .select('id')
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  const ids = ((rows ?? []) as { id: string }[]).map(r => r.id)
  if (ids.length === 0) return NextResponse.json({ deleted: 0 })

  const { error: delErr } = await service
    .from('insurance_guidelines')
    .delete()
    .in('id', ids)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ deleted: ids.length })
}
