import { createClient as createBrowserClient } from './client'

// Fetches the caller's active company id from profiles. Used to stamp
// company_id on client / contact / log INSERTs so post-migration RLS
// WITH CHECK is satisfied. Cached per session to avoid repeated round-trips.
let _activeCompanyIdCache: string | null | undefined
async function getActiveCompanyId(): Promise<string | null> {
  if (_activeCompanyIdCache !== undefined) return _activeCompanyIdCache
  const supabase = createBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { _activeCompanyIdCache = null; return null }
  const { data, error } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('active_company_id' as any)
    .eq('id', user.id)
    .maybeSingle()
  if (error) { _activeCompanyIdCache = null; return null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _activeCompanyIdCache = ((data as any)?.active_company_id ?? null) as string | null
  return _activeCompanyIdCache
}

// Current client types (post 2026-10-12 overhaul):
//   tpa                 - Third-party administrator (Sedgwick etc.)
//   insurance_company   - Insurance carrier
//   attorney            - Law firm / attorney office
//   body_shop           - Body shop
//   other               - Freeform; the user-entered label lives on
//                         Client.typeCustom
// Legacy 'adjuster' is retained in the TS union only for defensive
// deserialization — the type-expand migration flipped every adjuster
// row to 'tpa', and the DB check constraint no longer allows new
// 'adjuster' inserts. UI pickers never surface it.
export type ClientType = 'tpa' | 'body_shop' | 'attorney' | 'insurance_company' | 'referral' | 'other' | 'adjuster'

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  tpa: 'TPA',
  insurance_company: 'Ins. Co.',
  attorney: 'Attorney',
  body_shop: 'Body Shop',
  referral: 'Referral',
  other: 'Other',
  // Legacy — any surviving pre-migration row still renders readably.
  adjuster: 'TPA',
}

// The types the admin UI exposes for new clients. Does NOT include
// 'adjuster' (legacy only). Order here is the picker order.
export const SELECTABLE_CLIENT_TYPES: ClientType[] = [
  'tpa',
  'insurance_company',
  'attorney',
  'body_shop',
  'referral',
  'other',
]

