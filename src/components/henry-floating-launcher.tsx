"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, X, Ticket, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { formatRelativeTime } from '@/lib/activity/formatters'
import {
  MAX_TICKET_SUBJECT_LEN,
  TICKET_STATUS_LABELS,
  submitTicketViaApi,
  type Ticket as TicketRecord,
  type TicketStatus,
} from '@/lib/supabase/tickets'

/**
 * Floating circular button at any corner of the screen (user drags to
 * reposition; corner choice persists in localStorage). Click opens a
 * popover with two tabs: "Submit" (file a new ticket) and "My tickets"
 * (user's own history with Open/Resolved sub-tabs). Admin updates to a
 * ticket's status + resolution note at /admin/settings/tickets land here
 * on the user's side within 30 s.
 *
 * Hidden on /login (not signed in).
 */
const STATUS_STYLES: Record<TicketStatus, string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed:   'bg-gray-100 text-gray-500 border-gray-200',
}

type Tab = 'submit' | 'mine'
type SubTab = 'open' | 'resolved'
type Corner = 'bl' | 'br' | 'tl' | 'tr'

const CORNER_STORAGE_KEY = 'hams-ticket-launcher-corner'
const DEFAULT_CORNER: Corner = 'br'

const BUTTON_CORNER_CLASS: Record<Corner, string> = {
  bl: 'bottom-6 left-6',
  br: 'bottom-6 right-6',
  tl: 'top-6 left-6',
  tr: 'top-6 right-6',
}

const POPOVER_CORNER_CLASS: Record<Corner, string> = {
  bl: 'bottom-6 left-6',
  br: 'bottom-6 right-6',
  tl: 'top-6 left-6',
  tr: 'top-6 right-6',
}

const isOpenState = (s: TicketStatus) => s === 'open' || s === 'in_progress'
const isResolvedState = (s: TicketStatus) => s === 'resolved' || s === 'dismissed'

