'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatRelativeTime } from '@/lib/activity/formatters'
import {
  TICKET_STATUS_LABELS,
  type TicketStatus,
  type TicketWithSubmitter,
} from '@/lib/supabase/tickets'

type FilterStatus = 'all' | TicketStatus

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all',         label: 'All'         },
  { value: 'open',        label: 'Open'        },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved'    },
  { value: 'dismissed',   label: 'Dismissed'   },
]

const STATUS_STYLES: Record<TicketStatus, string> = {
  open:        'bg-blue-50  text-blue-700  border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed:   'bg-gray-100  text-gray-500   border-gray-200',
}

export function TicketsClient() {
  const [tickets, setTickets] = useState<TicketWithSubmitter[] | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<FilterStatus>('open')
  const [busy, setBusy]       = useState<string | null>(null) // ticket id currently being patched
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState<Record<string, string>>({}) // id → draft note

  const load = () => {
    setError(null)
    fetch('/api/admin/tickets')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: { tickets: TicketWithSubmitter[] }) => setTickets(body.tickets))
      .catch(e => setError(e.message || 'Failed to load'))
  }

  useEffect(() => { load() }, [])

  const patch = async (id: string, update: { status?: TicketStatus; resolutionNote?: string | null }) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? 'Update failed')
        return
      }
      load()
    } finally {
      setBusy(null)
    }
  }

  const saveNote = async (id: string) => {
    const note = editNotes[id] ?? ''
    await patch(id, { resolutionNote: note.trim() || null })
    setEditNotes(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const filtered = tickets
    ? (filter === 'all' ? tickets : tickets.filter(t => t.status === filter))
    : null

  // Sort: open first, then in_progress, then by created_at desc
  const sorted = filtered ? [...filtered].sort((a, b) => {
    const order: TicketStatus[] = ['open', 'in_progress', 'resolved', 'dismissed']
    const ai = order.indexOf(a.status)
    const bi = order.indexOf(b.status)
    if (ai !== bi) return ai - bi
    return b.createdAt.localeCompare(a.createdAt)
  }) : null

  return (
    <div className="space-y-4">
      {/* Status filter buttons */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.value
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {f.label}
            {f.value !== 'all' && tickets && (
              <span className={`ml-1.5 tabular-nums ${filter === f.value ? 'text-slate-300' : 'text-gray-400'}`}>
                {tickets.filter(t => t.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {!tickets && !error && (
        <div className="text-sm text-gray-500">Loading tickets…</div>
      )}

      {sorted && sorted.length === 0 && (
        <div className="text-sm text-gray-500 py-8 text-center">No tickets match this filter.</div>
      )}

      {sorted && sorted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {sorted.map(ticket => {
            const isExpanded = expandedId === ticket.id
            const isBusy = busy === ticket.id
            const draftNote = editNotes[ticket.id] ?? ticket.resolutionNote ?? ''
            const noteEdited = ticket.id in editNotes

            return (
              <div key={ticket.id} className="p-4">
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ticket.number !== null && (
                        <span className="text-xs font-bold text-gray-400 tabular-nums">#{ticket.number}</span>
                      )}
                      <span className="text-sm font-semibold text-gray-800">{ticket.subject}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLES[ticket.status]}`}>
                        {TICKET_STATUS_LABELS[ticket.status]}
                      </span>
                      {/* Reopened signal: user flipped a resolved ticket back to open.
                          Detected by (status=open AND resolution_note is set) — the
                          admin's prior resolution note is preserved on reopen. */}
                      {ticket.status === 'open' && ticket.resolutionNote && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-800 border-amber-200">
                          Reopened by user
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {ticket.submitterName}
                      {ticket.submitterEmail && <span className="ml-1 text-gray-400">({ticket.submitterEmail})</span>}
                      {' · '}
                      {formatRelativeTime(ticket.createdAt)}
                    </div>
                  </div>

                  {/* Status dropdown */}
                  <select
                    value={ticket.status}
                    disabled={isBusy}
                    onChange={e => patch(ticket.id, { status: e.target.value as TicketStatus })}
                    className="shrink-0 text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map(s => (
                      <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>
                    ))}
                  </select>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Description preview / expanded */}
                <div className={`mt-2 text-sm text-gray-700 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                  {ticket.description}
                </div>

                {/* Expanded: resolution note + timestamps */}
                {isExpanded && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Resolution note</label>
                      <textarea
                        value={draftNote}
                        onChange={e => setEditNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                        rows={2}
                        placeholder="Optional internal note…"
                        className="w-full resize-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {noteEdited && (
                        <div className="flex gap-2 mt-1.5">
                          <button
                            onClick={() => saveNote(ticket.id)}
                            disabled={isBusy}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
                          >
                            Save note
                          </button>
                          <button
                            onClick={() => setEditNotes(prev => { const n = { ...prev }; delete n[ticket.id]; return n })}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-gray-400 space-y-0.5">
                      <div>Submitted: {new Date(ticket.createdAt).toLocaleString()}</div>
                      {ticket.resolvedAt && (
                        <div>Resolved: {new Date(ticket.resolvedAt).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
