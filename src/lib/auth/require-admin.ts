import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'
import { createServiceClient } from '@/lib/supabase/service'

interface CallerContext {
  userId: string
  role: Role
  isSuperAdmin: boolean
  // Post-multi-company: the company the caller is currently working as.
  // Null pre-migration (column doesn't exist) or if the user has never
  // resolved a company (multi-company user landing pre-picker).
  activeCompanyId: string | null
}

// Reads the session from cookies (via @supabase/ssr), then reads the caller's
// profile row. Returns { caller } on success or { errorResponse } on failure.
// Use for API routes that require the caller to be authenticated + admin.
export async function requireAdmin(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  const authed = await getCaller()
  if (!authed.caller) return { caller: null, errorResponse: authed.errorResponse! }
  if (authed.caller.role !== 'admin') {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  }
  return { caller: authed.caller, errorResponse: null }
}

// Same but any authenticated caller passes (used by /api/profile).
export async function requireAuth(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  return getCaller()
}

async function getCaller(): Promise<
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
  // Try the full column set first; fall back to legacy set if active_company_id
  // hasn't been migrated yet (pre-Phase-1 code paths remain callable).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileData: any = null
  const full = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, role, is_super_admin, active_company_id' as any)
    .eq('id', user.id)
    .maybeSingle()
  if (full.error && full.error.code === '42703') {
    const legacy = await supabase
      .from('profiles')
      .select('id, role, is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    profileData = legacy.data
  } else {
    profileData = full.data
  }
  if (!profileData) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }
  return {
    caller: {
      userId: profileData.id,
      role: profileData.role as Role,
      isSuperAdmin: profileData.is_super_admin === true,
      activeCompanyId: profileData.active_company_id ?? null,
    },
    errorResponse: null,
  }
}

// Same as requireAdmin but also requires is_super_admin = true. Use for
// routes that expose cross-user analytics that regular admins shouldn't see.
export async function requireSuperAdmin(): Promise<
  { caller: CallerContext; errorResponse: null } | { caller: null; errorResponse: NextResponse }
> {
  const authed = await requireAdmin()
  if (!authed.caller) return authed
  if (!authed.caller.isSuperAdmin) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Super-admin only' }, { status: 403 }) }
  }
  return authed
}

