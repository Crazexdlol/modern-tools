import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { escapePostgrestLike } from '@/lib/postgrest-escape'

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
  const all = searchParams.get('all') === '1'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10) || 10, 500)

  if (!all && q.length < 2) {
    return NextResponse.json({ opposingAppraisers: [] })
  }

  const service = createServiceClient()

  // Use ilike substring match against both name and company. Fast against the
  // trigram GIN indexes and returns results in under 150 ms for typical queries.
  // We match name OR company so typing a company name surfaces all its appraisers.
  let query = service
    .from('opposing_appraisers')
    .select('*')
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(all ? 500 : limit)
  if (!all) {
    const qSafe = escapePostgrestLike(q)
    query = query.or(`name.ilike.%${qSafe}%,company.ilike.%${qSafe}%`)
  }
  const { data, error } = await query

  if (error) {
    // 42P01 = table not yet created — return empty rather than crashing the picker.
    if (error.code === '42P01' || error.code === '42703') {
      return NextResponse.json({ opposingAppraisers: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ opposingAppraisers: data ?? [] })
}