export function HenryFloatingLauncher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('submit')
  const [subTab, setSubTab] = useState<SubTab>('open')

  // Draggable corner. Loaded from localStorage on mount.
  const [corner, setCorner] = useState<Corner>(DEFAULT_CORNER)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean; pointerId: number } | null>(null)

  // Expanded ticket IDs (click a card to toggle full description + resolution).
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useState<string>('')
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [ticketSuccess, setTicketSuccess] = useState(false)
  // Ticket number returned by the server on successful submit — shown in the
  // success state so the user can quote it on follow-up (null if the server
  // couldn't produce one, e.g. pre-migration).
  const [lastTicketNumber, setLastTicketNumber] = useState<number | null>(null)

  // My tickets state
  const [myTickets, setMyTickets] = useState<TicketRecord[] | null>(null)
  const [myError, setMyError] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)

  const hidden = pathname === '/login'

  // Also hide while the create-reminder sheet is open so the floating button
  // doesn't overlap the sheet's Create button at bottom-right.
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false)
  useEffect(() => {
    const check = () => setReminderSheetOpen(document.body.classList.contains('reminder-sheet-open'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Load saved corner on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CORNER_STORAGE_KEY) as Corner | null
      if (saved && ['bl','br','tl','tr'].includes(saved)) setCorner(saved)
    } catch { /* localStorage unavailable — stick with default */ }
  }, [])

  const loadMyTickets = useCallback(async () => {
    setMyError(null)
    try {
      const res = await fetch('/api/tickets')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body: { tickets: TicketRecord[] } = await res.json()
      setMyTickets(body.tickets)
    } catch (err) {
      setMyError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  // Load when the My tickets tab opens, and poll every 30s while it's open
  // so status flips from the admin side land without a manual refresh.
  useEffect(() => {
    if (!open || tab !== 'mine') return
    loadMyTickets()
    const id = setInterval(loadMyTickets, 30_000)
    return () => clearInterval(id)
  }, [open, tab, loadMyTickets])

  const submitTicket = async () => {
    const subj = ticketSubject.trim()
    const desc = ticketDescription.trim()
    if (!subj) { setTicketError('Please enter a subject.'); return }
    if (!desc) { setTicketError('Please enter a description.'); return }
    setTicketSubmitting(true)
    setTicketError(null)
    const result = await submitTicketViaApi({ subject: subj, description: desc })
    setTicketSubmitting(false)
    if (!result.ok) {
      setTicketError(result.error ?? 'Submission failed. Please try again.')
      return
    }
    setTicketSuccess(true)
    setLastTicketNumber(result.number ?? null)
    setTicketDescription('')
    setTicketSubject('')
    loadMyTickets()
  }

  const reopenTicket = async (id: string) => {
    setReopeningId(id)
    try {
      const res = await fetch(`/api/tickets/${id}/reopen`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setMyError(body.error ?? `Reopen failed (${res.status})`)
        return
      }
      // Switch to Open sub-tab so the user sees where the ticket moved.
      setSubTab('open')
      setExpandedId(null)
      await loadMyTickets()
    } finally {
      setReopeningId(null)
    }
  }

  const resetAndClose = () => {
    setOpen(false)
    setTicketSuccess(false)
    setTicketError(null)
    setExpandedId(null)
  }

  // Drag handlers on the floating button. A click = pointer-up without having
  // moved past DRAG_THRESHOLD; a drag ends by snapping to the nearest corner.
  const DRAG_THRESHOLD = 6
  const BUTTON_RADIUS = 28  // half of 56px (w-14 h-14)

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragStateRef.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    s.moved = true
    setDragPos({ x: e.clientX - BUTTON_RADIUS, y: e.clientY - BUTTON_RADIUS })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragStateRef.current
    if (!s) return
    try { e.currentTarget.releasePointerCapture(s.pointerId) } catch {}
    dragStateRef.current = null

    if (s.moved && dragPos) {
      // Snap to the corner whose quadrant the button center lands in.
      const w = window.innerWidth
      const h = window.innerHeight
      const cx = dragPos.x + BUTTON_RADIUS
      const cy = dragPos.y + BUTTON_RADIUS
      const horz: 'l' | 'r' = cx < w / 2 ? 'l' : 'r'
      const vert: 't' | 'b' = cy < h / 2 ? 't' : 'b'
      const next = (vert + horz) as Corner
      setCorner(next)
      try { localStorage.setItem(CORNER_STORAGE_KEY, next) } catch {}
      setDragPos(null)
    } else {
      // Not a drag — treat as a click.
      setDragPos(null)
      setOpen(true)
    }
  }

  if (hidden || reminderSheetOpen) return null

  const buckets = {
    open: myTickets?.filter(t => isOpenState(t.status)) ?? [],
    resolved: myTickets?.filter(t => isResolvedState(t.status)) ?? [],
  }
  const openBadge = buckets.open.length
  const visibleTickets = subTab === 'open' ? buckets.open : buckets.resolved

  return (
    <>
      {!open && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Submit a ticket"
          className={`no-print fixed z-40 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center ${
            dragPos ? 'cursor-grabbing' : 'cursor-grab hover:scale-105 transition-all'
          } ${dragPos ? '' : BUTTON_CORNER_CLASS[corner]}`}
          style={dragPos ? { left: dragPos.x, top: dragPos.y, touchAction: 'none' } : { touchAction: 'none' }}
        >
          <Ticket className="w-6 h-6 pointer-events-none" />
        </button>
      )}

      {open && (
        <div
          className={`no-print fixed z-50 w-[400px] max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden ${POPOVER_CORNER_CLASS[corner]}`}
          style={{ maxHeight: 'calc(100vh - 48px)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">Tickets</div>
                <div className="text-[11px] text-blue-100/90 leading-tight">Flag a bug, request a feature, or track your tickets</div>
              </div>
            </div>
            <button
              onClick={resetAndClose}
              className="text-blue-100 hover:text-white w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main tabs */}
          <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
            <button
              onClick={() => setTab('submit')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                tab === 'submit' ? 'bg-white text-gray-900 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Submit
            </button>
            <button
              onClick={() => setTab('mine')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'mine' ? 'bg-white text-gray-900 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              My tickets
              {openBadge > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  tab === 'mine' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-700'
                }`}>
                  {openBadge}
                </span>
              )}
            </button>
          </div>

          {tab === 'submit' && (
            <div className="p-4 space-y-3 overflow-y-auto">
              {ticketSuccess ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                    Thanks — your ticket was submitted
                    {lastTicketNumber !== null && (
                      <> as <span className="font-bold tabular-nums">Ticket #{lastTicketNumber}</span></>
                    )}
                    . We&apos;ll follow up as soon as we can.
                    {lastTicketNumber !== null && (
                      <div className="mt-1 text-[11px] text-emerald-700">
                        Keep this number if you want to follow up by phone.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTicketSuccess(false)}
                      className="flex-1 py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold"
                    >
                      Submit another
                    </button>
                    <button
                      onClick={() => { setTicketSuccess(false); setTab('mine') }}
                      className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                    >
                      View my tickets
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      disabled={ticketSubmitting}
                      maxLength={MAX_TICKET_SUBJECT_LEN}
                      placeholder="e.g. ACV Report typo, Login not working…"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                    <textarea
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      disabled={ticketSubmitting}
                      rows={5}
                      placeholder="What's the issue, feature request, or question?"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[100px]"
                    />
                  </div>
                  {ticketError && (
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">{ticketError}</div>
                  )}
                  <button
                    onClick={submitTicket}
                    disabled={ticketSubmitting || !ticketDescription.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {ticketSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
                    {ticketSubmitting ? 'Submitting…' : 'Submit ticket'}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'mine' && (
            <div className="flex flex-col min-h-0 flex-1">
              {/* Open / Resolved sub-tabs */}
              <div className="flex gap-1 px-3 pt-2.5 pb-2 border-b border-gray-100 shrink-0">
                <SubTabPill
                  label="Open"
                  active={subTab === 'open'}
                  count={buckets.open.length}
                  onClick={() => { setSubTab('open'); setExpandedId(null) }}
                />
                <SubTabPill
                  label="Resolved"
                  active={subTab === 'resolved'}
                  count={buckets.resolved.length}
                  onClick={() => { setSubTab('resolved'); setExpandedId(null) }}
                />
              </div>

              {/* Scrollable ticket list */}
              <div className="flex-1 overflow-y-auto p-2 min-h-[200px] max-h-[480px]">
                {myError && (
                  <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs mb-2">
                    {myError}
                  </div>
                )}
                {!myTickets && !myError && (
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-6">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                )}
                {myTickets && visibleTickets.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-10">
                    {subTab === 'open'
                      ? 'No open tickets.'
                      : 'No resolved tickets yet.'}
                  </div>
                )}
                {myTickets && visibleTickets.length > 0 && (
                  <ul className="divide-y divide-gray-100">
                    {visibleTickets.map(t => {
                      const isExpanded = expandedId === t.id
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            className="w-full text-left px-2 py-1.5 hover:bg-gray-50 transition-colors flex items-start gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {t.number !== null && (
                                  <span className="text-[10px] font-bold text-gray-400 tabular-nums shrink-0">#{t.number}</span>
                                )}
                                <span className="text-xs font-semibold text-gray-800 truncate">{t.subject}</span>
                                <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium border shrink-0 ${STATUS_STYLES[t.status]}`}>
                                  {TICKET_STATUS_LABELS[t.status]}
                                </span>
                                <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                                  {formatRelativeTime(t.createdAt)}
                                </span>
                              </div>
                              {!isExpanded && (
                                <div className="text-[11px] text-gray-500 truncate mt-0.5">{t.description}</div>
                              )}
                            </div>
                            <span className="text-gray-300 shrink-0 mt-0.5">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="px-2 pb-2 pt-0.5 space-y-1.5">
                              <div className="text-xs text-gray-700 whitespace-pre-wrap leading-snug">
                                {t.description}
                              </div>
                              {t.resolvedAt && isResolvedState(t.status) && (
                                <div className="text-[10px] text-gray-400">
                                  {t.status === 'resolved' ? 'Resolved' : 'Closed'} {formatRelativeTime(t.resolvedAt)}
                                </div>
                              )}
                              {t.resolutionNote && (
                                <div className="p-2 rounded border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-900">
                                  <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">Resolution</div>
                                  <div className="whitespace-pre-wrap leading-snug">{t.resolutionNote}</div>
                                </div>
                              )}
                              {isResolvedState(t.status) && (
                                <button
                                  type="button"
                                  onClick={() => reopenTicket(t.id)}
                                  disabled={reopeningId === t.id}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 hover:text-amber-800 hover:underline disabled:opacity-50 disabled:no-underline"
                                >
                                  {reopeningId === t.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <RotateCcw className="w-3 h-3" />}
                                  Not actually fixed — reopen
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function SubTabPill({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
        active ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
      <span className={`inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded-full text-[9px] font-bold tabular-nums ${
        active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'
      }`}>
        {count}
      </span>
    </button>
  )
}
