import { createServiceClient } from '@/lib/supabase/service'

// Server-only. Queries the profiles table via the service role so the
// result is NOT constrained by RLS — any admin or appraiser row with a
// valid email + is_active=true is returned.
//
// Dedupe is case-insensitive against the normalized (lowercased, trimmed)
// email so a stray typo like " Alice@X.com" doesn't produce two sends.

export interface Recipient {
  id: string
  email: string
  name: string
  role: 'admin' | 'appraiser'
}

export async function fetchStaffRecipients(): Promise<Recipient[]> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select('id, email, name, role, is_active')
    .in('role', ['admin', 'appraiser'])
    .eq('is_active', true)
  if (error) {
    console.error('fetchStaffRecipients failed:', error)
    return []
  }
  return normalize(data)
}

// Looks up specific profiles by id, applies the same active + admin/appraiser
// filter so a caller can't broadcast to an inactive user or to someone with
// another role by passing their id directly.
export async function fetchStaffRecipientsByIds(ids: string[]): Promise<Recipient[]> {
  if (ids.length === 0) return []
  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select('id, email, name, role, is_active')
    .in('id', ids)
    .in('role', ['admin', 'appraiser'])
    .eq('is_active', true)
  if (error) {
    console.error('fetchStaffRecipientsByIds failed:', error)
    return []
  }
  return normalize(data)
}

function normalize(
  rows: unknown,
): Recipient[] {
  const seen = new Set<string>()
  const out: Recipient[] = []
  for (const row of (rows ?? []) as Array<{ id: string; email: string | null; name: string | null; role: 'admin' | 'appraiser' }>) {
    const email = (row.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    if (seen.has(email)) continue
    seen.add(email)
    out.push({ id: row.id, email, name: row.name ?? '', role: row.role })
  }
  return out
}
