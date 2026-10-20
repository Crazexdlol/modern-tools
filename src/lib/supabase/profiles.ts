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
  // Whether this profile appears in the Claim Info "Negotiating Appraiser"
  // <select>. Independent from isActive — a profile with this=false is
  // still fully assignable via the reassign UI, but doesn't show up in
  // the dropdown that populates the printed-doc negotiating-appraiser name.
  // (Backing SQL column stays `show_in_handling_appraiser_list` for now —
  // a column rename is deferred to its own migration.)
  showInNegotiatingAppraiserList: boolean
  isSuperAdmin: boolean
  // Gates the /marketing tab + client_* reads/writes. Admins always have it
  // implicitly; non-admins need an explicit admin grant. Enforced by RLS
  // via public.has_marketing_access() and by the profiles_role_guard trigger
  // against self-grant.
  marketingAccess: boolean
  // Gates the /negotiations tab (Henry-only). Same pattern as marketingAccess:
  // flag-only, no admin bypass. Defaults to false if the column doesn't
  // exist yet (pre-migration deploys don't break).
  negotiationsAccess: boolean
  // When true, this appraiser can submit a claim to QC directly even if they
  // are NOT the negotiating appraiser on the file (skips the Complete Report
  // handoff). Everyone else gets handed-off to the negotiating appraiser
  // first.
  canSubmitWithoutHandoff: boolean
  // When false, system-generated emails (claim assigned, cancelled, submitted,
  // new message) are suppressed for this user. Admin broadcasts are a
  // separate pathway and are not gated by this flag. Defaults to true for
  // every user, including existing ones (migration-email-notifications-flag).
  emailNotificationsEnabled: boolean
  // Claim types this user is qualified to handle (ClaimType codes: 'acv',
  // 'dv', 'estimate', 'storage', 'lou', 'salvage', 'full', 'desk', 'other').
  // Empty array = handles ALL types (back-compat default). Reassign pickers
  // filter to users whose claim_types overlap the claim's claim.claimTypes.
  claimTypes: string[]
  // Tool codes HIDDEN for this user in the claim workspace tool-tab bar.
  // Codes match TOOL_TABS ids: 'acv' | 'dv' | 'lou' | 'estimate' | 'storage'
  // | 'award' | 'notes' | 'summary'. Empty = full tool access.
  disabledTools: string[]
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
  negotiations_access?: boolean | null
  can_submit_without_handoff?: boolean | null
  email_notifications_enabled?: boolean | null
  claim_types?: string[] | null
  disabled_tools?: string[] | null
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
    showInNegotiatingAppraiserList: row.show_in_handling_appraiser_list !== false,
    isSuperAdmin: row.is_super_admin === true,
    marketingAccess: row.marketing_access === true,
    negotiationsAccess: row.negotiations_access === true,
    canSubmitWithoutHandoff: row.can_submit_without_handoff === true,
    emailNotificationsEnabled: row.email_notifications_enabled !== false,
    claimTypes: Array.isArray(row.claim_types) ? row.claim_types : [],
    disabledTools: Array.isArray(row.disabled_tools) ? row.disabled_tools : [],
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

// Returns true for profiles that should appear in user-selection pickers
// (claim assignment, handling-appraiser dropdown, send-back-to, messaging
// recipient, bulk-reassign). Hides super-admin accounts because Henry's
// personal super-admin is a private tooling account and should not be
// selectable by other users. All other admin/appraiser profiles pass through
// unchanged; apply additional per-picker filters (e.g. isActive) on top.
export function isPickerVisible(p: Profile): boolean {
  return !p.isSuperAdmin
}

// Returns true if `p` is qualified to handle any of the claim's types.
// Semantics:
//   • profile with empty claimTypes = "handles everything" (back-compat
//     default; every existing user had no column before the migration)
//   • claim with no claim.claimTypes = any user qualifies (fresh claims or
//     legacy rows without a type picked)
//   • otherwise require at least one overlap
// Used to filter reassign dropdowns so (e.g.) a user who only handles
// Estimate Disputes doesn't show up when reassigning an ACV claim.
export function userHandlesClaimTypes(p: Profile, claimTypes: string[] | undefined | null): boolean {
  if (!p.claimTypes || p.claimTypes.length === 0) return true
  if (!claimTypes || claimTypes.length === 0) return true
  const have = new Set(p.claimTypes)
  for (const t of claimTypes) if (have.has(t)) return true
  return false
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
