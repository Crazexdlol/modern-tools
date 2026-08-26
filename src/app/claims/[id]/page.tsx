import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClaimWorkspace } from '@/components/claim/ClaimWorkspace'

export default async function ClaimPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)

  if (id === 'new') return <ClaimWorkspace claimId="new" />

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

  return <ClaimWorkspace claimId={id} />
}
