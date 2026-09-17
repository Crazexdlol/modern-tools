import { createClient as createBrowserClient } from './client'

export type ClientType = 'adjuster' | 'body_shop' | 'attorney' | 'insurance_company'

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  adjuster: 'Adjuster',
  body_shop: 'Body Shop',
  attorney: 'Attorney',
  insurance_company: 'Insurance Company',
}

export interface Client {
  id: string
  name: string
  type: ClientType
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
  return {
    id: r.id,
    name: r.name,
    type: (['adjuster', 'body_shop', 'attorney', 'insurance_company'].includes(r.type) ? r.type : 'adjuster') as ClientType,
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
  const { data, error } = await supabase.from('clients').update(dbPatch).eq('id', id).select().single()
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
  // If setting primary, clear existing primary first (partial unique index
  // enforces one-primary-per-client).
  if (input.isPrimary) {
    await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', input.clientId).eq('is_primary', true)
  }
  const { data, error } = await supabase.from('client_contacts').insert({
    client_id: input.clientId,
    name: input.name.trim(),
    title: input.title?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    is_primary: !!input.isPrimary,
    notes: input.notes?.trim() || null,
  }).select().single()
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
  const { data, error } = await supabase.from('client_marketing_log').insert({
    client_id: input.clientId,
    marketed_at: input.marketedAt,
    method: input.method,
    notes: input.notes?.trim() || null,
    logged_by: user?.id ?? null,
  }).select().single()
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
  city?: string | null
  state?: string | null
  phone?: string | null
  email?: string | null
}

export async function createClient(input: NewClientInput): Promise<Client | null> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: input.name.trim(),
      type: input.type,
      city: input.city?.trim() || null,
      state: input.state?.trim().toUpperCase() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    })
    .select()
    .single()
  if (error) { console.error('createClient failed:', error); return null }
  return rowToClient(data as ClientRow)
}