// Guard for user-management endpoints (PATCH / DELETE / reset-password /
// change-email / appraiser-fees / appraiser-licenses). Enforces two rules:
//
//   1. A regular admin cannot mutate a super-admin's row — otherwise any
//      admin could demote the super-admin, reset their password, change
//      their email, or deactivate them, hijacking the only account that
//      can grant admin rights.
//
//   2. A regular admin cannot mutate a user who isn't a member of the
//      admin's active company — otherwise a Modern Appraisers admin could
//      change Eagleview appraisers' fees, licenses, or roles.
//
// Super-admin bypasses both. Pre-multi-company deploys (no activeCompanyId,
// no user_companies rows) fall through as allowed so legacy behavior stays
// intact. Returns `null` when allowed; returns a 403 response otherwise.
export async function assertCanTargetUser(
  targetUserId: string,
  caller: CallerContext,
): Promise<NextResponse | null> {
  if (caller.isSuperAdmin) return null
  const service = createServiceClient()

  // 1. Super-admin guard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetProfile } = await service
    .from('profiles')
    .select('is_super_admin' as any)
    .eq('id', targetUserId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((targetProfile as any)?.is_super_admin === true) {
    return NextResponse.json(
      { error: 'Only the super-admin can modify a super-admin account.' },
      { status: 403 },
    )
  }

  // 2. Same-company membership guard. Skip pre-multi-company (caller has
  // no activeCompanyId) so older deploys don't break.
  if (!caller.activeCompanyId) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await service
    .from('user_companies' as any)
    .select('user_id' as any)
    .eq('user_id', targetUserId)
    .eq('company_id', caller.activeCompanyId)
    .limit(1)
  // 42P01 = user_companies table missing (pre-migration) — fall through.
  if (membership.error && membership.error.code === '42P01') return null
  if (membership.error) {
    // Any other error = fail closed. We can't verify the caller is allowed.
    return NextResponse.json(
      { error: 'Could not verify target user membership. Try again.' },
      { status: 500 },
    )
  }
  if (!membership.data || membership.data.length === 0) {
    return NextResponse.json(
      { error: 'Target user is not a member of your active company.' },
      { status: 403 },
    )
  }
  return null
}

// Ensures the caller has an active_company_id set. Use in any route that
// writes company-scoped data via the service client.
//
// Returns 400 if activeCompanyId is missing — either the migration hasn't run
// yet (developer will see this in dev) or a multi-company user hasn't picked
// a company yet (they'll be redirected to /select-company by the UI).
export async function requireCompanyContext(): Promise<
  { activeCompanyId: string; caller: CallerContext; errorResponse: null } |
  { activeCompanyId: null; caller: null; errorResponse: NextResponse }
> {
  const authed = await requireAuth()
  if (authed.errorResponse) return { activeCompanyId: null, caller: null, errorResponse: authed.errorResponse }
  const caller = authed.caller!
  if (!caller.activeCompanyId) {
    return {
      activeCompanyId: null,
      caller: null,
      errorResponse: NextResponse.json(
        { error: 'No active company. Log out and back in to pick a company.' },
        { status: 400 },
      ),
    }
  }
  return { activeCompanyId: caller.activeCompanyId, caller, errorResponse: null }
}

export interface WorkflowClaim {
  id: string
  status: 'open' | 'closed'
  assignedTo: string | null
  submittedAt: string | null
  submittedBy: string | null
  statusPhase: string | null
  workflowStage: 'main' | 'qc' | 'billing_delivery' | 'payment' | null
  userId: string
  companyId: string | null
  // Rough-numbers workflow fields. Both undefined pre-migration (fetchClaim
  // falls back to selecting without them so routes keep working); the submit
  // branch's `claim.needsRoughNumbers && !claim.roughNumbersHandoffAt` guard
  // then evaluates to false and the standard QC path fires.
  needsRoughNumbers?: boolean
  roughNumbersHandoffAt?: string | null
}

// Fetches a claim scoped to a company. When companyId is passed, the row must
// match — otherwise returns null (routes turn this into 404, matching the
// "don't leak existence" contract). When companyId is undefined this function
// behaves as before (used by super-admin cross-company paths or pre-migration
// callers when the caller has no activeCompanyId yet).
export async function fetchClaim(id: string, companyId?: string | null): Promise<WorkflowClaim | null> {
  const service = createServiceClient()
  // Try selecting company_id; fall back if the column doesn't exist yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: any = null
  const full = await service
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, status, assigned_to, submitted_at, submitted_by, status_phase, workflow_stage, user_id, company_id, needs_rough_numbers, rough_numbers_handoff_at' as any)
    .eq('id', id)
    .maybeSingle()
  if (full.error && full.error.code === '42703') {
    // Fall back — drop columns that don't exist yet, in order from newest to oldest.
    // Dropping rough-numbers + company_id in one step handles the case where
    // either (or both) are missing; the submit route tolerates undefined on
    // both fields via its branch guard.
    const mid = await service
      .from('acv_history')
      .select('id, status, assigned_to, submitted_at, submitted_by, status_phase, workflow_stage, user_id')
      .eq('id', id)
      .maybeSingle()
    if (mid.error && mid.error.code === '42703') {
      const legacy = await service
        .from('acv_history')
        .select('id, status, assigned_to, submitted_at, status_phase, user_id')
        .eq('id', id)
        .maybeSingle()
      row = legacy.data
    } else {
      row = mid.data
    }
  } else {
    row = full.data
  }
  if (!row) return null
  // Enforce company scoping when the caller provided a companyId AND the row
  // has one. Missing row.company_id (pre-migration) falls through as OK.
  if (companyId && row.company_id && row.company_id !== companyId) return null
  // Tolerate transitional pre-merge values on cached rows ('billing' / 'delivery'
  // both roll into 'billing_delivery') — the DB migration already rewrote
  // persisted rows but this keeps live reads tolerant.
  let stage: 'main'|'qc'|'billing_delivery'|'payment'|null = null
  if (['main','qc','billing_delivery','payment'].includes(row.workflow_stage)) {
    stage = row.workflow_stage as 'main'|'qc'|'billing_delivery'|'payment'
  } else if (row.workflow_stage === 'billing' || row.workflow_stage === 'delivery') {
    stage = 'billing_delivery'
  }
  return {
    id: row.id,
    status: (row.status === 'closed' ? 'closed' : 'open'),
    assignedTo: row.assigned_to,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by ?? null,
    statusPhase: row.status_phase,
    workflowStage: stage,
    userId: row.user_id,
    companyId: row.company_id ?? null,
    needsRoughNumbers: row.needs_rough_numbers === true,
    roughNumbersHandoffAt: row.rough_numbers_handoff_at ?? null,
  }
}
