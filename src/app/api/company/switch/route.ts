import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// POST /api/company/switch  { companyId: uuid }
// Changes the caller's active_company_id after verifying they have access to
// the target company via user_companies. Client should reload the page after
// this returns 200 so all in-memory state resets to the new company.
export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => ({}))
  const companyId = typeof body?.companyId === 'string' ? body.companyId : null
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const service = createServiceClient()

  // Verify caller has access to the target company.
  const { data: access, error: accessErr } = await service
    .from('user_companies')
    .select('company_id')
    .eq('user_id', caller!.userId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (accessErr && accessErr.code === '42P01') {
    // user_companies table doesn't exist yet — pre-migration. Refuse.
    return NextResponse.json({ error: 'Multi-company support not enabled yet' }, { status: 503 })
  }
  if (!access) return NextResponse.json({ error: 'No access to that company' }, { status: 403 })

  const { error: updateErr } = await service
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ active_company_id: companyId } as any)
    .eq('id', caller!.userId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, companyId })
}