export interface Client {
  id: string
  name: string
  type: ClientType
  // Freeform label shown when type === 'other'. Null for every other type.
  // Pre-migration rows have no type_custom column — rowToClient defaults
  // this to null so legacy fetches don't crash.
  typeCustom: string | null
  // When true, new claims for this client default to needs_rough_numbers=true.
  // Admin flips per-client in the client-edit UI. Pre-migration rows return
  // false (rough_numbers_default column absent).
  roughNumbersDefault: boolean
  // When true, new claims for this client auto-add 'rta' (Right To
  // Appraisal) to claim.claimTypes at creation — the flag that gates
  // Opposing Appraiser as required at creation. Mirror of
  // roughNumbersDefault. Pre-migration rows return false. (Henry
  // 2026-10-18: every Sedgwick claim gets RTA; backfilled on open claims.)
  rtaDefault: boolean
  addressLine: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  lastMarketedAt: string | null // ISO date
  remarketIntervalDays: number | null
  nextRemarketAt: string | null // ISO date (generated column)
  reminderSentAt: string | null
  archivedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientContact {
  id: string
  clientId: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
  notes: string | null
  createdAt: string
}

export type MarketingMethod = 'visit' | 'call' | 'email' | 'mail' | 'other'

export interface ClientMarketingLog {
  id: string
  clientId: string
  marketedAt: string // ISO date
  method: MarketingMethod
  notes: string | null
  loggedBy: string | null
  createdAt: string
}

interface ClientRow {
  id: string
  name: string
  type: string
  type_custom?: string | null
  rough_numbers_default?: boolean | null
  rta_default?: boolean | null
  address_line: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  last_marketed_at: string | null
  remarket_interval_days: number | null
  next_remarket_at: string | null
  reminder_sent_at: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToClient(r: ClientRow): Client {
  const knownTypes: ClientType[] = ['tpa', 'body_shop', 'attorney', 'insurance_company', 'referral', 'other', 'adjuster']
  const normalizedType: ClientType = knownTypes.includes(r.type as ClientType)
    ? (r.type as ClientType)
    : 'other'
  return {
    id: r.id,
    name: r.name,
    type: normalizedType,
    typeCustom: r.type_custom ?? null,
    roughNumbersDefault: r.rough_numbers_default === true,
    rtaDefault: r.rta_default === true,
    addressLine: r.address_line,
    city: r.city,
    state: r.state,
    zip: r.zip,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    email: r.email,
    website: r.website,
    notes: r.notes,
    lastMarketedAt: r.last_marketed_at,
    remarketIntervalDays: r.remarket_interval_days,
    nextRemarketAt: r.next_remarket_at,
    reminderSentAt: r.reminder_sent_at,
    archivedAt: r.archived_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Prefix / substring match for the type-ahead. Fast against clients_name_trgm_idx.
// Returns up to `limit` active clients (archived_at IS NULL).
export async function searchClientsByName(q: string, limit = 12): Promise<Client[]> {
  if (!q.trim()) return []
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .is('archived_at', null)
    .ilike('name', `%${q.trim()}%`)
    .order('name', { ascending: true })
    .limit(limit)
  if (error) { console.error('searchClientsByName failed:', error); return [] }
  return (data as ClientRow[]).map(rowToClient)
}

// Combined type-ahead result: a company match OR a contact-person match
// (which carries the parent company info so the picker can render
// "Person · Company" and attribute the resulting claim to both).
export type ClientPickerMatch =
  | { kind: 'client'; client: Client }
  | { kind: 'contact'; contact: ClientContact; client: Client }

// Search both clients AND their contacts in parallel. Used by the Claim
// Info client picker so Henry can pick "Brandon @ Clear Counsel Law" and
// have the resulting claim attributed to both Brandon (per-person stats)
// and Clear Counsel (per-company dashboard column). Returns ~limit total
// rows split across the two sources; name matches are case-insensitive.
export async function searchClientsAndContactsByName(
  q: string,
  limit = 12,
): Promise<ClientPickerMatch[]> {
  const query = q.trim()
  if (!query) return []
  const supabase = createBrowserClient()

  // Query both sources concurrently. Contacts are joined with their parent
  // client so we can show the company label inline (and so a contact whose
  // parent is archived doesn't surface).
  const clientsP = supabase
    .from('clients')
    .select('*')
    .is('archived_at', null)
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(limit)

  const contactsP = supabase
    .from('client_contacts')
    .select('*, client:clients!inner(*)')
    .ilike('name', `%${query}%`)
    .is('client.archived_at', null)
    .order('name', { ascending: true })
    .limit(limit)

  const [cRes, pRes] = await Promise.all([clientsP, contactsP])
  if (cRes.error) console.error('searchClientsAndContactsByName (clients) failed:', cRes.error)
  if (pRes.error) console.error('searchClientsAndContactsByName (contacts) failed:', pRes.error)

  const clientMatches: ClientPickerMatch[] = ((cRes.data as ClientRow[]) ?? []).map(r => ({
    kind: 'client',
    client: rowToClient(r),
  }))

  const contactMatches: ClientPickerMatch[] = (((pRes.data as unknown) as Array<ContactRow & { client: ClientRow }>) ?? [])
    .filter(r => r.client)
    .map(r => ({
      kind: 'contact',
      contact: {
        id: r.id as string,
        clientId: r.client_id as string,
        name: r.name as string,
        title: (r.title as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        isPrimary: r.is_primary === true,
        notes: (r.notes as string | null) ?? null,
        createdAt: r.created_at as string,
      },
      client: rowToClient(r.client),
    }))

  return [...clientMatches, ...contactMatches]
}

// Fuzzy "did you mean" — trigram similarity. Used to warn the user before
// creating a duplicate. Threshold is applied server-side in the RPC (0.3
// there — API layer / caller uses 0.4 for the actual guard).
export interface FuzzyClientMatch {
  id: string
  name: string
  type: ClientType
  city: string | null
  state: string | null
  similarity: number
}

export async function fuzzyMatchClients(q: string, limit = 8): Promise<FuzzyClientMatch[]> {
  if (!q.trim()) return []
  const supabase = createBrowserClient()
  const { data, error } = await supabase.rpc('search_clients_similar_guarded', {
    q: q.trim(),
    limit_n: limit,
  })
  if (error) {
    // 42883 (undefined function) means the migration hasn't been applied yet.
    // Fall back to empty — the create flow still works, just without the guard.
    if (error.code === '42883') return []
    console.error('fuzzyMatchClients failed:', error)
    return []
  }
  interface FuzzyRow { id: string; name: string; type: string; city: string | null; state: string | null; similarity: number }
  return (data as FuzzyRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    type: (['adjuster', 'body_shop', 'attorney', 'insurance_company'].includes(r.type) ? r.type : 'adjuster') as ClientType,
    city: r.city,
    state: r.state,
    similarity: r.similarity,
  }))
}

export async function fetchClient(id: string): Promise<Client | null> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return rowToClient(data as ClientRow)
}

// Count of clients whose next_remarket_at is <= today (i.e., due or overdue).
// RLS restricts to marketing_access users; other callers get 0. Used for the
// nav-link badge.
export async function fetchDueForRemarketingCount(): Promise<number> {
  const supabase = createBrowserClient()
  const today = new Date().toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)
    .lte('next_remarket_at', today)
  if (error) {
    // 42501 (RLS block) / 42P01 (table missing) both indicate "user shouldn't
    // see this" — return 0 silently rather than logging.
    if (error.code === '42501' || error.code === '42P01') return 0
    console.error('fetchDueForRemarketingCount failed:', error)
    return 0
  }
  return count ?? 0
}

// Fetch every non-archived client. RLS restricts to marketing_access users;
// callers without the flag get [].
export async function fetchAllClients(): Promise<Client[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) { console.error('fetchAllClients failed:', error); return [] }
  return (data as ClientRow[]).map(rowToClient)
}

