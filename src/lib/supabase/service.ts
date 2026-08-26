import { createClient } from '@supabase/supabase-js'

// Server-only. NEVER import from a client component. Uses the service role
// key which bypasses RLS. Every route that uses this must first validate
// the caller's role via require-admin or its own workflow-specific check.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is missing')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
