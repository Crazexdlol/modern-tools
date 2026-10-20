// Status-request lockout state for a given user. "Locked" means the auto
// status-request cron hit the 5-business-day silence threshold on at least
// one of the user's open assigned claims — they're blocked from the rest of
// their work until they post a status on the overdue claim(s). See
// supabase/migration-status-lockout.sql and the cron at
// src/app/api/cron/status-requests/route.ts for the mechanism.

import { createClient } from './server'

export interface LockedClaim {
  id: string
  maNumber: string | null
  insuredName: string | null
  vehicle: string | null
  lockedAt: string
}

export interface LockoutState {
  isLocked: boolean
  overdueClaimIds: Set<string>
  overdueClaims: LockedClaim[]
}

const EMPTY: LockoutState = {
  isLocked: false,
  overdueClaimIds: new Set(),
  overdueClaims: [],
}

// Admins + super-admins are never locked out. Appraisers are locked when
// any of their open assigned claims has status_lockout_at set. Called from
// server components (dashboard, claim page) and API guards.
export async function getLockoutStateForUser(userId: string): Promise<LockoutState> {
  const supabase = await createClient()

  // Admin fast-path. One extra query, but it's cached per-request by Next.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return EMPTY
  if (profile.role === 'admin' || profile.is_super_admin === true) return EMPTY

  // Pre-migration deploy safety: if the column doesn't exist yet, treat as
  // no lockout. The 42703 fallback mirrors history.ts's pattern.
  const { data, error } = await supabase
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, ma_number, claim, status_lockout_at' as any)
    .eq('status', 'open')
    .eq('assigned_to', userId)
    .not('status_lockout_at', 'is', null)
  if (error) {
    if (error.code === '42703') return EMPTY
    console.error('getLockoutStateForUser failed:', error)
    return EMPTY
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    ma_number: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    claim: any
    status_lockout_at: string
  }>
  if (rows.length === 0) return EMPTY

  const overdueClaims: LockedClaim[] = rows.map(r => ({
    id: r.id,
    maNumber: r.ma_number,
    insuredName: r.claim?.insuredName ?? null,
    vehicle: [r.claim?.year, r.claim?.make, r.claim?.model].filter(Boolean).join(' ') || null,
    lockedAt: r.status_lockout_at,
  }))

  return {
    isLocked: true,
    overdueClaimIds: new Set(overdueClaims.map(c => c.id)),
    overdueClaims,
  }
}
