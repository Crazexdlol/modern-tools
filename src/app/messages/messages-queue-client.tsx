"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { fetchUnreadQueue, type UnreadClaim } from '@/lib/supabase/messages'
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { fetchAllProfilesBrowser, useCurrentProfile, type Profile } from '@/lib/supabase/profiles'
import { Button } from '@/components/ui/button'
import { ClaimMessagePreview } from '@/components/claim-message-preview'

// Last-message label trimmed to date + sender (no clock time) per Henry's spec.
function fmtLastDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Pulls out loss state from a US-style owner address string (last comma-sep
// token's leading 2-letter code). Same cheap heuristic used on the main
// dashboard — kept inline here to avoid a cross-file import for one line.
function stateFromAddress(addr: string | undefined | null): string {
  if (!addr) return ''
  const parts = addr.split(',')
  const last = (parts[parts.length - 1] ?? '').trim()
  const m = last.match(/^([A-Za-z]{2})/)
  return m ? m[1].toUpperCase() : ''
}

interface MergedRow extends UnreadClaim {
  entry: ACVHistoryEntry | null
}

export function MessagesQueueClient() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'
  const [unread, setUnread] = useState<UnreadClaim[] | null>(null)
  const [entries, setEntries] = useState<ACVHistoryEntry[] | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load unread queue + all claim rows + profiles in parallel. Entries are
  // enriched locally so the row-level columns (Client, VIN, Ins. Co., etc.)
  // match the main dashboard without a per-row fetch. Profiles are used by
  // the admin-only Assigned To column.
  useEffect(() => {
    Promise.all([
      fetchUnreadQueue().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load queue')
        return [] as UnreadClaim[]
      }),
      fetchACVHistory().then(res => res ?? []),
      fetchAllProfilesBrowser(),
    ]).then(([q, e, p]) => {
      setUnread(q)
      setEntries(e)
      setProfiles(p)
    })
  }, [])

  const nameFor = (userId: string | null | undefined): string => {
    if (!userId) return ''
    const p = profiles.find(x => x.id === userId)
    return p ? (p.name || p.email) : ''
  }

  const rows: MergedRow[] = useMemo(() => {
    if (!unread) return []
    if (!entries) return unread.map(u => ({ ...u, entry: null }))
    const byId = new Map(entries.map(e => [e.id, e] as const))
    return unread.map(u => ({ ...u, entry: byId.get(u.claimId) ?? null }))
  }, [unread, entries])

  if (error) {
    return (
      <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
    )
  }

  if (unread === null) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    return <div className="text-sm text-gray-500 italic">No unread messages.</div>
  }

  const openMessages = (claimId: string) => {
    // New tab so the queue stays in place behind the opened claim; browser
    // auto-focuses the new tab for user-initiated clicks.
    window.open(`/claims/${encodeURIComponent(claimId)}?tab=messages`, '_blank', 'noreferrer')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">MA #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Insured</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Vehicle</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">VIN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">State</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Ins. Co.</th>
              {isAdmin && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Assigned To</th>
              )}
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Unread</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Last message</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const vin = r.entry?.vin || ''
              const vehicle = r.entry?.vehicle || r.vehicle
              const insured = r.entry?.claim?.insuredName || r.insuredName
              const client = r.entry?.claim?.clientName ?? ''
              const insco = r.entry?.claim?.insuranceCompany ?? ''
              const state = stateFromAddress(r.entry?.claim?.ownerAddress)
              return (
                <tr
                  key={r.claimId}
                  onDoubleClick={() => openMessages(r.claimId)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-2.5 text-gray-900 font-mono text-xs align-middle whitespace-nowrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        href={`/claims/${encodeURIComponent(r.claimId)}?tab=messages`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-blue-600 font-semibold"
                      >
                        {r.maNumber || r.claimId}
                      </Link>
                      <ClaimMessagePreview claimId={r.claimId} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-900 align-middle truncate" title={insured || undefined}>
                    {insured || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 align-middle truncate" title={client || undefined}>
                    {client || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 align-middle truncate" title={vehicle || undefined}>
                    {vehicle || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900 font-mono text-xs align-middle whitespace-nowrap">
                    {vin || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 align-middle whitespace-nowrap">
                    {state || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 align-middle truncate" title={insco || undefined}>
                    {insco || <span className="text-gray-400">—</span>}
                  </td>
                  {isAdmin && (() => {
                    const assigneeName = nameFor(r.entry?.assignedTo)
                    return (
                      <td className="px-4 py-2.5 text-gray-900 align-middle truncate" title={assigneeName || undefined}>
                        {assigneeName || <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                    )
                  })()}
                  <td className="px-4 py-2.5 align-middle">
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-blue-600 text-white text-xs font-bold">
                      {r.unreadCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 align-middle whitespace-nowrap">
                    {fmtLastDate(r.lastMessageAt)} <span className="text-gray-400">·</span> {r.lastMessageFrom}
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap text-right">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
                      onClick={() => openMessages(r.claimId)}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Messages
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
