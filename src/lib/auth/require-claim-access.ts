import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'

interface CallerContext {
  userId: string
  role: Role
}

// Returns success only if the caller is authenticated AND has access to the
// claim (admin, or the claim's assignee). Otherwise returns a 401/403/404
// response ready to return from the route.
export async function requireClaimAccess(claimId: string): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle()
  if (!profile) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }

  const role = profile.role as Role
  if (role !== 'admin') {
    const { data: claim } = await supabase
      .from('acv_history')
      .select('assigned_to')
      .eq('id', claimId)
      .maybeSingle()
    if (!claim) {
      return { caller: null, errorResponse: NextResponse.json({ error: 'Claim not found' }, { status: 404 }) }
    }
    if (claim.assigned_to !== user.id) {
      return { caller: null, errorResponse: NextResponse.json({ error: 'No access to this claim' }, { status: 403 }) }
    }
  }

  return { caller: { userId: user.id, role }, errorResponse: null }
}
