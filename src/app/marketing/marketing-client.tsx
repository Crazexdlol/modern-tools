"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Download, Loader2, Search, Sparkles, Upload } from 'lucide-react'
import {
  fetchAllClients,
  fetchClientClaimStats,
  CLIENT_TYPE_LABELS,
  SELECTABLE_CLIENT_TYPES,
  type Client,
  type ClientClaimStats,
  type ClientType,
} from '@/lib/supabase/clients'
import { ClientDrawer } from './_components/client-drawer'
import { AddClientButton } from './_components/add-client-button'
import { MapPane } from './_components/map-pane'

type StatusFilter = 'all' | 'due' | 'never'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Avatar background per type — muted, matches pin colors so the list ↔ map
// visual connection is obvious without shouting.
const AVATAR_STYLE: Record<ClientType, string> = {
  tpa:               'bg-blue-100 text-blue-700 ring-blue-200',
  body_shop:         'bg-emerald-100 text-emerald-700 ring-emerald-200',
  attorney:          'bg-slate-200 text-slate-700 ring-slate-300',
  insurance_company: 'bg-slate-200 text-slate-700 ring-slate-300',
  referral:          'bg-violet-100 text-violet-700 ring-violet-200',
  other:             'bg-amber-100 text-amber-800 ring-amber-200',
  // Legacy — kept so any un-migrated 'adjuster' row still renders.
  adjuster:          'bg-blue-100 text-blue-700 ring-blue-200',
}

function avatarInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed[0].toUpperCase()
}

