"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Send, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  fetchMessages,
  sendMessage,
  markMessagesRead,
  type Message,
} from "@/lib/supabase/messages"
import { fetchAllProfilesBrowser, useCurrentProfile, type Profile } from "@/lib/supabase/profiles"

// Regex for detecting http(s) URLs and app-relative paths in message bodies.
// Kept intentionally simple — real message bodies with pathological punctuation
// aren't a real concern for internal team messaging.
const URL_RE = /(https?:\/\/[^\s]+|\/[a-zA-Z0-9_\-\/\?=&%\.]+)/g

function LinkifiedBody({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(text.slice(last, idx))
    const url = m[0]
    const href = url.startsWith("/") ? url : url
    parts.push(
      <a
        key={idx}
        href={href}
        target={url.startsWith("/") ? "_self" : "_blank"}
        rel="noreferrer"
        className="text-blue-600 hover:underline break-all"
      >
        {url}
      </a>,
    )
    last = idx + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <span className="whitespace-pre-wrap">{parts}</span>
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

export function MessagesTab({ claimId }: { claimId: string }) {
  const { profile } = useCurrentProfile()
  const myId = profile?.id ?? null
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const threadRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchMessages(claimId)
      setMessages(list)
      // Default recipient picker to a proper reply-all: everyone involved in
      // the previous message (sender + their recipients) MINUS the current
      // user. Prevents self-notifying and gives the natural "reply" behavior.
      if (list.length > 0 && recipientIds.length === 0) {
        const last = list[list.length - 1]
        const conversation = new Set<string>(last.recipientIds)
        if (last.senderId) conversation.add(last.senderId)
        if (myId) conversation.delete(myId)
        setRecipientIds(Array.from(conversation))
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load messages")
    } finally {
      setLoading(false)
    }
  }, [claimId, recipientIds.length, myId])

  // Initial load + fetch profiles + mark-as-read on mount.
  useEffect(() => {
    load()
    fetchAllProfilesBrowser().then(setProfiles)
    markMessagesRead(claimId).catch(() => { /* silent — read state isn't user-visible */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId])

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Auto-size the composer textarea so the whole draft is visible without
  // needing to scroll inside a tiny box. Caps at ~50vh to keep the composer
  // from taking over the whole panel — beyond that it scrolls internally.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- direct DOM style mutation, no setState involved
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  // Close picker on click-outside.
  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [pickerOpen])

  const pickerOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return profiles
      .filter(p => p.isActive)                           // hide inactive users from picker
      .filter(p => p.id !== myId)                       // can't pick yourself
      .filter(p => !recipientIds.includes(p.id))
      .filter(p => !q || (p.name || "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 12)
  }, [profiles, recipientIds, pickerQuery, myId])

  const selectedProfiles = useMemo(
    () => recipientIds.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p),
    [recipientIds, profiles],
  )

  const addRecipient = (id: string) => {
    setRecipientIds(prev => (prev.includes(id) ? prev : [...prev, id]))
    setPickerQuery("")
    setPickerOpen(false)
  }
  const removeRecipient = (id: string) => setRecipientIds(prev => prev.filter(x => x !== id))

  const canSend = body.trim().length > 0 && recipientIds.length > 0 && !sending

  const doSend = async () => {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    try {
      const created = await sendMessage(claimId, { recipientIds, body: body.trim() })
      setMessages(prev => [...prev, created])
      setBody("")
      // Keep recipientIds populated — user is likely to send a follow-up.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter sends
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      doSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-320px)] min-h-[500px] bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Thread header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="text-sm text-gray-600">
          {loading ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-gray-400 hover:text-gray-700 p-1 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loadError && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{loadError}</div>
        )}
        {!loading && messages.length === 0 && !loadError && (
          <div className="text-sm text-gray-400 italic text-center py-8">
            No messages on this claim yet — start the thread below.
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            className={cn(
              "border rounded-lg px-3 py-2",
              m.isAutoRequest
                ? "border-amber-200 bg-amber-50"
                : "border-gray-200 bg-white",
            )}
          >
            <div className="text-xs text-gray-500 mb-1 flex items-center flex-wrap gap-1">
              <span className="font-semibold text-gray-800">{m.senderName}</span>
              {m.isAutoRequest && (
                <span className="ml-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                  Auto
                </span>
              )}
              {m.recipientNames.length > 0 && (
                <>
                  <span>→</span>
                  <span>{m.recipientNames.join(", ")}</span>
                </>
              )}
              <span>·</span>
              <span>{fmtStamp(m.createdAt)}</span>
            </div>
            <div className="text-sm text-gray-800">
              <LinkifiedBody text={m.body} />
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-3 space-y-2 bg-gray-50">
        {/* Recipient chips + picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold">To:</span>
          {selectedProfiles.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded"
            >
              {p.name || p.email}
              <button
                type="button"
                onClick={() => removeRecipient(p.id)}
                className="text-blue-500 hover:text-blue-800"
                aria-label={`Remove ${p.name || p.email}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="relative flex-1 min-w-[120px]" ref={pickerRef}>
            <input
              value={pickerQuery}
              onFocus={() => setPickerOpen(true)}
              onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true) }}
              placeholder={recipientIds.length === 0 ? "Add recipient…" : "Add another…"}
              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {pickerOpen && pickerOptions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-full max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-30">
                {pickerOptions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addRecipient(p.id)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <div className="font-semibold">{p.name || p.email}</div>
                    {p.name && <div className="text-xs text-gray-500">{p.email}</div>}
                  </button>
                ))}
              </div>
            )}
            {pickerOpen && pickerOptions.length === 0 && pickerQuery && (
              <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-30 px-3 py-2 text-sm text-gray-400 italic">
                No users found
              </div>
            )}
          </div>
        </div>

        {/* Body + send */}
        <div className="flex items-end gap-2">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Write a message… (Ctrl+Enter to send)"
            rows={3}
            className="flex-1 bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[80px] max-h-[50vh] overflow-y-auto"
          />
          <Button
            onClick={doSend}
            disabled={!canSend}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>

        {sendError && (
          <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">{sendError}</div>
        )}
        {recipientIds.length > 20 && (
          <div className="text-xs text-amber-600">Sending to {recipientIds.length} people — double-check the list.</div>
        )}
      </div>
    </div>
  )
}
