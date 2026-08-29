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
