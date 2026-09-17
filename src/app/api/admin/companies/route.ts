import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/admin/companies — full company list for the admin UI checkbox panel.
// Every admin can see all companies (needed to grant/revoke access).
export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('companies')
    .select('id, slug, name, logo_path, brand_color')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}
