"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { subscribeToConversation, subscribeToTyping } from '@/lib/chat/realtime'
import type { ChatContact, ChatMessage } from '@/lib/chat/types'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { ChatMessageRow } from './chat-message-row'
import { ChatComposer } from './chat-composer'

export function ChatThreadView({
  conversationId,
  counterpart,
}: {
  conversationId: string
  counterpart: ChatContact | null
}) {
  const { profile } = useCurrentProfile()
  const myId = profile?.id ?? null
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const typingClearTimerRef = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    chatApi.listMessages(conversationId).then((r) => {
      if (cancelled) return
      if (isApiError(r) || isMigrationPending(r)) return setMessages([])
      setMessages(r.messages)
    })
    void chatApi.markRead(conversationId)
    return () => { cancelled = true }
  }, [conversationId])

  useEffect(() => {
    const unsub = subscribeToConversation(conversationId, (m, event) => {
      setMessages((prev) => {
        const arr = prev ?? []
        if (event === 'INSERT') {
          if (arr.find(x => x.id === m.id)) return arr
          return [...arr, m]
        }
        return arr.map(x => (x.id === m.id ? m : x))
      })
      if (m.senderId !== myId) void chatApi.markRead(conversationId)
    })
    return () => { unsub() }
  }, [conversationId, myId])

  useEffect(() => {
    const { cleanup } = subscribeToTyping(conversationId, (p) => {
      if (p.userId === myId) return
      setTypingUser(p.userId)
      if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current)
      typingClearTimerRef.current = window.setTimeout(() => setTypingUser(null), 3000)
    })
    return () => {
      cleanup()
      if (typingClearTimerRef.current) window.clearTimeout(typingClearTimerRef.current)
    }
  }, [conversationId, myId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onEdit = useCallback(async (id: string, body: string) => {
    const r = await chatApi.editMessage(id, body)
    if (isApiError(r) || isMigrationPending(r)) return
    setMessages((prev) => (prev ?? []).map(m => (m.id === r.message.id ? r.message : m)))
  }, [])

  const onDelete = useCallback(async (id: string) => {
    const r = await chatApi.deleteMessage(id)
    if (isApiError(r) || isMigrationPending(r)) return
    setMessages((prev) => (prev ?? []).map(m => (m.id === id ? { ...m, deletedAt: new Date().toISOString() } : m)))
  }, [])

  const onLocalEcho = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      const arr = prev ?? []
      if (arr.find(x => x.id === m.id)) return arr
      return [...arr, m]
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
        <div className="text-sm font-bold text-slate-900">{counterpart?.name || counterpart?.email || 'Conversation'}</div>
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        {messages === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400 italic">No messages yet. Say hi.</div>
        ) : (
          messages.map(m => (
            <ChatMessageRow key={m.id} message={m} mine={m.senderId === myId} onEdit={onEdit} onDelete={onDelete} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {typingUser && (
        <div className="px-4 py-1 text-[11px] text-slate-500 italic">
          {counterpart?.name || 'Someone'} is typing…
        </div>
      )}
      <ChatComposer
        conversationId={conversationId}
        myUserId={myId}
        onSent={onLocalEcho}
      />
    </div>
  )
}
