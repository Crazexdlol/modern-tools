import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'

// DELETE /api/insurance-guidelines/all
// Deletes every guideline row IN THE CALLER'S ACTIVE COMPANY. Admin-only.
// Returns the count deleted. Use before a fresh reimport within a company.
export async function DELETE() {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService
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
