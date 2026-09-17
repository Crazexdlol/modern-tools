import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'

interface CallerContext {
  userId: string
  role: Role
  activeCompanyId: string | null
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

  // Fetch profile with active_company_id if the column exists; fall back if not.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profile: any = null
  const full = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, role, active_company_id' as any)
    .eq('id', user.id)
    .maybeSingle()
  if (full.error && full.error.code === '42703') {
    const legacy = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle()
    profile = legacy.data
  } else {
    profile = full.data
  }
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

  return {
    caller: {
      userId: user.id,
      role,
      activeCompanyId: profile.active_company_id ?? null,
    },
    errorResponse: null,
  }
}
