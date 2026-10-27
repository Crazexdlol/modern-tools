"use client"

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { ChatPanel } from './chat-panel'

export function ChatHeaderButton() {
  const [open, setOpen] = useState(false)
  const [initialConvId, setInitialConvId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [migrationPending, setMigrationPending] = useState(false)

  const refresh = useCallback(async () => {
    const r = await chatApi.unreadCount()
    if (isApiError(r)) return
    if (isMigrationPending(r)) { setMigrationPending(true); setUnread(0); return }
    setMigrationPending(false)
    setUnread(r.unread)
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => { void refresh() }, 10_000)
    return () => window.clearInterval(t)
  }, [refresh])

  useEffect(() => {
    const url = new URL(window.location.href)
    const chatId = url.searchParams.get('chat')
    if (chatId) {
      setInitialConvId(chatId)
      setOpen(true)
      url.searchParams.delete('chat')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={migrationPending}
        title={migrationPending ? 'Chat requires migration' : 'Chat'}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
      >
        <MessageCircle className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <ChatPanel
          onClose={() => { setOpen(false); setInitialConvId(null); void refresh() }}
          initialConversationId={initialConvId}
        />
      )}
    </>
  )
}