export function MarketingClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const openedClientId = searchParams.get('client')

  const [clients, setClients] = useState<Client[]>([])
  const [stats, setStats] = useState<Map<string, ClientClaimStats>>(new Map())
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ClientType | 'all'>('all')
  const [stateFilter, setStateFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<'name' | 'last_marketed' | 'next_remarket' | 'claims'>('name')

  const load = () => {
    setLoading(true)
    Promise.all([fetchAllClients(), fetchClientClaimStats()]).then(([cs, st]) => {
      setClients(cs)
      setStats(st)
      setLoading(false)
    })
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load
    load()
  }, [])

  const knownStates = useMemo(() => {
    const set = new Set<string>()
    for (const c of clients) if (c.state) set.add(c.state)
    return Array.from(set).sort()
  }, [clients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const today = todayISO()
    return clients.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (stateFilter && c.state !== stateFilter) return false
      if (statusFilter === 'due' && !(c.nextRemarketAt && c.nextRemarketAt <= today)) return false
      if (statusFilter === 'never' && c.lastMarketedAt !== null) return false
      if (q) {
        const hay = [c.name, c.city ?? '', c.state ?? '', c.phone ?? '', c.email ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [clients, search, typeFilter, stateFilter, statusFilter])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name)
        case 'last_marketed': return (b.lastMarketedAt ?? '').localeCompare(a.lastMarketedAt ?? '')
        case 'next_remarket': {
          if (!a.nextRemarketAt && !b.nextRemarketAt) return 0
          if (!a.nextRemarketAt) return 1
          if (!b.nextRemarketAt) return -1
          return a.nextRemarketAt.localeCompare(b.nextRemarketAt)
        }
        case 'claims': return (stats.get(b.id)?.total ?? 0) - (stats.get(a.id)?.total ?? 0)
      }
    })
    return list
  }, [filtered, sortBy, stats])

  const openClient = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('client', id)
    router.replace(`/marketing?${sp.toString()}`, { scroll: false })
  }
  const closeClient = () => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('client')
    router.replace(sp.toString() ? `/marketing?${sp.toString()}` : '/marketing', { scroll: false })
  }

  const today = todayISO()
  const dueCount = clients.filter(c => c.nextRemarketAt && c.nextRemarketAt <= today).length
  const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) + (stateFilter ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_600px] gap-6 items-start">
      {/* Left: client list */}
      <div className="flex flex-col min-h-[75vh]">
        {/* Toolbar — sticky, offset below the black app-header (h ≈ 68px)
            so it never overlaps the nav on scroll. */}
        <div className="sticky top-[68px] z-[5] -mx-1 px-1 pt-3 pb-4 bg-gray-50/90 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200/80 rounded-full pl-10 pr-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-transparent shadow-sm"
              />
            </div>
            <AddClientButton onCreated={() => { load() }} />
            <button type="button" onClick={() => downloadCsv(sorted)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Export currently filtered rows as CSV">
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" onClick={() => router.push('/marketing/import')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Import clients from a CSV">
              <Upload className="w-4 h-4" /> Import
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</Chip>
            <Chip active={statusFilter === 'due'} onClick={() => setStatusFilter('due')} tone="red">
              Due{dueCount > 0 && <span className="ml-1 opacity-70">{dueCount}</span>}
            </Chip>
            <Chip active={statusFilter === 'never'} onClick={() => setStatusFilter('never')}>Never marketed</Chip>
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ClientType | 'all')}
                    className="border border-gray-200 rounded-full pl-3 pr-6 py-1.5 bg-white text-gray-600 focus:outline-none">
              <option value="all">All types</option>
              {SELECTABLE_CLIENT_TYPES.map(t => (
                <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
                    className="border border-gray-200 rounded-full pl-3 pr-6 py-1.5 bg-white text-gray-600 focus:outline-none">
              <option value="">All states</option>
              {knownStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-2 text-gray-400">
              <span className="text-[10px] uppercase tracking-wider">Sort</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="border border-gray-200 rounded-full pl-3 pr-6 py-1.5 bg-white text-gray-600 focus:outline-none">
                <option value="name">Name</option>
                <option value="last_marketed">Last marketed</option>
                <option value="next_remarket">Next remarket</option>
                <option value="claims">Claims</option>
              </select>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span>{sorted.length} of {clients.length} client{clients.length === 1 ? '' : 's'}</span>
            {activeFilterCount > 0 && (
              <>
                <span>·</span>
                <button onClick={() => { setTypeFilter('all'); setStateFilter(''); setStatusFilter('all'); setSearch('') }}
                        className="text-gray-500 hover:text-gray-800 underline underline-offset-2">
                  clear filters
                </button>
              </>
            )}
            <span className="ml-auto">
              <button onClick={() => router.push('/marketing/backfill')} className="text-gray-400 hover:text-gray-700 underline underline-offset-2">
                Backfill from claims
              </button>
            </span>
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading clients…
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState hasFilters={activeFilterCount > 0 || !!search} />
        ) : (
          <ul className="space-y-2">
            {sorted.map(c => {
              const s = stats.get(c.id)
              const overdue = c.nextRemarketAt !== null && c.nextRemarketAt <= today
              const selected = openedClientId === c.id
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openClient(c.id)}
                    className={`group w-full flex items-center gap-4 text-left rounded-xl px-4 py-3.5 border transition-all ${
                      selected
                        ? 'bg-white border-blue-200 shadow-sm ring-2 ring-blue-500/30'
                        : 'bg-white border-gray-200/60 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ring-1 flex items-center justify-center font-semibold text-sm shrink-0 ${AVATAR_STYLE[c.type]}`}>
                      {avatarInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-[15px] font-semibold text-gray-900 truncate">{c.name}</div>
                        <div className="text-xs text-gray-400 tabular-nums shrink-0">
                          {s?.total ?? 0} claim{s?.total === 1 ? '' : 's'}
                        </div>
                      </div>
                      {(c.city || c.state || c.phone) && (
                        <div className="mt-0.5 text-xs text-gray-500 truncate">
                          {[c.city, c.state].filter(Boolean).join(', ') || c.phone}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-400">
                        <span>Last marketed <span className="text-gray-600">{fmtDate(c.lastMarketedAt)}</span></span>
                        <span className="text-gray-300">·</span>
                        <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                          Next <span className={overdue ? 'text-red-600' : 'text-gray-600'}>{fmtDate(c.nextRemarketAt)}</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${selected ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-500'}`} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Right: map — sticky below the app-header on wide screens.
          Explicit height (not min-height) so the child Map with
          height:100% actually resolves to something. */}
      <div className="rounded-2xl overflow-hidden border border-gray-200/60 bg-white shadow-sm h-[calc(100vh-120px)] xl:sticky xl:top-[84px]">
        <MapPane clients={sorted} selectedId={openedClientId} onSelect={openClient} />
      </div>

      {openedClientId && (
        <ClientDrawer clientId={openedClientId} onClose={closeClient} onSaved={() => load()} />
      )}
    </div>
  )
}

function Chip({
  active, onClick, children, tone,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'red'
}) {
  const activeCls = tone === 'red'
    ? 'bg-red-600 text-white border-red-600 shadow-sm'
    : 'bg-gray-900 text-white border-gray-900 shadow-sm'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 border rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? activeCls : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Sparkles className="w-6 h-6 text-gray-400" />
      </div>
      <div className="text-sm font-semibold text-gray-700">
        {hasFilters ? 'No clients match your filters' : 'No clients yet'}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {hasFilters ? 'Try clearing them.' : 'Add your first client to get started.'}
      </div>
    </div>
  )
}

function downloadCsv(rows: Client[]) {
  const cols: (keyof Client)[] = [
    'name', 'type', 'addressLine', 'city', 'state', 'zip', 'phone', 'email', 'website',
    'lastMarketedAt', 'remarketIntervalDays', 'nextRemarketAt', 'notes',
  ]
  const header = cols.map(c => c).join(',')
  const csv = [header, ...rows.map(r => cols.map(c => escapeCsv(String(r[c] ?? ''))).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clients-${todayISO()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
  return v
}
