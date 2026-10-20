import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'

export const runtime = 'nodejs'

// POST /api/claims/[id]/messages/read — mark this claim's messages as read
// for the caller. Upserts (user_id, claim_id) with last_read_at = now().
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params
  // Mark-as-read on a locked claim should still work — read tracking is
  // read-only semantics even though it writes to user_claim_views.
  const { caller, errorResponse } = await requireClaimAccess(claimId, { allowOnLockedClaim: true })
  if (errorResponse) return errorResponse

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const payload: Record<string, unknown> = {
    user_id: caller!.userId,
    claim_id: claimId,
    last_read_at: new Date().toISOString(),
  }
  if (caller!.activeCompanyId) payload.company_id = caller!.activeCompanyId
  const { error } = await supabase
    .from('message_reads')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: 'user_id,claim_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
