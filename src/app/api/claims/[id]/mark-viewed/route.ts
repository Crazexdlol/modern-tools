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

  const { error } = await supabase
    .from('user_claim_views')
    .upsert({ user_id: user.id, claim_id: id, opened_at: new Date().toISOString() }, {
      onConflict: 'user_id,claim_id',
    })

  // 42P01 = table doesn't exist (migration not yet run). Silently no-op so
  // the client isn't broken during the migration window.
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
