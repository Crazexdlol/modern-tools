"use client"

import { Loader2 } from 'lucide-react'
import type { ChatConversationListRow } from '@/lib/chat/types'

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('') || '?'
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function preview(row: ChatConversationListRow): string {
  const m = row.lastMessage
  if (!m) return 'No messages yet'
  if (m.deletedAt) return '(deleted)'
  if (m.body) return m.body
  if (m.attachmentName) return `[Attachment: ${m.attachmentName}]`
  return '[Attachment]'
}

export function ChatConversationList({
  rows,
  onOpen,
}: {
  rows: ChatConversationListRow[] | null
  onOpen: (conversationId: string) => void
}) {
  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-slate-500 italic">
        No conversations yet. Click the + button to start one.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto h-full">
      {rows.map((r) => {
        const name = r.counterpart?.name || r.counterpart?.email || 'Unknown'
        const unread = r.unread
        return (
          <li key={r.conversation.id}>
            <button
              onClick={() => onOpen(r.conversation.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 text-left"
            >
              <span className="shrink-0 w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center text-xs font-bold">
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate font-semibold ${unread > 0 ? 'text-slate-900' : 'text-slate-800'}`}>
                    {name}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {fmtTime(r.lastMessage?.createdAt ?? r.conversation.updatedAt)}
                  </span>
                </span>
                <span className={`block mt-0.5 text-sm truncate ${unread > 0 ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                  {preview(r)}
                </span>
              </span>
              {unread > 0 && (
                <span className="shrink-0 mt-1 min-w-[20px] h-[20px] rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center px-1.5">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
