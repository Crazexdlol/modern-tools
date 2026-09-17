import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll } from 'vitest'
import { config as loadDotenv } from 'dotenv'

// Test data uses this prefix for id / email so cleanup can find it reliably.
export const TEST_PREFIX = 'test-hamsportal-'

// Load env from .env.local (Next.js convention) — Vitest doesn't autoload.
loadDotenv({ path: '.env.local' })

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

beforeAll(() => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Isolation tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local'
    )
  }
})

/** Service-role client — bypasses RLS. Used for setup / cleanup / assertions. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

/** Anon client signed in as the given test user. Enforces RLS. */
export async function anonClientAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return c
}
