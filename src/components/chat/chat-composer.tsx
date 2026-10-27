"use client"

import { useRef, useState } from 'react'
import { Loader2, Paperclip, Send, X } from 'lucide-react'
import { chatApi, isApiError, isMigrationPending } from '@/lib/chat/api'
import { subscribeToTyping } from '@/lib/chat/realtime'
import { CHAT_ATTACHMENT_MAX_BYTES, type ChatMessage } from '@/lib/chat/types'

export function ChatComposer({
  conversationId,
  myUserId,
  onSent,
}: {
  conversationId: string
  myUserId: string | null
  onSent: (message: ChatMessage) => void
}) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingRef = useRef<ReturnType<typeof subscribeToTyping> | null>(null)
  const lastTypingSent = useRef(0)

  const ensureTyping = () => {
    if (!typingRef.current) typingRef.current = subscribeToTyping(conversationId, () => {})
    return typingRef.current
  }
  const emitTyping = () => {
    if (!myUserId) return
    const now = Date.now()
    if (now - lastTypingSent.current < 1500) return
    lastTypingSent.current = now
    ensureTyping().sendTyping(myUserId)
  }

  const chooseFile = (f: File | null) => {
    if (!f) return setFile(null)
    if (f.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setError('File too large (10 MB max)')
      return
    }
    setError(null)
    setFile(f)
  }

  const send = async () => {
    if (busy) return
    const text = body.trim()
    if (!text && !file) return
    setBusy(true); setError(null)
    const messageId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
    let attachment: { url: string; name: string; size: number; mime: string } | undefined
    if (file) {
      const signed = await chatApi.signUpload(conversationId, messageId, file.name, file.size)
      if (isApiError(signed)) { setBusy(false); setError(signed.error); return }
      if (isMigrationPending(signed)) { setBusy(false); setError('Migration pending'); return }
      const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) { setBusy(false); setError('Upload failed'); return }
      attachment = {
        url: signed.path,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      }
    }
    const r = await chatApi.send({ id: messageId, conversationId, body: text, attachment })
    setBusy(false)
    if (isApiError(r)) return setError(r.error)
    if (isMigrationPending(r)) return setError('Migration pending')
    onSent(r.message)
    setBody('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="border-t border-slate-100 p-3 bg-white">
      {error && <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5">{error}</div>}
      {file && (
        <div className="mb-2 flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs">
          <span className="truncate">{file.name} <span className="text-slate-400">({Math.round(file.size / 1024)} KB)</span></span>
          <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-800" aria-label="Clear attachment"><X className="w-3 h-3" /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-40"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={e => chooseFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); emitTyping() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[36px] max-h-32"
        />
        <button
          onClick={send}
          disabled={busy || (!body.trim() && !file)}
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          aria-label="Send"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
