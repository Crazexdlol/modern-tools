"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ThreadFilter, ThreadListResponse, ThreadListItem } from '@/app/api/negotiations/threads/route'
import type { ClaimSearchResult } from '@/app/api/negotiations/search-claims/route'
import { RefreshCw, AlertTriangle, Paperclip, ExternalLink, Link as LinkIcon, X, Car, ArrowRight, Sparkles, Search, Trash2, Archive, MoreVertical } from 'lucide-react'

interface SyncState {
  running: boolean
  lastSyncedAt: string | null
  lastError: string | null
  configMissing: string[] | null
  lastReport: string | null
}

// Order matters: primary triage tabs first (needs_response, unmatched),
// then archived/filtered (spam), then completed (responded) on the right.
// "All" removed — the tab counters already make the whole picture visible.
const FILTERS: { id: ThreadFilter; label: string }[] = [
  { id: 'needs_response', label: 'Needs response' },
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'closed_claim', label: 'Closed claim' },
  { id: 'spam', label: 'Spam' },
  { id: 'responded', label: 'Responded' },
]

interface ThreadGroup {
  claimId: string | null
  claimNumber: string | null  // ma_number
  claimVehicle: string | null
  threads: ThreadListItem[]
  needsReplyCount: number
  latestSentAt: string
}

function groupByClaim(threads: ThreadListItem[]): ThreadGroup[] {
  const map = new Map<string, ThreadGroup>()
  const unmatched: ThreadGroup[] = []

  for (const t of threads) {
    if (!t.claimId) {
      // Unmatched threads are their own one-thread "group" — never merged.
      unmatched.push({
        claimId: null,
        claimNumber: null,
        claimVehicle: null,
        threads: [t],
        needsReplyCount: t.status === 'needs_response' ? 1 : 0,
        latestSentAt: t.lastSentAt,
      })
      continue
    }
    const existing = map.get(t.claimId)
    if (existing) {
      existing.threads.push(t)
      if (t.status === 'needs_response') existing.needsReplyCount++
      if (t.lastSentAt > existing.latestSentAt) existing.latestSentAt = t.lastSentAt
    } else {
      map.set(t.claimId, {
        claimId: t.claimId,
        claimNumber: t.claimNumber,
        claimVehicle: t.claimVehicle,
        threads: [t],
        needsReplyCount: t.status === 'needs_response' ? 1 : 0,
        latestSentAt: t.lastSentAt,
      })
    }
  }

  // Sort threads within each group so threads[0] is the most recent — that's
  // the one the collapsed list row displays.
  for (const g of map.values()) {
    g.threads.sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt))
  }

  // Interleave matched + unmatched groups by latest activity.
  const all = [...map.values(), ...unmatched]
  all.sort((a, b) => b.latestSentAt.localeCompare(a.latestSentAt))
  return all
}

