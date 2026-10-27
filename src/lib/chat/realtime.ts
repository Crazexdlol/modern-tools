"use client"

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChatMessage } from './types'

type MessageHandler = (m: ChatMessage, event: 'INSERT' | 'UPDATE') => void

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    senderId: (r.sender_id ?? null) as string | null,
    body: (r.body ?? '') as string,
    attachmentUrl: (r.attachment_url ?? null) as string | null,
    attachmentName: (r.attachment_name ?? null) as string | null,
    attachmentSize: (r.attachment_size ?? null) as number | null,
    attachmentMime: (r.attachment_mime ?? null) as string | null,
    editedAt: (r.edited_at ?? null) as string | null,
    deletedAt: (r.deleted_at ?? null) as string | null,
    createdAt: r.created_at as string,
  }
}

export function subscribeToConversation(conversationId: string, handler: MessageHandler): () => void {
  const supabase = createClient()
  const ch: RealtimeChannel = supabase
    .channel(`chat:conv:${conversationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => handler(rowToMessage(p.new as Record<string, unknown>), 'INSERT'))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (p) => handler(rowToMessage(p.new as Record<string, unknown>), 'UPDATE'))
    .subscribe()
  return () => { void supabase.removeChannel(ch) }
}

export interface TypingPayload { userId: string }

export function subscribeToTyping(conversationId: string, onTyping: (p: TypingPayload) => void) {
  const supabase = createClient()
  const ch = supabase.channel(`chat:typing:${conversationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (ev) => {
      const payload = ev.payload as TypingPayload | undefined
      if (payload?.userId) onTyping(payload)
    })
    .subscribe()
  const sendTyping = (userId: string) => {
    void ch.send({ type: 'broadcast', event: 'typing', payload: { userId } })
  }
  const cleanup = () => { void supabase.removeChannel(ch) }
  return { sendTyping, cleanup }
}
