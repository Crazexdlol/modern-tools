import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/claims/[id]/mark-viewed
// Upserts (auth.uid(), claim_id, now()) into user_claim_views.
// Fire-and-forget from the client; failures are silent (a missed mark is
// cosmetic only — the dashboard will just keep showing gray).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Fetch caller's active_company_id (post-migration) so the upsert satisfies
  // the user_claim_views RLS WITH CHECK. Pre-migration we skip the column
  // and RLS falls back to the legacy user_id predicate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeCompanyId: string | null = null
  const prof = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('active_company_id' as any)
    .eq('id', user.id)
    .maybeSingle()
  if (!prof.error && prof.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeCompanyId = (prof.data as any).active_company_id ?? null
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    claim_id: id,
    opened_at: new Date().toISOString(),
  }
  if (activeCompanyId) payload.company_id = activeCompanyId

  const { error } = await supabase
    .from('user_claim_views')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: 'user_id,claim_id' })

  // 42P01 = table doesn't exist (migration not yet run). Silently no-op so
  // the client isn't broken during the migration window.
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
