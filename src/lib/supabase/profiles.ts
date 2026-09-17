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
  phone: string | null
  addressStreet: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  isActive: boolean
  // Whether this profile appears in the Claim Info "Handling Appraiser"
  // <select>. Independent from isActive — a profile with this=false is
  // still fully assignable via the reassign UI, but doesn't show up in
  // the dropdown that populates the printed-doc handling-appraiser name.
  showInHandlingAppraiserList: boolean
  isSuperAdmin: boolean
  // Gates the /marketing tab + client_* reads/writes. Admins always have it
  // implicitly; non-admins need an explicit admin grant. Enforced by RLS
  // via public.has_marketing_access() and by the profiles_role_guard trigger
  // against self-grant.
  marketingAccess: boolean
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
  phone?: string | null
  address_street?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  is_active?: boolean | null
  show_in_handling_appraiser_list?: boolean | null
  is_super_admin?: boolean | null
  marketing_access?: boolean | null
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
    phone: row.phone ?? null,
    addressStreet: row.address_street ?? null,
    addressCity: row.address_city ?? null,
    addressState: row.address_state ?? null,
    addressZip: row.address_zip ?? null,
    isActive: row.is_active !== false,
    showInHandlingAppraiserList: row.show_in_handling_appraiser_list !== false,
    isSuperAdmin: row.is_super_admin === true,
    marketingAccess: row.marketing_access === true,
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
