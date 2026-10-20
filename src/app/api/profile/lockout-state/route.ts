import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLockoutStateForUser } from '@/lib/supabase/lockout'

export const runtime = 'nodejs'

// GET /api/profile/lockout-state
// Returns the caller's current lockout state so the lockout gate can poll
// and auto-reload when the lockout clears (e.g. the user posted a status
// message in another tab, or an admin reassigned the overdue claim).
//
// Shape: { isLocked: boolean, overdueClaimIds: string[] }
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const state = await getLockoutStateForUser(user.id)
  return NextResponse.json({
    isLocked: state.isLocked,
    overdueClaimIds: Array.from(state.overdueClaimIds),
  })
}