// Aggregate claim count + open/closed split per linked client. Only reads
// (client_id, status) so it's cheap even at ~390 claims.
export interface ClientClaimStats {
  clientId: string
  total: number
  open: number
  closed: number
}

export async function fetchClientClaimStats(): Promise<Map<string, ClientClaimStats>> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('acv_history')
    .select('client_id, status')
    .not('client_id', 'is', null)
  if (error) { console.error('fetchClientClaimStats failed:', error); return new Map() }
  const stats = new Map<string, ClientClaimStats>()
  for (const row of (data as { client_id: string; status: string | null }[])) {
    const id = row.client_id
    const s = stats.get(id) ?? { clientId: id, total: 0, open: 0, closed: 0 }
    s.total += 1
    if (row.status === 'closed') s.closed += 1
    else s.open += 1
    stats.set(id, s)
  }
  return stats
}

// Update a client. Only the fields you pass are patched.
export type ClientUpdate = Partial<Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'nextRemarketAt' | 'createdBy'>>

export async function updateClient(id: string, patch: ClientUpdate): Promise<Client | null> {
  const supabase = createBrowserClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.type !== undefined) dbPatch.type = patch.type
  if (patch.typeCustom !== undefined) dbPatch.type_custom = patch.typeCustom
  if (patch.roughNumbersDefault !== undefined) dbPatch.rough_numbers_default = patch.roughNumbersDefault
  if (patch.rtaDefault !== undefined) dbPatch.rta_default = patch.rtaDefault
  if (patch.addressLine !== undefined) dbPatch.address_line = patch.addressLine
  if (patch.city !== undefined) dbPatch.city = patch.city
  if (patch.state !== undefined) dbPatch.state = patch.state?.toUpperCase() ?? null
  if (patch.zip !== undefined) dbPatch.zip = patch.zip
  if (patch.lat !== undefined) dbPatch.lat = patch.lat
  if (patch.lng !== undefined) dbPatch.lng = patch.lng
  if (patch.phone !== undefined) dbPatch.phone = patch.phone
  if (patch.email !== undefined) dbPatch.email = patch.email
  if (patch.website !== undefined) dbPatch.website = patch.website
  if (patch.notes !== undefined) dbPatch.notes = patch.notes
  if (patch.lastMarketedAt !== undefined) dbPatch.last_marketed_at = patch.lastMarketedAt
  if (patch.remarketIntervalDays !== undefined) dbPatch.remarket_interval_days = patch.remarketIntervalDays
  if (patch.reminderSentAt !== undefined) dbPatch.reminder_sent_at = patch.reminderSentAt
  if (patch.archivedAt !== undefined) dbPatch.archived_at = patch.archivedAt
  let { data, error } = await supabase.from('clients').update(dbPatch).eq('id', id).select().single()
  // Pre-migration safety: if a column hasn't been added yet, strip it and
  // retry. Admin can save other fields without losing the edit.
  while (error && error.code === '42703') {
    let stripped = false
    for (const col of ['type_custom', 'rough_numbers_default', 'rta_default']) {
      if (col in dbPatch) { delete dbPatch[col]; stripped = true }
    }
    if (!stripped) break
    ;({ data, error } = await supabase.from('clients').update(dbPatch).eq('id', id).select().single())
  }
  if (error) { console.error('updateClient failed:', error); return null }
  return rowToClient(data as ClientRow)
}

