import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLockoutStateForUser } from '@/lib/supabase/lockout'
import { ClaimWorkspace } from '@/components/claim/ClaimWorkspace'

export default async function ClaimPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)

  if (id === 'new') {
    // New-claim entry — if the user is locked out, don't let them start
    // a new file; send them to the dashboard gate instead.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const lockout = await getLockoutStateForUser(user.id)
      if (lockout.isLocked) redirect('/')
    }
    return <ClaimWorkspace claimId="new" />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.role === 'admin'

  // Admins skip the ownership check; appraisers must be the assignee.
  if (!isAdmin) {
    const { data: claim } = await supabase
      .from('acv_history')
      .select('assigned_to')
      .eq('id', id)
      .maybeSingle()
    // RLS already filters this — if the appraiser can't see the row, `claim` is null.
    if (!claim || claim.assigned_to !== user.id) notFound()
  }

  // Lockout: if the viewer has overdue claims, they can only access those
  // specific claims. Everything else sends them to the dashboard gate.
  // Admins are never locked out (getLockoutStateForUser short-circuits).
  const lockout = await getLockoutStateForUser(user.id)
  if (lockout.isLocked && !lockout.overdueClaimIds.has(id)) redirect('/')

  // When this specific claim is locked for this viewer, the workspace renders
  // in a read-only mode with only the Messages tab live — see ClaimWorkspace
  // isLockedForMe comment for the UX. Admins are never flagged.
  const isLockedForMe = lockout.isLocked && lockout.overdueClaimIds.has(id)

  return <ClaimWorkspace claimId={id} isLockedForMe={isLockedForMe} />
}