export function NegotiationsClient() {
  const [filter, setFilter] = useState<ThreadFilter>('needs_response')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<ThreadListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [sync, setSync] = useState<SyncState>({ running: false, lastSyncedAt: null, lastError: null, configMissing: null, lastReport: null })
  const [pickerThreadId, setPickerThreadId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const fetchThreads = useCallback(async (nextFilter: ThreadFilter, nextSearch: string, opts?: { withCounters?: boolean }) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const params = new URLSearchParams({ filter: nextFilter })
      if (nextSearch) params.set('q', nextSearch)
      // Counters only change when data changes — request them on mount + after
      // sync + after row actions. Filter clicks skip the counter round-trip
      // and reuse whatever's on screen.
      if (opts?.withCounters) params.set('counters', '1')
      const res = await fetch(`/api/negotiations/threads?${params.toString()}`, { signal: controller.signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load threads (${res.status})`)
      const json = (await res.json()) as ThreadListResponse
      setData(prev => ({
        threads: json.threads,
        // Preserve prior counters when the current response didn't include them.
        counters: json.counters ?? prev?.counters ?? { needs_response: 0, unmatched: 0, spam: 0, responded_today: 0, awaiting_oa_reply: 0, closed_claim: 0 },
        meta: json.meta,
      }))
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      console.error('fetchThreads failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const runSync = useCallback(async () => {
    setSync(s => ({ ...s, running: true, lastError: null, lastReport: null }))
    let totalNew = 0
    let totalMatched = 0
    let totalSpam = 0
    let configMissing: string[] | null = null
    let lastError: string | null = null

    try {
      for (let i = 0; i < 4; i++) {
        const res = await fetch('/api/negotiations/sync', { method: 'POST', cache: 'no-store' })
        const json = await res.json() as { ok: boolean; newMessages?: number; errors?: string[]; configMissing?: string[] }
        totalNew += json.newMessages ?? 0
        if (json.configMissing) configMissing = json.configMissing
        if (!json.ok && json.errors?.length) lastError = json.errors.join(' · ')
        if ((json.newMessages ?? 0) === 0) break
      }

      for (let i = 0; i < 8; i++) {
        const res = await fetch('/api/negotiations/process', { method: 'POST', cache: 'no-store' })
        const json = await res.json() as {
          ok: boolean
          processed?: number
          autoMatched?: number
          classified?: { automated?: number }
          moreAvailable?: boolean
          errors?: string[]
        }
        totalMatched += json.autoMatched ?? 0
        totalSpam += json.classified?.automated ?? 0
        if (!json.ok && json.errors?.length) lastError = json.errors.join(' · ')
        if (!json.moreAvailable) break
      }

      const report = totalNew || totalMatched || totalSpam
        ? [
            totalNew ? `${totalNew} new` : null,
            totalMatched ? `${totalMatched} auto-linked` : null,
            totalSpam ? `${totalSpam} spam` : null,
          ].filter(Boolean).join(' · ')
        : 'Up to date'

      setSync({
        running: false,
        lastSyncedAt: new Date().toISOString(),
        lastError,
        configMissing,
        lastReport: report,
      })
      await fetchThreads(filter, search, { withCounters: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSync(s => ({ ...s, running: false, lastError: msg }))
    }
  }, [filter, search, fetchThreads])

  // Debounce search input: waits 250ms after typing stops before firing.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(t)
  }, [search])

  // Single effect handles mount, filter change, and search. First call also
  // requests counters so the badge counts aren't stale on first paint. Any
  // earlier split caused a race where the mount's counters request was
  // aborted by the main effect's call — leaving counters zeroed until Sync.
  const didInitialCountersRef = useRef(false)
  useEffect(() => {
    fetchThreads(filter, debouncedSearch, { withCounters: !didInitialCountersRef.current })
    didInitialCountersRef.current = true
  }, [filter, debouncedSearch, fetchThreads])

  const onLinkedManually = useCallback(async () => {
    setPickerThreadId(null)
    await fetchThreads(filter, search)
  }, [filter, search, fetchThreads])

  // Clear bulk selection whenever the filter changes — the displayed list
  // is now different, and leftover selections would be invisible.
  useEffect(() => { clearSelection() }, [filter, clearSelection])

  const bulkStatus = useCallback(async (status: 'ignored' | 'spam' | 'closed_claim') => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const verb = status === 'ignored' ? 'archive' : status === 'spam' ? 'mark as spam' : 'move to Closed claim'
    if (!window.confirm(`${verb} ${ids.length} thread${ids.length === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/negotiations/threads/${id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      ))
      clearSelection()
      await fetchThreads(filter, search, { withCounters: true })
    } finally { setBulkBusy(false) }
  }, [selectedIds, clearSelection, fetchThreads, filter, search])

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Permanently delete ${ids.length} thread${ids.length === 1 ? '' : 's'}? This removes the emails from HamsPortal — the mail stays in your mailbox.`)) return
    setBulkBusy(true)
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/negotiations/threads/${id}/delete`, { method: 'POST' })
      ))
      clearSelection()
      await fetchThreads(filter, search, { withCounters: true })
    } finally { setBulkBusy(false) }
  }, [selectedIds, clearSelection, fetchThreads, filter, search])

  const selectAllVisible = useCallback(() => {
    if (!data) return
    setSelectedIds(new Set(data.threads.map(t => t.id)))
  }, [data])

  return (
    <div>
      {sync.configMissing && sync.configMissing.length > 0 && (
        <Banner tone="amber" icon={<AlertTriangle className="w-4 h-4" />} title="Mailbox not connected">
          Set these env vars in Vercel to enable IMAP sync: {sync.configMissing.join(', ')}.
        </Banner>
      )}
      {sync.lastError && !sync.configMissing && (
        <Banner tone="red" icon={<AlertTriangle className="w-4 h-4" />} title="Mailbox connect failed">
          {sync.lastError}
        </Banner>
      )}

      {/* Counter cards — click a counter to jump to that filter. */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <Counter label="Needs response" value={data?.counters?.needs_response ?? 0} tone="red"    onClick={() => setFilter('needs_response')} active={filter === 'needs_response'} />
        <Counter label="Unmatched"      value={data?.counters?.unmatched ?? 0}       tone="amber"  onClick={() => setFilter('unmatched')} active={filter === 'unmatched'} />
        <Counter label="Closed claim"   value={data?.counters?.closed_claim ?? 0}    tone="slate"  onClick={() => setFilter('closed_claim')} active={filter === 'closed_claim'} />
        <Counter label="Awaiting reply" value={data?.counters?.awaiting_oa_reply ?? 0} tone="slate" />
        <Counter label="Responded today" value={data?.counters?.responded_today ?? 0} tone="green" onClick={() => setFilter('responded')} active={filter === 'responded'} />
      </div>

      {/* Toolbar: filters, search, sync button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search subject, sender, body…"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {(sync.lastReport || sync.lastSyncedAt) && !sync.running && (
            <span className="text-xs text-gray-500">
              {sync.lastReport}
              {sync.lastSyncedAt && ` · ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`}
            </span>
          )}
          <Link
            href="/negotiations/muted"
            title="Manage muted senders"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-300 transition"
          >
            <Archive className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={runSync}
            disabled={sync.running}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium shadow-sm hover:bg-gray-800 disabled:opacity-60 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sync.running ? 'animate-spin' : ''}`} />
            {sync.running ? 'Syncing' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Thread list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading && !data && (
          <div className="p-10 text-center text-sm text-gray-400">Loading threads…</div>
        )}
        {data && data.threads.length === 0 && (
          <div className="p-10 text-center">
            <div className="text-sm text-gray-500 mb-1">
              {filter === 'needs_response' ? 'Inbox zero.' :
               filter === 'unmatched'      ? 'Nothing unmatched.' :
               filter === 'closed_claim'   ? 'No emails on closed claims.' :
               filter === 'responded'      ? 'No responded threads yet.' :
               'No emails in this view.'}
            </div>
            {filter === 'needs_response' && (
              <div className="text-xs text-gray-400">Auto-matched threads land here after Sync.</div>
            )}
          </div>
        )}
        {data && data.threads.length > 0 && (
          <>
            {selectedIds.size > 0 && (
              <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-2 flex items-center gap-3 border-b border-slate-800">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <button
                  onClick={() => bulkStatus('ignored')}
                  disabled={bulkBusy}
                  className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 transition disabled:opacity-50"
                >Archive</button>
                <button
                  onClick={() => bulkStatus('spam')}
                  disabled={bulkBusy}
                  className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 transition disabled:opacity-50"
                >Spam</button>
                <button
                  onClick={() => bulkStatus('closed_claim')}
                  disabled={bulkBusy}
                  className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 transition disabled:opacity-50"
                >Closed claim</button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  className="text-xs px-3 py-1 rounded-md bg-red-700 hover:bg-red-600 transition disabled:opacity-50"
                >Delete</button>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={selectAllVisible}
                    disabled={bulkBusy}
                    className="text-xs px-2 py-1 rounded-md hover:bg-slate-800 transition disabled:opacity-50"
                  >Select all visible</button>
                  <button
                    onClick={clearSelection}
                    disabled={bulkBusy}
                    className="text-xs px-2 py-1 rounded-md hover:bg-slate-800 transition disabled:opacity-50"
                  >Clear</button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-gray-100">
              {groupByClaim(data.threads).map(g => {
                // One row per claim. For claims with multiple chains, show the
                // most-recent thread and badge the extra count — the detail page
                // surfaces the other chains for review.
                const primary = g.threads[0]
                const extraChains = g.threads.length - 1
                return (
                  <ThreadRow
                    key={primary.id}
                    thread={primary}
                    extraChains={extraChains}
                    isSelected={selectedIds.has(primary.id)}
                    onToggleSelect={() => toggleSelect(primary.id)}
                    onLinkClaim={() => setPickerThreadId(primary.id)}
                    onChanged={() => fetchThreads(filter, search, { withCounters: true })}
                  />
                )
              })}
            </ul>
          </>
        )}
      </div>

      {pickerThreadId && (
        <ClaimPickerModal
          threadId={pickerThreadId}
          onClose={() => setPickerThreadId(null)}
          onLinked={onLinkedManually}
        />
      )}
    </div>
  )
}

function Banner({ tone, icon, title, children }: { tone: 'red' | 'amber'; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const cls =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  const iconCls = tone === 'red' ? 'text-red-600' : 'text-amber-600'
  return (
    <div className={`mb-4 rounded-lg border p-3 flex items-start gap-2 ${cls}`}>
      <div className={`mt-0.5 shrink-0 ${iconCls}`}>{icon}</div>
      <div className="text-sm">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function Counter({ label, value, tone, onClick, active }: { label: string; value: number; tone: 'red' | 'green' | 'amber' | 'slate'; onClick?: () => void; active?: boolean }) {
  const toneDot =
    tone === 'red'   ? 'bg-red-500'   :
    tone === 'green' ? 'bg-emerald-500' :
    tone === 'amber' ? 'bg-amber-500' :
                       'bg-slate-400'
  const toneValue =
    tone === 'red'   ? 'text-red-600'   :
    tone === 'green' ? 'text-emerald-600' :
    tone === 'amber' ? 'text-amber-600' :
                       'text-slate-700'
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl bg-white border transition p-4 shadow-sm ${
        active ? 'border-gray-900 ring-2 ring-gray-900/5' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${toneDot}`} />
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${toneValue}`}>{value}</div>
    </button>
  )
}

function ThreadRow({ thread, onLinkClaim, onChanged, extraChains = 0, isSelected = false, onToggleSelect }: { thread: ThreadListItem; onLinkClaim: () => void; onChanged: () => void; extraChains?: number; isSelected?: boolean; onToggleSelect?: () => void }) {
  const senderDisplay = thread.lastFromName || thread.lastFromAddr.split('@')[0]
  const senderDomain = thread.lastFromAddr.split('@')[1] ?? ''
  const dt = new Date(thread.lastSentAt)
  const now = new Date()
  const isToday = now.toDateString() === dt.toDateString()
  const dateLabel = isToday
    ? dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : dt.toLocaleDateString([], { month: 'short', day: 'numeric' })

  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'archive' | 'spam' | 'delete'>(null)

  const setStatus = async (status: 'ignored' | 'spam') => {
    setBusy(status === 'ignored' ? 'archive' : 'spam')
    try {
      await fetch(`/api/negotiations/threads/${thread.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onChanged()
    } finally { setBusy(null); setMenuOpen(false) }
  }
  const doDelete = async () => {
    if (!window.confirm('Delete this thread permanently? This removes the emails and attachments from HamsPortal — the mail stays in your mailbox.')) return
    setBusy('delete')
    try {
      await fetch(`/api/negotiations/threads/${thread.id}/delete`, { method: 'POST' })
      onChanged()
    } finally { setBusy(null); setMenuOpen(false) }
  }

  const mute = async (which: 'sender' | 'domain') => {
    const email = thread.lastFromAddr.toLowerCase()
    const atIdx = email.indexOf('@')
    const domain = atIdx > 0 ? email.slice(atIdx + 1) : ''
    const payload = which === 'sender' ? { email } : { domain }
    if (which === 'domain' && !domain) return
    const label = which === 'sender' ? email : `@${domain}`
    if (!window.confirm(`Mute ${label}? Future emails will skip the triage view.`)) return
    setBusy('spam')
    try {
      const res = await fetch('/api/negotiations/mute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        window.alert(`Mute failed (${res.status}). ${detail}`.trim())
        return
      }
      onChanged()
    } finally { setBusy(null); setMenuOpen(false) }
  }

  return (
    <li className="group relative">
      <StatusAccent status={thread.status} />
      <div className="pl-4 pr-4 py-3.5 hover:bg-gray-50/70 transition">
        <div className="flex items-start gap-4">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 w-4 h-4 rounded border-gray-300 text-slate-900 focus:ring-slate-500 shrink-0 cursor-pointer"
              aria-label="Select thread"
            />
          )}
          <SenderAvatar name={senderDisplay} status={thread.status} />

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-gray-900 text-sm truncate">{senderDisplay}</span>
              {senderDomain && <span className="text-xs text-gray-400 truncate">@ {senderDomain}</span>}
              <span className="ml-auto text-xs text-gray-400 shrink-0">{dateLabel}</span>
            </div>
            <div className="text-sm text-gray-800 truncate mb-0.5">{thread.subject}</div>
            <div className="text-xs text-gray-500 line-clamp-1">{thread.snippet}</div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusPill status={thread.status} />
              {thread.hasDraft && thread.status !== 'responded' && <DraftReadyPill />}
              {thread.hasAttachments && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <Paperclip className="w-3 h-3" /> attachment
                </span>
              )}
              {thread.claimId ? (
                <ClaimChip number={thread.claimNumber} vehicle={thread.claimVehicle} />
              ) : (
                <button
                  onClick={onLinkClaim}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                >
                  <LinkIcon className="w-3 h-3" /> Link claim
                </button>
              )}
              {extraChains > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-700" title="Additional email chains on this claim — view inside the thread">
                  +{extraChains} more chain{extraChains === 1 ? '' : 's'}
                </span>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {thread.claimId && (
                  <a
                    href={`/claims/${thread.claimId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                  >
                    Claim <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <Link
                  href={`/negotiations/${thread.id}`}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-md font-medium transition ${
                    thread.hasDraft && thread.status !== 'responded'
                      ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm ring-1 ring-purple-300'
                      : thread.claimId
                      ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                      : 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
                  }`}
                >
                  {thread.hasDraft && thread.status !== 'responded'
                    ? <><Sparkles className="w-3 h-3" /> Open draft</>
                    : thread.claimId
                      ? <><Sparkles className="w-3 h-3" /> Draft reply</>
                      : <>Open <ArrowRight className="w-3 h-3" /></>}
                </Link>

                {/* Overflow menu: Archive / Mark spam / Delete */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                    aria-label="More actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        {thread.status !== 'ignored' && (
                          <button
                            onClick={() => setStatus('ignored')}
                            disabled={busy !== null}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Archive className="w-3.5 h-3.5 text-gray-500" /> {busy === 'archive' ? 'Archiving…' : 'Archive'}
                          </button>
                        )}
                        {thread.status !== 'spam' && (
                          <button
                            onClick={() => setStatus('spam')}
                            disabled={busy !== null}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className="inline-block w-3.5 h-3.5 rounded-full bg-slate-400" /> {busy === 'spam' ? 'Marking…' : 'Mark as spam'}
                          </button>
                        )}
                        <button
                          onClick={() => mute('sender')}
                          disabled={!thread.lastFromAddr}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
                        >
                          Mute this sender
                        </button>
                        <button
                          onClick={() => mute('domain')}
                          disabled={!thread.lastFromAddr.includes('@')}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent"
                        >
                          Mute entire domain
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={doDelete}
                          disabled={busy !== null}
                          className="w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

function DraftReadyPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 h-5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
      <Sparkles className="w-2.5 h-2.5" /> Draft ready
    </span>
  )
}

