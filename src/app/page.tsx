import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLockoutStateForUser } from '@/lib/supabase/lockout'
import { LockoutGate } from '@/components/lockout-gate'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Middleware already blocks unauthenticated requests, but keep a belt
  // check so the lockout fetch below never runs with a null user id.
  if (!user) redirect('/login')

  const lockout = await getLockoutStateForUser(user.id)
  if (lockout.isLocked) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()
    return (
      <LockoutGate
        overdueClaimIds={Array.from(lockout.overdueClaimIds)}
        userName={profile?.name ?? null}
        userId={user.id}
      />
    )
  }

  return <DashboardClient />
}
