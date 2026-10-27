"use client"

import Image from 'next/image'
import { useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { ChatMessage } from '@/lib/chat/types'

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function AttachmentView({ url, name, mime }: { url: string; name: string | null; mime: string | null }) {
  const isImage = mime?.startsWith('image/')
  const href = `/api/chat/signed-attachment?path=${encodeURIComponent(url)}`
  return (
    <div className="mt-2">
      {isImage ? (
        <a href={href} target="_blank" rel="noreferrer">
          {/* Signed URL served via redirect; next/image can't optimize so use plain img */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={name ?? 'attachment'} className="max-h-56 rounded" />
        </a>
      ) : (
        <a
          href={href}
          target="_blank" rel="noreferrer"
          className="underline text-xs opacity-80 hover:opacity-100"
        >
          {name ?? 'Attachment'}
        </a>
      )}
    </div>
  )
}

// Silence unused Image warning if someone pulls this component later.
void Image

export function ChatMessageRow({
  message,
  mine,
  onEdit,
  onDelete,
}: {
  message: ChatMessage
  mine: boolean
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [menuOpen, setMenuOpen] = useState(false)

  const commit = async () => {
    const next = draft.trim()
    if (!next || next === message.body) { setEditing(false); return }
    await onEdit(message.id, next)
    setEditing(false)
  }

  const isDeleted = !!message.deletedAt
  const align = mine ? 'items-end' : 'items-start'
  const bubble = mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'

  return (
    <div className={`flex flex-col ${align} group px-4`}>
      <div className="relative max-w-[80%]">
        <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${bubble}`}>
          {isDeleted ? (
            <span className="italic opacity-70">(deleted)</span>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commit() }
                if (e.key === 'Escape') { setEditing(false); setDraft(message.body) }
              }}
              onBlur={() => void commit()}
              rows={1}
              className="w-full bg-transparent border-none focus:outline-none text-inherit resize-none"
              autoFocus
            />
          ) : (
            <>{message.body}</>
          )}
          {message.attachmentUrl && !isDeleted && (
            <AttachmentView url={message.attachmentUrl} name={message.attachmentName} mime={message.attachmentMime} />
          )}
        </div>
        {mine && !isDeleted && !editing && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="absolute -left-7 top-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700"
            aria-label="Message options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        )}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-md py-1 z-10">
            <button
              onClick={() => { setMenuOpen(false); setEditing(true) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => { setMenuOpen(false); void onDelete(message.id) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}
      </div>
      <div className="mt-0.5 px-2 text-[10px] text-slate-400">
        {fmtTime(message.createdAt)}{message.editedAt && !isDeleted && ' · edited'}
      </div>
    </div>
  )
}