function StatusAccent({ status }: { status: string }) {
  const cls =
    status === 'needs_response' ? 'bg-red-500' :
    status === 'responded'      ? 'bg-emerald-500' :
    status === 'unmatched'      ? 'bg-amber-400' :
    status === 'spam'           ? 'bg-slate-300' :
    status === 'closed_claim'   ? 'bg-slate-400' :
                                  'bg-slate-300'
  return <div className={`absolute left-0 top-0 bottom-0 w-1 ${cls}`} aria-hidden />
}

function SenderAvatar({ name, status }: { name: string; status: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('') || '?'
  const bg =
    status === 'responded' ? 'bg-emerald-100 text-emerald-800' :
    status === 'spam'      ? 'bg-slate-100 text-slate-500' :
                             'bg-slate-100 text-slate-700'
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${bg}`}>
      {initials}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    needs_response: { label: 'Needs reply', className: 'bg-red-50 text-red-700 border-red-200' },
    responded:      { label: 'Responded',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    unmatched:      { label: 'Unmatched',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
    ignored:        { label: 'Ignored',     className: 'bg-slate-50 text-slate-600 border-slate-200' },
    spam:           { label: 'Spam',        className: 'bg-slate-50 text-slate-500 border-slate-200' },
    closed_claim:   { label: 'Closed claim', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  }
  const s = map[status] ?? { label: status, className: 'bg-slate-50 text-slate-700 border-slate-200' }
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${s.className}`}>
      {s.label}
    </span>
  )
}

