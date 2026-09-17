import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/companies — returns the caller's companies + their active one.
// Response: { activeCompanyId: string | null, companies: Company[] }
export async function GET() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_companies')
    .select('company_id, companies(id, slug, name, logo_path, brand_color)')
    .eq('user_id', caller!.userId)
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Supabase-js sometimes types the join relation as an array — normalize.
  type CompanyRow = { id: string; slug: string; name: string; logo_path: string; brand_color: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as Array<{ companies: CompanyRow | CompanyRow[] | null }>
  const companies: CompanyRow[] = rows
    .flatMap(r => Array.isArray(r.companies) ? r.companies : (r.companies ? [r.companies] : []))

  return NextResponse.json({
    activeCompanyId: caller!.activeCompanyId,
    companies,
  })
}
