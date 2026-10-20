'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { matchesClaimSearch } from '@/lib/claim-search'
import { ClaimLabelPills } from '@/components/claim/ClaimLabelPills'

// Session-scoped cache so repeatedly opening the search doesn't refetch every
// claim on every click. Invalidated on page reload.
let cachedEntries: ACVHistoryEntry[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 60_000

// Thin wrapper around the shared multi-term matcher. Returns false on empty
// query so a cold-open popover doesn't dump every row.
function entryMatches(entry: ACVHistoryEntry, q: string): boolean {
  if (!q.trim()) return false
  return matchesClaimSearch(entry, q)
}

// Nav-bar magnifying-glass button that opens a search dropdown. Admins search
// across every claim (open + closed); appraisers see only their own (either
// assigned_to = them OR handling-appraiser name matches their profile name).
// Click a result → navigate to /claims/[id]. Esc or outside-click closes.
export function ClaimSearchButton() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<ACVHistoryEntry[] | null>(cachedEntries)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load entries lazily on first open; respect the small session cache so
  // repeat opens are instant.
  useEffect(() => {
    if (!open) return
    const fresh = cachedEntries && Date.now() - cacheLoadedAt < CACHE_TTL_MS
    if (fresh) {
      setEntries(cachedEntries)
      return
    }
    setLoading(true)
    fetchACVHistory().then(data => {
      cachedEntries = data ?? []
      cacheLoadedAt = Date.now()
      setEntries(cachedEntries)
      setLoading(false)
    })
  }, [open])

  // Autofocus the input when the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Click outside closes.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const isAdmin = profile?.role === 'admin'
  const myId = profile?.id ?? null
  const myName = (profile?.name ?? '').trim().toLowerCase()

  const results = useMemo(() => {
    if (!entries) return []
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    // Scope: admins see everything; appraisers see only their own (assigned
    // or negotiating-appraiser matches their profile name).
    const scoped = isAdmin
      ? entries
      : entries.filter(e => {
          if (myId && e.assignedTo === myId) return true
          const negotiating = (e.claim?.negotiatingAppraiser ?? '').trim().toLowerCase()
          return !!myName && negotiating === myName
        })
    return scoped
      .filter(e => entryMatches(e, q))
      // Open claims above closed; within each bucket, most recently created first.
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 20)
  }, [entries, query, isAdmin, myId, myName])

  const handlePick = (id: string, e: React.MouseEvent) => {
    setOpen(false)
    setQuery('')
    // Standard web convention: Ctrl / ⌘ (and middle-click) opens in a new
    // tab; a plain click navigates in-place. Previously always opened in a
    // new tab, which Henry wants reversed.
    const newTab = e.ctrlKey || e.metaKey || e.button === 1
    if (newTab) {
      window.open(`/claims/${id}`, '_blank', 'noreferrer')
    } else {
      router.push(`/claims/${id}`)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Search claims"
        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
      >
        <Search className="w-[18px] h-[18px]" strokeWidth={2.25} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl ring-1 ring-slate-200 z-40 overflow-hidden"
          style={{ boxShadow: 'var(--hp-elev-pop)' }}
        >
          <div className="relative border-b border-slate-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isAdmin ? 'Search all claims (MA#, VIN, insured, …)' : 'Search your claims'}
              className="w-full h-11 pl-10 pr-9 text-[14px] text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading && entries === null && (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400">Loading claims…</div>
            )}
            {!loading && query.trim().length < 2 && (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                Type at least 2 characters to search.
              </div>
            )}
            {query.trim().length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                No claims match &ldquo;{query}&rdquo;.
              </div>
            )}
            {results.map(e => {
              const insured = (e.claim?.insuredName ?? '').trim()
              const vehicle = e.vehicle || [e.claim?.year, e.claim?.make, e.claim?.model].filter(Boolean).join(' ').trim()
              const subtitle = [insured, vehicle].filter(Boolean).join(' · ')
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={(ev) => handlePick(e.id, ev)}
                  onAuxClick={(ev) => { if (ev.button === 1) handlePick(e.id, ev) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-semibold text-slate-900">{e.maNumber || '—'}</span>
                      {e.status === 'closed' && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Closed</span>
                      )}
                      <ClaimLabelPills
                        supplementCount={e.supplementCount}
                        isRevision={e.isRevision}
                        isSpecialty={(e.claim?.claimTypes ?? []).includes('specialty')}
                        needsRoughNumbers={e.needsRoughNumbers}
                        claimStatus={e.status ?? 'open'}
                      />
                    </div>
                    {subtitle && (
                      <div className="text-[12px] text-slate-500 truncate">{subtitle}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