function ClaimChip({ number, vehicle }: { number: string | null; vehicle: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-700">
      <Car className="w-3 h-3 text-gray-400" />
      <span className="font-medium">{number ?? '—'}</span>
      {vehicle && <span className="text-gray-500 truncate max-w-[220px]">· {vehicle}</span>}
    </span>
  )
}

function ClaimPickerModal({ threadId, onClose, onLinked }: { threadId: string; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ClaimSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/negotiations/search-claims?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        const json = await res.json() as { results: ClaimSearchResult[] }
        setResults(json.results ?? [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const link = async (claimId: string) => {
    setLinking(claimId); setError(null)
    try {
      const res = await fetch(`/api/negotiations/threads/${threadId}/match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claimId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onLinked()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Link to a claim</h2>
            <p className="text-xs text-gray-500 mt-0.5">Once linked, future emails from this sender will auto-match this claim.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search MA#, VIN, claimant name, vehicle…"
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
          </div>
          {loading && <div className="text-sm text-gray-500 mt-3">Searching…</div>}
          {error && <div className="text-sm text-red-700 mt-3">{error}</div>}
          {!loading && q.length >= 2 && results.length === 0 && (
            <div className="text-sm text-gray-500 mt-3">No matches.</div>
          )}
          <ul className="mt-3 max-h-[380px] overflow-y-auto -mx-1">
            {results.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-gray-50">
                <Car className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {r.maNumber ?? r.id}
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${r.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {r.vehicle ?? '—'} · {r.claimantName ?? r.insuredName ?? '—'}
                  </div>
                </div>
                <button
                  onClick={() => link(r.id)}
                  disabled={linking !== null}
                  className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {linking === r.id ? 'Linking…' : 'Link'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
