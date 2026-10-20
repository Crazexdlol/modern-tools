import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/supabase/profiles'

interface NegotiationsCallerContext {
  userId: string
  role: Role
  isSuperAdmin: boolean
  activeCompanyId: string | null
  negotiationsAccess: true
}

// Reads the session from cookies, then reads the caller's profile row and
// verifies negotiations_access = true. Use for API routes that serve the
// Negotiations tab. Mirrors requireAdmin() in require-admin.ts.
//
// Pre-migration behavior: if profiles.negotiations_access does not exist yet
// (Postgres 42703), we treat the caller as denied — the tab surface stays
// dark until the migration runs and Henry's flag is flipped. This means a
// deploy that lands before the migration cannot leak access.
export async function requireNegotiationsAccess(): Promise<
  { caller: NegotiationsCallerContext; errorResponse: null } |
  { caller: null; errorResponse: NextResponse }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileData: any = null
  const full = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('id, role, is_super_admin, active_company_id, negotiations_access' as any)
    .eq('id', user.id)
    .maybeSingle()
  if (full.error && full.error.code === '42703') {
    // Migration hasn't run — deny.
    return { caller: null, errorResponse: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  profileData = full.data

  if (!profileData) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'No profile' }, { status: 403 }) }
  }
  if (profileData.negotiations_access !== true) {
    return { caller: null, errorResponse: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }

  return {
    caller: {
      userId: profileData.id,
      role: profileData.role as Role,
      isSuperAdmin: profileData.is_super_admin === true,
      activeCompanyId: profileData.active_company_id ?? null,
      negotiationsAccess: true,
    },
    errorResponse: null,
  }
}

// Server component variant — throws notFound() so pages 404 quietly rather
// than exposing the tab surface with an auth error.
export async function requireNegotiationsAccessOrNotFound(): Promise<NegotiationsCallerContext> {
  const result = await requireNegotiationsAccess()
  if (!result.caller) notFound()  // notFound() returns never — narrows the type below
  return result.caller
}
