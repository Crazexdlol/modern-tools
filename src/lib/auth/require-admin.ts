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
  statusPhase: string | null
  workflowStage: 'main' | 'qc' | 'billing' | 'delivery' | 'payment' | null
  userId: string
  companyId: string | null
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
    .select('id, status, assigned_to, submitted_at, status_phase, workflow_stage, user_id, company_id' as any)
    .eq('id', id)
    .maybeSingle()
  if (full.error && full.error.code === '42703') {
    // Fall back twice — once dropping company_id, then dropping workflow_stage
    // so a pre-migration DB still works.
    const mid = await service
      .from('acv_history')
      .select('id, status, assigned_to, submitted_at, status_phase, workflow_stage, user_id')
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
  const stage = ['main','qc','billing','delivery','payment'].includes(row.workflow_stage)
    ? row.workflow_stage as 'main'|'qc'|'billing'|'delivery'|'payment'
    : null
  return {
    id: row.id,
    status: (row.status === 'closed' ? 'closed' : 'open'),
    assignedTo: row.assigned_to,
    submittedAt: row.submitted_at,
    statusPhase: row.status_phase,
    workflowStage: stage,
    userId: row.user_id,
    companyId: row.company_id ?? null,
  }
}
