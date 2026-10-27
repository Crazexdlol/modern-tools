"use client"

import { useEffect, useState } from 'react'
import { X, ArrowLeft, Plus } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import type { ChatConversationListRow } from '@/lib/chat/types'
import { ChatConversationList } from './chat-conversation-list'
import { ChatThreadView } from './chat-thread-view'
import { ChatNewConversation } from './chat-new-conversation'

type View = 'list' | 'thread' | 'new'

export function ChatPanel({
  onClose,
  initialConversationId,
}: {
  onClose: () => void
  initialConversationId?: string | null
}) {
  const [view, setView] = useState<View>(initialConversationId ? 'thread' : 'list')
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId ?? null)
  const [rows, setRows] = useState<ChatConversationListRow[] | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)

  const reloadList = async () => {
    const r = await chatApi.listConversations()
    if (isApiError(r)) return
    if (isMigrationPending(r)) { setMigrationPending(true); setRows([]); return }
    setMigrationPending(false)
    setRows(r.conversations)
  }

  useEffect(() => { void reloadList() }, [])

  const openConversation = (id: string) => {
    setActiveConvId(id)
    setView('thread')
  }

  const openNew = () => setView('new')
  const backToList = () => { setView('list'); setActiveConvId(null); void reloadList() }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="absolute top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={backToList} className="text-slate-500 hover:text-slate-800" aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-bold text-slate-900">
              {view === 'list' && 'Chat'}
              {view === 'thread' && 'Conversation'}
              {view === 'new' && 'New message'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {view === 'list' && (
              <button
                onClick={openNew}
                disabled={migrationPending}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-40"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
          {migrationPending && (
            <div className="p-6 text-center text-sm text-slate-500">
              Chat is set up but the database migration hasn&apos;t run yet.
              <br />Admin: run <code>supabase/migration-chat.sql</code> in Supabase.
            </div>
          )}
          {!migrationPending && view === 'list' && (
            <ChatConversationList rows={rows} onOpen={openConversation} />
          )}
          {!migrationPending && view === 'thread' && activeConvId && (
            <ChatThreadView
              conversationId={activeConvId}
              counterpart={rows?.find(r => r.conversation.id === activeConvId)?.counterpart ?? null}
            />
          )}
          {!migrationPending && view === 'new' && (
            <ChatNewConversation
              onCreated={(convId) => openConversation(convId)}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
