import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// DELETE /api/insurance-guidelines/empty
// Removes every guideline row whose `guidelines` text is empty or
// whitespace-only. Admin-only. Returns the count deleted.
export async function DELETE() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()

  // Find all empty rows first (so we can return the exact deleted count).
  // Uses regex '^\s*$' — matches empty or whitespace-only.
  const { data: candidates, error: selErr } = await service
    .from('insurance_guidelines')
    .select('id, guidelines')
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

  const emptyIds = ((candidates ?? []) as { id: string; guidelines: string }[])
    .filter(r => !r.guidelines || r.guidelines.trim() === '')
    .map(r => r.id)

  if (emptyIds.length === 0) return NextResponse.json({ deleted: 0 })

  const { error: delErr } = await service
    .from('insurance_guidelines')
    .delete()
    .in('id', emptyIds)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ deleted: emptyIds.length })
}
