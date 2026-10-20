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
//
// Lockout behavior:
//   - If the caller has OTHER open claims with status_lockout_at and the
//     target claim is NOT locked, every route rejects with 423 (dashboard
//     lockdown).
//   - If the TARGET claim is locked, non-admin writes are rejected with 423
//     UNLESS the route opts in via `{ allowOnLockedClaim: true }` — this
//     bypass is reserved for the messaging routes, which are the only path
//     an appraiser can take to unlock the claim.
export async function requireClaimAccess(
  claimId: string,
  options: { allowOnLockedClaim?: boolean } = {},
): Promise<
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('assigned_to, status_lockout_at' as any)
      .eq('id', claimId)
      .maybeSingle()
    if (!claim) {
      return { caller: null, errorResponse: NextResponse.json({ error: 'Claim not found' }, { status: 404 }) }
    }
    const claimRow = claim as unknown as { assigned_to: string | null; status_lockout_at: string | null }
    if (claimRow.assigned_to !== user.id) {
      return { caller: null, errorResponse: NextResponse.json({ error: 'No access to this claim' }, { status: 403 }) }
    }

    // Status-request lockout: if the caller has any OTHER open claim with
    // status_lockout_at set, they're locked out everywhere except on those
    // overdue claims. Writes to a non-overdue claim get rejected until they
    // post a status on each locked claim. Non-admins only; admins bypass.
    //
    // Fail-closed: only 42703 (column missing on a pre-migration deploy)
    // is treated as "not locked". Any other error means we can't confirm
    // the caller is unlocked, so we refuse the write with 500 rather than
    // silently allowing it.
    const { data: otherLocked, error: lockoutErr } = await supabase
      .from('acv_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id' as any)
      .eq('assigned_to', user.id)
      .eq('status', 'open')
      .not('status_lockout_at', 'is', null)
      .neq('id', claimId)
      .limit(1)
    if (lockoutErr && lockoutErr.code !== '42703') {
      console.error('requireClaimAccess: lockout check failed', lockoutErr)
      return {
        caller: null,
        errorResponse: NextResponse.json(
          { error: 'Could not verify lockout state. Try again.' },
          { status: 500 },
        ),
      }
    }
    if (!lockoutErr && otherLocked && otherLocked.length > 0 && !claimRow.status_lockout_at) {
      return {
        caller: null,
        errorResponse: NextResponse.json(
          { error: 'Status required — you have overdue claims that must be updated first.' },
          { status: 423 }, // 423 Locked
        ),
      }
    }

    // Current claim is locked: every write is rejected except on routes that
    // explicitly opted in (messaging). Appraiser must post a non-auto message
    // on this claim via the Messages tab to clear the lockout; nothing else
    // in the workspace should mutate state while locked.
    if (claimRow.status_lockout_at && !options.allowOnLockedClaim) {
      return {
        caller: null,
        errorResponse: NextResponse.json(
          { error: 'This claim is locked — post a status in Messages to unlock it before making other changes.' },
          { status: 423 },
        ),
      }
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
