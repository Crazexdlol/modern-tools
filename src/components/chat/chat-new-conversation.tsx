"use client"

import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import type { ChatContact } from '@/lib/chat/types'

export function ChatNewConversation({ onCreated }: { onCreated: (conversationId: string) => void }) {
  const [contacts, setContacts] = useState<ChatContact[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    chatApi.listContacts().then((r) => {
      if (cancelled) return
      if (isApiError(r)) return setError(r.error)
      if (isMigrationPending(r)) return setContacts([])
      setContacts(r.contacts)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = (contacts ?? []).filter(c => {
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle)
  })

  const pick = async (id: string) => {
    setBusy(true); setError(null)
    const r = await chatApi.openOrCreate(id)
    setBusy(false)
    if (isApiError(r)) return setError(r.error)
    if (isMigrationPending(r)) return setError('Migration pending')
    onCreated(r.conversation.id)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search people…"
            className="pl-8 pr-3 py-2 w-full bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
      </div>
      {error && <div className="m-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      <div className="flex-1 overflow-y-auto">
        {contacts === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading contacts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic">
            {q.trim() ? 'No matches.' : 'No one yet. Ask an admin to grant you a chat permission.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  disabled={busy}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="font-semibold text-slate-900 text-sm">{c.name || c.email}</div>
                  <div className="text-xs text-slate-500">
                    {c.email}
                    {c.role === 'admin' && <span className="ml-2 text-blue-600 font-semibold">Admin</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
