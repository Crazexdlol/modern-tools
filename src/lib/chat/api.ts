import type { ChatContact, ChatConversation, ChatConversationListRow, ChatMessage } from './types'

type ApiResult<T> = T | { migrationPending: true } | { error: string }

async function j<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({ error: 'bad json' })) as ApiResult<T>
  if (!res.ok && !(body && typeof body === 'object' && 'migrationPending' in body)) {
    return { error: (body as { error?: string })?.error ?? `HTTP ${res.status}` }
  }
  return body
}

export const chatApi = {
  listContacts: () => j<{ contacts: ChatContact[] }>('/api/chat/contacts'),
  listConversations: () => j<{ conversations: ChatConversationListRow[] }>('/api/chat/conversations'),
  openOrCreate: (otherUserId: string) =>
    j<{ conversation: ChatConversation; created: boolean }>('/api/chat/conversations', {
      method: 'POST', body: JSON.stringify({ otherUserId }),
    }),
  listMessages: (conversationId: string, before?: string, limit = 50) => {
    const q = new URLSearchParams({ limit: String(limit) })
    if (before) q.set('before', before)
    return j<{ messages: ChatMessage[] }>(`/api/chat/conversations/${conversationId}/messages?${q.toString()}`)
  },
  send: (payload: { id?: string; conversationId: string; body?: string; attachment?: { url: string; name: string; size: number; mime: string } }) =>
    j<{ message: ChatMessage }>('/api/chat/send', { method: 'POST', body: JSON.stringify(payload) }),
  editMessage: (id: string, body: string) =>
    j<{ message: ChatMessage }>(`/api/chat/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteMessage: (id: string) => j<{ ok: true }>(`/api/chat/messages/${id}`, { method: 'DELETE' }),
  markRead: (conversationId: string) =>
    j<{ ok: true }>('/api/chat/mark-read', { method: 'POST', body: JSON.stringify({ conversationId }) }),
  unreadCount: () => j<{ unread: number }>('/api/chat/unread-count'),
  signUpload: (conversationId: string, messageId: string, filename: string, size: number) =>
    j<{ path: string; token: string; signedUrl: string }>('/api/chat/upload-url', {
      method: 'POST', body: JSON.stringify({ conversationId, messageId, filename, size }),
    }),
}

export function isMigrationPending<T>(r: ApiResult<T>): r is { migrationPending: true } {
  return typeof r === 'object' && r !== null && 'migrationPending' in r && (r as { migrationPending?: boolean }).migrationPending === true
}
export function isApiError<T>(r: ApiResult<T>): r is { error: string } {
  return typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error?: string }).error === 'string'
}