export async function archiveClient(id: string): Promise<boolean> {
  const supabase = createBrowserClient()
  const { error } = await supabase.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) { console.error('archiveClient failed:', error); return false }
  return true
}

// ── Contacts ─────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string
  client_id: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

function rowToContact(r: ContactRow): ClientContact {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    title: r.title,
    phone: r.phone,
    email: r.email,
    isPrimary: r.is_primary,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export async function fetchContacts(clientId: string): Promise<ClientContact[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) { console.error('fetchContacts failed:', error); return [] }
  return (data as ContactRow[]).map(rowToContact)
}

export interface NewContactInput {
  clientId: string
  name: string
  title?: string | null
  phone?: string | null
  email?: string | null
  isPrimary?: boolean
  notes?: string | null
}

export async function createContact(input: NewContactInput): Promise<ClientContact | null> {
  const supabase = createBrowserClient()
  const activeCompanyId = await getActiveCompanyId()
  // If setting primary, clear existing primary first (partial unique index
  // enforces one-primary-per-client).
  if (input.isPrimary) {
    await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', input.clientId).eq('is_primary', true)
  }
  const contactPayload: Record<string, unknown> = {
    client_id: input.clientId,
    name: input.name.trim(),
    title: input.title?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    is_primary: !!input.isPrimary,
    notes: input.notes?.trim() || null,
  }
  if (activeCompanyId) contactPayload.company_id = activeCompanyId
  const { data, error } = await supabase.from('client_contacts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(contactPayload as any).select().single()
  if (error) { console.error('createContact failed:', error); return null }
  return rowToContact(data as ContactRow)
}

export async function updateContact(id: string, patch: Partial<Omit<ClientContact, 'id' | 'clientId' | 'createdAt'>>): Promise<ClientContact | null> {
  const supabase = createBrowserClient()
  if (patch.isPrimary === true) {
    // Get the client_id first, then clear other primaries.
    const { data: existing } = await supabase.from('client_contacts').select('client_id').eq('id', id).maybeSingle()
    if (existing?.client_id) {
      await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', existing.client_id).neq('id', id)
    }
  }
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.title !== undefined) dbPatch.title = patch.title
  if (patch.phone !== undefined) dbPatch.phone = patch.phone
  if (patch.email !== undefined) dbPatch.email = patch.email
  if (patch.isPrimary !== undefined) dbPatch.is_primary = patch.isPrimary
  if (patch.notes !== undefined) dbPatch.notes = patch.notes
  const { data, error } = await supabase.from('client_contacts').update(dbPatch).eq('id', id).select().single()
  if (error) { console.error('updateContact failed:', error); return null }
  return rowToContact(data as ContactRow)
}

export async function deleteContact(id: string): Promise<boolean> {
  const supabase = createBrowserClient()
  const { error } = await supabase.from('client_contacts').delete().eq('id', id)
  if (error) { console.error('deleteContact failed:', error); return false }
  return true
}

// ── Marketing log ────────────────────────────────────────────────────────────

