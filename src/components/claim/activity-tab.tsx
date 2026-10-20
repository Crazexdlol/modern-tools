"use client"

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MessageSquare, UserCheck, UserX, CheckCircle2, PlayCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/profiles'

// Chronological activity log for a single claim. Pulls two sources:
//   1. claim_stage_events — every stage/assignee transition (reassignments,
//      Submit for QC, Pass QC, Send Back, etc.)
//   2. messages — every message on the claim (manual + auto-request)
// Merges them into one timeline, sorted oldest → newest.

type StageEvent = {
  id: number
  stage: 'main' | 'qc' | 'billing_delivery' | 'payment'
  assigned_to: string | null
  entered_at: string
  exited_at: string | null
}

type MessageRow = {
  id: string
  sender_id: string | null
  sender_name: string | null
  body: string
  created_at: string
  is_auto_request: boolean | null
}

type TimelineItem =
  | { kind: 'stage_enter'; at: string; stage: StageEvent['stage']; assignedTo: string | null }
  | { kind: 'message'; at: string; sender: string; body: string; isAuto: boolean }

const STAGE_LABELS: Record<string, string> = {
  main: 'Appraiser',
  qc: 'QC',
  billing_delivery: 'Billing/Delivery',
  payment: 'Payment',
}

const STAGE_COLORS: Record<string, string> = {
  main: 'bg-slate-100 text-slate-700 border-slate-200',
  qc: 'bg-blue-50 text-blue-700 border-blue-200',
  billing_delivery: 'bg-amber-50 text-amber-700 border-amber-200',
  payment: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function ActivityTab({ claimId, allProfiles }: { claimId: string; allProfiles: Profile[] }) {
  const [events, setEvents] = useState<StageEvent[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [eventsRes, messagesRes] = await Promise.all([
          supabase
            .from('claim_stage_events')
            .select('id, stage, assigned_to, entered_at, exited_at')
            .eq('claim_id', claimId)
            .order('entered_at', { ascending: true }),
          supabase
            .from('messages')
            .select('id, sender_id, sender_name, body, created_at, is_auto_request')
            .eq('claim_id', claimId)
            .order('created_at', { ascending: true }),
        ])
        if (cancelled) return
        // Pre-migration: claim_stage_events may not exist yet. Treat as empty.
        if (eventsRes.error && eventsRes.error.code !== '42P01') {
          throw new Error(eventsRes.error.message)
        }
        if (messagesRes.error) throw new Error(messagesRes.error.message)
        setEvents((eventsRes.data ?? []) as StageEvent[])
        setMessages((messagesRes.data ?? []) as MessageRow[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [claimId])

  const nameFor = (id: string | null): string => {
    if (!id) return 'Unassigned'
    const p = allProfiles.find(x => x.id === id)
    return p?.name || p?.email || '(removed user)'
  }

  // Merge the two sources, oldest first.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (const e of events) {
      items.push({ kind: 'stage_enter', at: e.entered_at, stage: e.stage, assignedTo: e.assigned_to })
    }
    for (const m of messages) {
      items.push({
        kind: 'message',
        at: m.created_at,
        sender: m.sender_name || '(unknown)',
        body: m.body,
        isAuto: m.is_auto_request === true,
      })
    }
    // Newest first — the latest action sits at the top, oldest at the bottom.
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [events, messages])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">Loading activity…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg shadow-sm p-6 text-sm text-red-700">
        Failed to load activity: {error}
      </div>
    )
  }
  if (timeline.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-10 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <PlayCircle className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">No activity yet</h2>
        <p className="text-sm text-slate-500">
          Stage transitions and messages will appear here as they happen.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-white px-4 py-3 text-black text-lg font-bold tracking-tight border-b border-gray-200">
        Activity Timeline
      </div>
      <ol className="relative">
        {timeline.map((item, i) => {
          // Timeline is newest-first, so the chronologically PRIOR event
          // sits BELOW this one in the array (higher index).
          const chronologicallyPrior = i < timeline.length - 1 ? timeline[i + 1] : null
          // Detect reassignment: a stage_enter event with the same stage as
          // the prior event. (Stage transitions change the stage; stays
          // within the same stage mean the assignee changed.)
          const isReassign =
            item.kind === 'stage_enter' &&
            !!chronologicallyPrior && chronologicallyPrior.kind === 'stage_enter' &&
            chronologicallyPrior.stage === item.stage
          const isLast = i === timeline.length - 1
          return (
            <li key={i} className="relative pl-12 pr-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
              {/* Spine */}
              {!isLast && <span className="absolute left-[22px] top-10 bottom-0 w-px bg-slate-200" aria-hidden />}
              {/* Icon circle */}
              <span className={`absolute left-3 top-3 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white ring-1 ring-slate-200 ${
                item.kind === 'message'
                  ? item.isAuto ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  : isReassign ? 'bg-indigo-100 text-indigo-700'
                  : item.stage === 'payment' ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {item.kind === 'message'
                  ? <MessageSquare className="w-3 h-3" />
                  : isReassign
                    ? (item.assignedTo ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />)
                    : item.stage === 'payment' ? <CheckCircle2 className="w-3 h-3" />
                    : <ArrowRight className="w-3 h-3" />}
              </span>
              {/* Content */}
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-[13px] font-semibold text-slate-900">
                    {item.kind === 'message' ? (
                      <>
                        {item.isAuto ? 'Auto status request' : 'Message'} from <span className="text-slate-700">{item.sender}</span>
                      </>
                    ) : isReassign ? (
                      <>
                        Reassigned to <span className="text-slate-700">{nameFor(item.assignedTo)}</span>
                      </>
                    ) : (
                      <>
                        Moved to{' '}
                        <span className={`inline-flex items-center h-5 px-2 rounded border text-[11px] font-semibold ${STAGE_COLORS[item.stage]}`}>
                          {STAGE_LABELS[item.stage] ?? item.stage}
                        </span>
                        {item.assignedTo && (
                          <>
                            {' '}· assigned to <span className="text-slate-700">{nameFor(item.assignedTo)}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-[11.5px] text-slate-500 tabular-nums">{fmt(item.at)}</div>
                </div>
                {item.kind === 'message' && (
                  <div className="mt-1 text-[12.5px] text-slate-600 whitespace-pre-wrap line-clamp-3">
                    {item.body}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
