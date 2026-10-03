import type { SupabaseClient } from '@supabase/supabase-js'

export const TICKET_SUBJECTS = [
  'ACV Report',
  'Diminished Value',
  'Estimate Review',
  'Dashboard',
  'Claim Info',
  'Documents',
  'Other',
] as const
export type TicketSubject = typeof TICKET_SUBJECTS[number]
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed'

export interface Ticket {
  id: string
  submittedBy: string
  subject: TicketSubject
  description: string
  status: TicketStatus
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface TicketWithSubmitter extends Ticket {
  submitterName: string
  submitterEmail: string
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTicket(row: any): Ticket {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    subject: row.subject as TicketSubject,
    description: row.description,
    status: row.status as TicketStatus,
    resolutionNote: row.resolution_note ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTicketWithSubmitter(row: any): TicketWithSubmitter {
  return {
    ...rowToTicket(row),
    submitterName: row.profiles?.name ?? row.submitted_by,
    submitterEmail: row.profiles?.email ?? '',
  }
}

// Client-side helper: calls the server route so auth is handled server-side.
export async function submitTicketViaApi(input: {
  subject: TicketSubject
  description: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status})` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Admin helper: update a ticket's status and/or resolution note.
export async function patchTicketViaApi(
  id: string,
  patch: { status?: TicketStatus; resolutionNote?: string | null },
  client?: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  if (client) {
    // Direct Supabase path (service client in API routes).
    const update: Record<string, unknown> = {}
    if (patch.status !== undefined) update.status = patch.status
    if (patch.resolutionNote !== undefined) update.resolution_note = patch.resolutionNote
    if (patch.status === 'resolved' || patch.status === 'dismissed') {
      update.resolved_at = new Date().toISOString()
    } else if (patch.status === 'open' || patch.status === 'in_progress') {
      update.resolved_at = null
    }
    const { error } = await client.from('tickets').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  // Browser path: call the PATCH API route.
  try {
    const res = await fetch(`/api/admin/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status})` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
