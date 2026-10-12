import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only. Bypasses RLS. Never import from client components.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
