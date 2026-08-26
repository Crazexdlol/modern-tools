import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'
import { createServiceClient } from '@/lib/supabase/service'

interface CallerContext {
  userId: string
  role: Role
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }
  return { caller: { userId: profile.id, role: profile.role as Role }, errorResponse: null }
}

export interface WorkflowClaim {
  id: string
  status: 'open' | 'closed'
  assignedTo: string | null
  submittedAt: string | null
  userId: string
}

export async function fetchClaim(id: string): Promise<WorkflowClaim | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('acv_history')
    .select('id, status, assigned_to, submitted_at, user_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    status: (data.status === 'closed' ? 'closed' : 'open'),
    assignedTo: data.assigned_to,
    submittedAt: data.submitted_at,
    userId: data.user_id,
  }
}
