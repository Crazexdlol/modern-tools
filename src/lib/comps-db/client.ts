import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function compsDbClient(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.COMPS_DB_URL
  const key = process.env.COMPS_DB_SERVICE_KEY
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
