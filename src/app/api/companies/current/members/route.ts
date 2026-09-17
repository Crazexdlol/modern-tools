import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/companies/current/members
// Returns the userIds of every user with access to the caller's active
// company. Used to filter the Handling Appraiser + Reassign dropdowns so
// they only show appraisers who can actually work claims in the current
// company. Returns { userIds: string[] }.
// Pre-migration (or if the caller has no active company): returns { userIds: [] }
// which the client falls back to "show all" for backward compat.
export async function GET() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  if (!caller!.activeCompanyId) {
    return NextResponse.json({ userIds: [] })
  }
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_companies')
    .select('user_id')
    .eq('company_id', caller!.activeCompanyId)
  if (error) {
    // 42P01 = table missing (pre-migration). Fall through to unfiltered.
    if (error.code === '42P01') return NextResponse.json({ userIds: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const userIds = ((data ?? []) as { user_id: string }[]).map(r => r.user_id)
  return NextResponse.json({ userIds })
}
