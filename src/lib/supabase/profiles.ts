import { createClient as createBrowserClient } from './client'
import { useEffect, useState } from 'react'

export type Role = 'admin' | 'appraiser'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  canReassignClaims: boolean
  canEditClaimInfo: boolean
  canCreateClaims: boolean
  autoStatusRequestsOverride: boolean | null  // null = follow global setting
  createdAt: string
  updatedAt: string
}

interface ProfileRow {
  id: string
  email: string
  name: string
  role: Role
  can_reassign_claims?: boolean | null
  can_edit_claim_info?: boolean | null
  can_create_claims?: boolean | null
  auto_status_requests_override?: boolean | null
  created_at: string
  updated_at: string
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    canReassignClaims: row.can_reassign_claims === true,
    canEditClaimInfo: row.can_edit_claim_info === true,
    canCreateClaims: row.can_create_claims === true,
    autoStatusRequestsOverride:
      row.auto_status_requests_override === true
        ? true
        : row.auto_status_requests_override === false
          ? false
          : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchCurrentProfileBrowser(): Promise<Profile | null> {
  const supabase = createBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) {
    console.error('fetchCurrentProfileBrowser failed:', error)
    return null
  }
  return data ? rowToProfile(data as ProfileRow) : null
}

export async function fetchAllProfilesBrowser(): Promise<Profile[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('name', { ascending: true })
  if (error) {
    console.error('fetchAllProfilesBrowser failed:', error)
    return []
  }
  return (data as ProfileRow[]).map(rowToProfile)
}

// Session-scoped cache so multiple components share one fetch.
let cache: { profile: Profile | null; loadedAt: number } | null = null

export function useCurrentProfile(): { profile: Profile | null; loading: boolean; refresh: () => void } {
  const [profile, setProfile] = useState<Profile | null>(cache?.profile ?? null)
  const [loading, setLoading] = useState(!cache)

  const load = () => {
    setLoading(true)
    fetchCurrentProfileBrowser().then(p => {
      cache = { profile: p, loadedAt: Date.now() }
      setProfile(p)
      setLoading(false)
    })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern; setState fires only after the async fetch resolves
    if (!cache) load()
  }, [])

  return { profile, loading, refresh: () => { cache = null; load() } }
}
