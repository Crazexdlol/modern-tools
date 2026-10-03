import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// GET — fuzzy-search opposing appraisers by name (or name+company combined).
// Open to any authenticated user so claim pickers can query without admin role.
// Query params:
//   q     — search string (required, min 2 chars)
//   limit — max results (default 10)
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 50)

  if (q.length < 2) {
    return NextResponse.json({ opposingAppraisers: [] })
  }

  const service = createServiceClient()

  // Use ilike substring match against both name and company. Fast against the
  // trigram GIN indexes and returns results in under 150 ms for typical queries.
  // We match name OR company so typing a company name surfaces all its appraisers.
  const { data, error } = await service
    .from('opposing_appraisers')
    .select('*')
    .is('archived_at', null)
    .or(`name.ilike.%${q}%,company.ilike.%${q}%`)
    .order('name', { ascending: true })
    .limit(limit)

  if (error) {
    // 42P01 = table not yet created — return empty rather than crashing the picker.
    if (error.code === '42P01' || error.code === '42703') {
      return NextResponse.json({ opposingAppraisers: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ opposingAppraisers: data ?? [] })
}
