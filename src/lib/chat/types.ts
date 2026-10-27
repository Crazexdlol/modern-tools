export interface ChatConversation {
  id: string
  type: 'direct' | 'group'
  createdAt: string
  updatedAt: string
}

export interface ChatMember {
  conversationId: string
  userId: string
  joinedAt: string
  lastReadAt: string | null
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string | null
  body: string
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentSize: number | null
  attachmentMime: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

export interface ChatContact {
  id: string
  name: string
  email: string
  role: 'admin' | 'appraiser' | string
}

export interface ChatConversationListRow {
  conversation: ChatConversation
  counterpart: ChatContact | null
  lastMessage: ChatMessage | null
  unread: number
}

export interface ChatPermissionRow {
  userAId: string
  userBId: string
}

export function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }
}

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
