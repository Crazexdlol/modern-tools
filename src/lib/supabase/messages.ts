export interface Message {
  id: string
  claimId: string
  senderId: string | null
  senderName: string
  recipientIds: string[]
  recipientNames: string[]
  body: string
  createdAt: string  // ISO
  isAutoRequest: boolean
  // When true, non-admins can't see the row (RLS filters it out). Only
  // admins can set this flag at send time. Defaults to false for every
  // existing message pre-migration.
  isAdminOnly: boolean
}

export interface UnreadClaim {
  claimId: string
  maNumber: string
  insuredName: string
  vehicle: string
  unreadCount: number
  lastMessageAt: string    // ISO
  lastMessageFrom: string
}

export interface SendMessagePayload {
  recipientIds: string[]
  body: string
  // Admins only. Sent as `false` for non-admins. Server also enforces
  // (returns 403 if a non-admin tries true + RLS blocks the insert).
  isAdminOnly?: boolean
}

// Fetch all messages on a claim, oldest-first.
export async function fetchMessages(claimId: string): Promise<Message[]> {
  const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/messages`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load messages')
  const data = await res.json()
  return data.messages as Message[]
}

// Send a new message on a claim. Returns the persisted message row.
export async function sendMessage(claimId: string, payload: SendMessagePayload): Promise<Message> {
  const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to send message')
  const data = await res.json()
  return data.message as Message
}

// Delete a single message. Hard delete — no notification fires.
export async function deleteMessage(claimId: string, messageId: string): Promise<void> {
  const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to delete message')
}

// Edit a single message. Re-emails all original recipients (minus the sender).
export async function editMessage(claimId: string, messageId: string, body: string): Promise<void> {
  const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to edit message')
}

// Convenience for `fetchMessages` row shape awareness in older callers that
// expected the pre-admin-only Message type. Not used internally.
export type MessageLegacy = Omit<Message, 'isAdminOnly'>

// Mark this claim's thread as read for the caller (upserts message_reads).
export async function markMessagesRead(claimId: string): Promise<void> {
  await fetch(`/api/claims/${encodeURIComponent(claimId)}/messages/read`, { method: 'POST' })
}

// Fetch the caller's unread queue — list of claims with unread messages.
export async function fetchUnreadQueue(): Promise<UnreadClaim[]> {
  const res = await fetch('/api/messages/queue')
  if (!res.ok) return []
  const data = await res.json()
  return (data.claims ?? []) as UnreadClaim[]
}

// Just the total unread count (sum of unreadCount across claims), for the
// Dashboard header badge. Times out at 8s so a slow/cold /api/messages/queue
// can't hang the caller. On timeout or error, returns 0 — the dashboard
// still renders; the badge is just missing until the next successful fetch.
export async function fetchUnreadCount(): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch('/api/messages/queue', { signal: controller.signal })
    if (!res.ok) return 0
    const data = await res.json()
    const claims = (data.claims ?? []) as UnreadClaim[]
    return claims.reduce((sum, c) => sum + c.unreadCount, 0)
  } catch (err) {
    console.warn('[fetchUnreadCount] failed or timed out:', err)
    return 0
  } finally {
    clearTimeout(timer)
  }
}
