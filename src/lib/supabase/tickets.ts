import type { SupabaseClient } from '@supabase/supabase-js'

// Suggested subject examples shown as placeholder guidance in the composer.
// Subjects are now free-text (migration-tickets-free-subject, 2026-10-15),
// so this list is purely cosmetic and not enforced anywhere.
export const SUGGESTED_TICKET_SUBJECTS = [
  'ACV Report',
  'Diminished Value',
  'Estimate Review',
  'Dashboard',
  'Claim Info',
  'Documents',
] as const
export const MAX_TICKET_SUBJECT_LEN = 120
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed'

export interface Ticket {
  id: string
  number: number | null  // null before migration-tickets-number lands
  submittedBy: string
  subject: string
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
    number: typeof row.number === 'number' ? row.number : null,
    submittedBy: row.submitted_by,
    subject: row.subject as string,
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
// `number` is the user-facing ticket id (`#1234`) when the server returns it
// (post migration-tickets-number); undefined on older deploys.
export async function submitTicketViaApi(input: {
  subject: string
  description: string
}): Promise<{ ok: boolean; error?: string; number?: number }> {
  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status})` }
    const number = typeof data.number === 'number' ? data.number : undefined
    return { ok: true, number }
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
