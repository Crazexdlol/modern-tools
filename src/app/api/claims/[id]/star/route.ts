// POST /api/claims/[id]/star  { starred: boolean }
// Team-wide star toggle. Writes via the caller's cookie session so RLS +
// the appraiser column-guard trigger enforce access. If the trigger says
// the appraiser can't star (starred isn't in that guard's whitelist), the
// update will fail — that matches intent: only admins / claim assignees
// can star.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { errorResponse } = await requireClaimAccess(id)
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { starred?: boolean } | null
  if (!body || typeof body.starred !== 'boolean') {
    return NextResponse.json({ error: 'starred boolean required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* API routes never set cookies via this path */ },
      },
    }
  )
  const { error } = await supabase.from('acv_history').update({ starred: body.starred }).eq('id', id)
  if (error) {
    // 42703 = column not yet migrated. Surface a clear error so the UI can
    // show a helpful message instead of a generic failure.
    if (error.code === '42703') {
      return NextResponse.json({ error: 'star column not migrated yet — run supabase/migration-star-claims.sql' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, starred: body.starred })
}
