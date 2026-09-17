import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'

// Test data uses this prefix for id / email so cleanup can find it reliably.
export const TEST_PREFIX = 'test-hamsportal-'

// Load env from .env.local (Next.js convention) — Vitest doesn't autoload.
// Safe to call at import time; if the file doesn't exist we still fall through
// to process.env (Henry might set SUPABASE_SERVICE_ROLE_KEY inline).
loadDotenv({ path: '.env.local' })

function requireEnv(): { url: string; anon: string; svc: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !svc) {
    throw new Error(
      'Isolation tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (set in .env.local or via env vars)'
    )
  }
  return { url, anon, svc }
}

/** Service-role client — bypasses RLS. Used for setup / cleanup / assertions. */
export function serviceClient(): SupabaseClient {
  const { url, svc } = requireEnv()
  return createClient(url, svc, { auth: { persistSession: false } })
}

/** Anon client signed in as the given test user. Enforces RLS. */
export async function anonClientAs(email: string, password: string): Promise<SupabaseClient> {
  const { url, anon } = requireEnv()
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return c
}