interface LogRow {
  id: string
  client_id: string
  marketed_at: string
  method: string
  notes: string | null
  logged_by: string | null
  created_at: string
}

function rowToLog(r: LogRow): ClientMarketingLog {
  return {
    id: r.id,
    clientId: r.client_id,
    marketedAt: r.marketed_at,
    method: (['visit', 'call', 'email', 'mail', 'other'].includes(r.method) ? r.method : 'other') as MarketingMethod,
    notes: r.notes,
    loggedBy: r.logged_by,
    createdAt: r.created_at,
  }
}

export async function fetchMarketingLog(clientId: string): Promise<ClientMarketingLog[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('client_marketing_log')
    .select('*')
    .eq('client_id', clientId)
    .order('marketed_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchMarketingLog failed:', error); return [] }
  return (data as LogRow[]).map(rowToLog)
}

export interface LogTouchInput {
  clientId: string
  marketedAt: string // ISO date
  method: MarketingMethod
  notes?: string | null
}

export async function logTouch(input: LogTouchInput): Promise<ClientMarketingLog | null> {
  const supabase = createBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  const activeCompanyId = await getActiveCompanyId()
  const logPayload: Record<string, unknown> = {
    client_id: input.clientId,
    marketed_at: input.marketedAt,
    method: input.method,
    notes: input.notes?.trim() || null,
    logged_by: user?.id ?? null,
  }
  if (activeCompanyId) logPayload.company_id = activeCompanyId
  const { data, error } = await supabase.from('client_marketing_log')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(logPayload as any).select().single()
  if (error) { console.error('logTouch failed:', error); return null }
  // Also bump last_marketed_at on the client. Best-effort — the log entry is
  // the source of truth, this is just a cache for the "next remarket" sort.
  await supabase.from('clients').update({ last_marketed_at: input.marketedAt, reminder_sent_at: null }).eq('id', input.clientId)
  return rowToLog(data as LogRow)
}

export async function deleteLogEntry(id: string): Promise<boolean> {
  const supabase = createBrowserClient()
  const { error } = await supabase.from('client_marketing_log').delete().eq('id', id)
  if (error) { console.error('deleteLogEntry failed:', error); return false }
  return true
}

// Claims linked to a client (used in the drawer's Claims section).
export interface ClientClaim {
  id: string
  maNumber: string
  vehicle: string
  status: 'open' | 'closed'
  date: string
}

export async function fetchClaimsForClient(clientId: string): Promise<ClientClaim[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('acv_history')
    .select('id, ma_number, vehicle, status, date')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
  if (error) { console.error('fetchClaimsForClient failed:', error); return [] }
  return (data as { id: string; ma_number: string; vehicle: string; status: string | null; date: string }[]).map(r => ({
    id: r.id,
    maNumber: r.ma_number,
    vehicle: r.vehicle,
    status: r.status === 'closed' ? 'closed' : 'open',
    date: r.date,
  }))
}

// Minimal create — the marketing tab (future) will support the full field set.
// Called from the Claim Info client dropdown when the user picks "Add new client".
export interface NewClientInput {
  name: string
  type: ClientType
  // When type='other', this is the user-entered label (e.g. "Dealer Group").
  // Ignored for other type values.
  typeCustom?: string | null
  addressLine?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  notes?: string | null
}

export async function createClient(input: NewClientInput): Promise<Client | null> {
  const supabase = createBrowserClient()
  const activeCompanyId = await getActiveCompanyId()
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    type: input.type,
    type_custom: input.type === 'other' ? (input.typeCustom?.trim() || null) : null,
    address_line: input.addressLine?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase() || null,
    zip: input.zip?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    website: input.website?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  if (activeCompanyId) payload.company_id = activeCompanyId
  let { data, error } = await supabase
    .from('clients')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(payload as any)
    .select()
    .single()
  if (error && error.code === '42703' && 'type_custom' in payload) {
    delete payload.type_custom
    ;({ data, error } = await supabase
      .from('clients')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single())
  }
  if (error) { console.error('createClient failed:', error); return null }
  return rowToClient(data as ClientRow)
}
