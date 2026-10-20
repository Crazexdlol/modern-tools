"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DOMPurify from "isomorphic-dompurify"
import { Loader2, Lock, Send, X, RefreshCw, Highlighter, MoreVertical, Pencil, Trash2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { confirmDialog, alertDialog } from "@/components/ui/dialog-service"
import {
  fetchMessages,
  sendMessage,
  deleteMessage,
  editMessage,
  markMessagesRead,
  type Message,
} from "@/lib/supabase/messages"
import { fetchAllProfilesBrowser, useCurrentProfile, isPickerVisible, type Profile } from "@/lib/supabase/profiles"

// Messages are rendered as plain text with highlight (<mark>) + simple
// inline formatting preserved. Hyperlinks are intentionally stripped —
// Henry 2026-10-15: messages should only ever be text (prior auto-linking
// produced dead links when the message body contained a path that didn't
// map to a route).
function MessageBody({ body }: { body: string }) {
  // Even if the body is plain text, run it through DOMPurify so any raw
  // HTML a user pasted ends up as text. ALLOWED_TAGS deliberately omits
  // <a>, so pasted anchors are flattened to their text content.
  const safe = DOMPurify.sanitize(body, {
    ALLOWED_TAGS: ["mark", "br", "b", "i", "u", "strong", "em", "span", "p", "div"],
    ALLOWED_ATTR: ["class"],
  })
  return <span className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: safe }} />
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

export function MessagesTab({ claimId, isClaimClosed = false }: { claimId: string; isClaimClosed?: boolean }) {
  const { profile } = useCurrentProfile()
  const myId = profile?.id ?? null
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  // body stores sanitized HTML (contenteditable innerHTML, possibly containing
  // <mark> tags from the Highlight button). The derived plain-text content is
  // used only for the send-enabled check.
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // Admin-only composer flag. Only admins can toggle it on; the DB enforces
  // this via RLS so a tampered client would still get a 403/42501.
  const [isAdminOnly, setIsAdminOnly] = useState(false)
  const isAdmin = profile?.role === 'admin'

  // Per-message 3-dot menu state + inline-edit state.
  const [menuOpenForId, setMenuOpenForId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<string>("")
  const [editBusy, setEditBusy] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpenForId) return
    const onDoc = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpenForId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpenForId])

  const canModify = (m: Message): boolean => {
    if (m.isAutoRequest) return false  // never edit the templated status-request bot messages
    if (isAdmin) return true
    return !!myId && m.senderId === myId
  }

  const startEdit = (m: Message) => {
    setMenuOpenForId(null)
    setEditingMessageId(m.id)
    // Edit the raw body (HTML or plain text) directly. Users can type over
    // the <mark> spans or clean them up as they go.
    setEditingDraft(m.body)
  }
  const cancelEdit = () => {
    setEditingMessageId(null)
    setEditingDraft("")
  }
  const saveEdit = async (m: Message) => {
    const trimmed = editingDraft.trim()
    if (!trimmed || trimmed === m.body.trim()) {
      cancelEdit()
      return
    }
    setEditBusy(true)
    try {
      await editMessage(claimId, m.id, trimmed)
      setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, body: trimmed } : x)))
      cancelEdit()
    } catch (err) {
      await alertDialog({
        title: 'Edit failed',
        message: err instanceof Error ? err.message : 'Could not save the edit.',
        variant: 'danger',
      })
    } finally {
      setEditBusy(false)
    }
  }
  const doDelete = async (m: Message) => {
    setMenuOpenForId(null)
    const ok = await confirmDialog({
      title: 'Delete this message?',
      message: 'The message will be removed for everyone. Recipients will NOT be notified of the deletion.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMessage(claimId, m.id)
      setMessages(prev => prev.filter(x => x.id !== m.id))
    } catch (err) {
      await alertDialog({
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete the message.',
        variant: 'danger',
      })
    }
  }

  const threadRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchMessages(claimId)
      setMessages(list)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load messages")
    } finally {
      setLoading(false)
    }
  }, [claimId])

  // Initial load + fetch profiles + mark-as-read on mount.
  useEffect(() => {
    load()
    fetchAllProfilesBrowser().then(setProfiles)
    markMessagesRead(claimId).catch(() => { /* silent — read state isn't user-visible */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId])

  // Default recipient picker to a proper reply-all: everyone involved in
  // the previous message (sender + their recipients) MINUS the current user
  // AND MINUS any profile that isn't picker-visible (hidden super-admin
  // test accounts — Henry 2026-10-15). Waits for both messages AND profiles
  // to load so the picker-visibility filter can actually run; without the
  // filter the auto-select could surface the hidden super-admin account
  // (which has the same display name) and the server rejected the send
  // with "Appraisers can only message admins". Won't overwrite a manual
  // selection — only fires while recipientIds is still empty.
  useEffect(() => {
    if (recipientIds.length !== 0) return
    if (messages.length === 0 || profiles.length === 0) return
    const last = messages[messages.length - 1]
    const conversation = new Set<string>(last.recipientIds)
    if (last.senderId) conversation.add(last.senderId)
    if (myId) conversation.delete(myId)
    const hiddenIds = new Set(profiles.filter((p) => !isPickerVisible(p)).map((p) => p.id))
    const next = Array.from(conversation).filter((id) => !hiddenIds.has(id))
    if (next.length > 0) setRecipientIds(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recipientIds.length is read as a one-shot gate
  }, [messages, profiles, myId])

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Composer is intentionally fixed-height: the CSS (min-h-[160px] +
  // max-h-[60vh] + overflow-y-auto) handles sizing on its own. The old
  // auto-grow effect that mirrored scrollHeight into style.height
  // overrode the max-h cap and pushed the thread above it out of view
  // — Henry 2026-10-15. Users scroll inside the composer for long drafts
  // and can still drag the resize handle to enlarge it manually.

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
      .filter(isPickerVisible)                           // hide Henry's private super-admin account
      .filter(p => p.isActive)                           // hide inactive users from picker
      .filter(p => p.id !== myId)                       // can't pick yourself
      // Already-selected recipients stay in the list with a checkmark so a
      // multi-select flow doesn't have to hunt through chips to toggle one
      // off — click the same row again to deselect. Henry 2026-10-10.
      // Appraisers can ONLY message admins — enforced here in the picker and
      // again on the server (/api/claims/[id]/messages POST). This supersedes
      // the admin-only toggle: an appraiser never sees other appraisers at
      // all, so the toggle is admin-exclusive by definition.
      // Admins keep the broader list, but when admin-only is on they still
      // filter to admins so an unread doesn't ping someone who can't read it.
      .filter(p => isAdmin ? (!isAdminOnly || p.role === 'admin') : p.role === 'admin')
      .filter(p => !q || (p.name || "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 20)
  }, [profiles, pickerQuery, myId, isAdminOnly, isAdmin])

  // Auto-strip appraiser recipients whenever admin-only is turned ON so the
  // chip list doesn't lie about who'll be pinged.
  useEffect(() => {
    if (!isAdminOnly) return
    setRecipientIds(prev => prev.filter(rid => {
      const p = profiles.find(x => x.id === rid)
      return !p || p.role === 'admin'
    }))
  }, [isAdminOnly, profiles])

  const selectedProfiles = useMemo(
    () => recipientIds.map(id => profiles.find(p => p.id === id)).filter((p): p is Profile => !!p),
    [recipientIds, profiles],
  )

  // Toggles instead of add — the picker stays open after each click so a user
  // can select multiple recipients in one go (Henry 2026-10-10). Clicking an
  // already-selected row removes it. The outside-click handler + explicit
  // "Done" button close the picker.
  const toggleRecipient = (id: string) => {
    setRecipientIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }
  const addAllFilteredRecipients = () => {
    setRecipientIds(prev => {
      const next = new Set(prev)
      for (const p of pickerOptions) next.add(p.id)
      return Array.from(next)
    })
  }
  const removeRecipient = (id: string) => setRecipientIds(prev => prev.filter(x => x !== id))

  // Recipients are optional. A message with no recipients is a note-to-thread —
  // it still posts on the claim but doesn't notify anyone. Closed claims mute
  // the composer entirely (server enforces too via 403).
  const bodyText = (bodyRef.current?.textContent ?? "").trim()
  const canSend = !isClaimClosed && bodyText.length > 0 && !sending

  const doSend = async () => {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    try {
      // Normalize + sanitize. Messages are intentionally plain-style — the
      // only allowed formatting is line breaks (from Enter) and highlights
      // (from the Highlight toolbar). Everything else gets stripped: pasted
      // Outlook / Gmail / web content comes in via onPaste as text/plain
      // already, but we scrub again on send to catch any residue from
      // execCommand or past-session rich content still in the editor.
      const rawHtml = bodyRef.current?.innerHTML ?? ""
      // Pre-process: convert block tags (<p>, <div>, <li>) and MSO-style
      // paragraphs into line breaks so paragraph structure survives the
      // tag strip. Convert execCommand highlight spans (`<span
      // style="background-color: ...">`) into semantic <mark> so the
      // allowlist below doesn't wipe them.
      const normalized = rawHtml
        .replace(/<span\s+style="[^"]*background-color:\s*([^;"]+)[^"]*"[^>]*>/gi,
          (_m, color) => `<mark style="background-color:${String(color).trim()}">`)
        .replace(/<\/span>/gi, '</mark>')
        .replace(/<\/(p|div|li)\s*>/gi, '<br>')
        .replace(/<(p|div|li)[^>]*>/gi, '')
      const safeHtml = DOMPurify.sanitize(normalized, {
        // Plain-style only: no bold / italic / font changes. Line breaks
        // and highlight marks are the only decorations preserved.
        ALLOWED_TAGS: ["mark", "br"],
        ALLOWED_ATTR: ["style"],
        FORBID_ATTR: ["class"],
      })
        .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')  // collapse runs of 3+ breaks
        .trim()
      const toSend = safeHtml || bodyText
      const created = await sendMessage(claimId, {
        recipientIds,
        body: toSend,
        isAdminOnly: isAdmin && isAdminOnly ? true : undefined,
      })
      setMessages(prev => [...prev, created])
      setBody("")
      if (bodyRef.current) bodyRef.current.innerHTML = ""
      // Keep recipientIds populated — user is likely to send a follow-up.
      // Keep isAdminOnly toggle sticky so a thread of admin notes doesn't
      // need to be re-toggled per message.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  // Apply browser-native highlight to the current selection inside the editor.
  // Passing null removes the highlight on the selected range.
  const applyHighlight = (color: string | null) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !bodyRef.current) return
    if (!bodyRef.current.contains(sel.anchorNode)) return
    if (color) {
      document.execCommand("hiliteColor", false, color)
    } else {
      document.execCommand("hiliteColor", false, "transparent")
      document.execCommand("removeFormat", false)
    }
    // Keep local state in sync so canSend recomputes.
    setBody(bodyRef.current.innerHTML)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Cmd/Ctrl + Enter sends
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      doSend()
    }
  }

  // Intercept paste and insert the clipboard's plain-text payload at the
  // cursor. Prevents Outlook / Gmail / web-mail rich HTML (MsoNormal
  // classes, inline color/font/size styles, nested spans) from leaking
  // into the editor and then the stored message + outbound emails. Users
  // can still format intentionally via the Highlight toolbar.
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    // execCommand('insertText') preserves the user's cursor position and
    // the undo history, and treats \n as a line break the browser renders
    // natively. Deprecated by spec but universally supported and still
    // the simplest reliable path for contentEditable plain-text paste.
    document.execCommand('insertText', false, text)
    setBody(bodyRef.current?.innerHTML ?? '')
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm flex flex-col h-[calc(100vh-260px)] min-h-[600px] py-0 gap-0">
      <CardHeader className="py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-black text-lg font-bold tracking-tight">
            Messages
            <span className="ml-2 text-sm font-normal text-gray-500">
              {loading ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </span>
          </CardTitle>
          <button
            onClick={load}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 p-1 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 p-0">
        {/* Thread. Area tinted gray so each white message card has a subtle
            background to sit on. Henry 2026-10-15: regular messages blended
            into the white Card background and were hard to visually separate. */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
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
              "border rounded-lg px-3 py-2 relative",
              m.isAutoRequest
                ? "border-amber-200 bg-amber-50"
                : m.isAdminOnly
                  ? "border-slate-300 bg-slate-50"
                  : "border-gray-200 bg-white",
            )}
          >
            <div className="text-xs text-gray-500 mb-1 flex items-center flex-wrap gap-1 pr-7">
              <span className="font-semibold text-gray-800">{m.senderName}</span>
              {m.isAutoRequest && (
                <span className="ml-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                  Auto
                </span>
              )}
              {m.isAdminOnly && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  Admin only
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
            {editingMessageId === m.id ? (
              <div className="space-y-2">
                <textarea
                  value={editingDraft}
                  onChange={(e) => setEditingDraft(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[80px]"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={editBusy} onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={editBusy || !editingDraft.trim()}
                    onClick={() => saveEdit(m)}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {editBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500 italic">
                  Recipients will be re-emailed with the edited text.
                </p>
              </div>
            ) : (
              <div className="text-xs text-gray-800">
                <MessageBody body={m.body} />
              </div>
            )}
            {/* 3-dots menu — sender or admin only, and hidden for auto-request
                system messages. */}
            {editingMessageId !== m.id && canModify(m) && (
              <div
                ref={menuOpenForId === m.id ? menuContainerRef : null}
                className="absolute top-1.5 right-1.5"
              >
                <button
                  type="button"
                  onClick={() => setMenuOpenForId(menuOpenForId === m.id ? null : m.id)}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  aria-label="Message actions"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {menuOpenForId === m.id && (
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-800 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(m)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-800 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
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
          <div className="relative flex-1 min-w-[180px]" ref={pickerRef}>
            <input
              value={pickerQuery}
              onFocus={() => setPickerOpen(true)}
              onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true) }}
              placeholder={recipientIds.length === 0 ? "Add recipient (optional)…" : "Add another…"}
              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {pickerOpen && (pickerOptions.length > 0 || pickerQuery) && (
              <div className="absolute left-0 bottom-full mb-1 w-80 max-h-[420px] overflow-hidden flex flex-col bg-white border border-gray-200 rounded-lg shadow-lg z-30">
                {/* Multi-select header: shows selected count + bulk Add All /
                    Done controls. Clicking a row toggles without closing the
                    picker so a user can tick several people in one pass. */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 text-[11px]">
                  <span className="text-gray-500">
                    {recipientIds.length === 0 ? 'Select one or more' : `${recipientIds.length} selected`}
                  </span>
                  <div className="flex items-center gap-2">
                    {pickerOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={addAllFilteredRecipients}
                        className="text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        Add all shown
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPickerOpen(false); setPickerQuery("") }}
                      className="text-gray-500 hover:text-gray-800 font-semibold"
                    >
                      Done
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {pickerOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400 italic">No users found</div>
                  ) : (
                    pickerOptions.map(p => {
                      const selected = recipientIds.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleRecipient(p.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-b-0 flex items-center gap-2",
                            selected ? "bg-blue-50 text-blue-900 hover:bg-blue-100" : "text-gray-700 hover:bg-gray-100",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-4 h-4 rounded border shrink-0",
                              selected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300",
                            )}
                            aria-hidden
                          >
                            {selected && <Check className="w-3 h-3" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{p.name || p.email}</div>
                            {p.name && <div className="text-xs text-gray-500 truncate">{p.email}</div>}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Closed-claim banner — composer is still rendered for visual
            consistency but all inputs are disabled and the send button is
            inert. Server also rejects the POST so a tampered client can't
            slip a message onto a closed file. */}
        {isClaimClosed && (
          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            This claim is closed. Messaging is disabled. Reopen the claim to continue the conversation.
          </div>
        )}

        {/* Highlight toolbar — click Highlight to wrap the selected text in
            a yellow mark, Clear to strip highlight from the selected text. */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isClaimClosed}
            onMouseDown={(e) => { e.preventDefault(); applyHighlight("#fef08a") }}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-yellow-50 hover:border-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Highlight selected text"
          >
            <Highlighter className="w-3.5 h-3.5 text-yellow-600" />
            Highlight
          </button>
          <button
            type="button"
            disabled={isClaimClosed}
            onMouseDown={(e) => { e.preventDefault(); applyHighlight(null) }}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove highlight from selection"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
          <span className="text-[11px] text-gray-400 ml-1">
            Select text, then click Highlight
          </span>
        </div>

        {/* Body + send */}
        <div className="flex items-end gap-2">
          <div
            ref={bodyRef}
            contentEditable={!isClaimClosed}
            suppressContentEditableWarning
            onInput={() => setBody(bodyRef.current?.innerHTML ?? "")}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            data-placeholder={isAdminOnly ? "Write an admin-only note… (Ctrl+Enter to send)" : "Write a message… (Ctrl+Enter to send)"}
            className={cn(
              "hp-msg-editor flex-1 border rounded px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y h-[200px] max-h-[40vh] overflow-y-auto whitespace-pre-wrap",
              isAdminOnly ? "bg-slate-50 border-slate-300" : "bg-white border-gray-200",
              isClaimClosed && "opacity-60 cursor-not-allowed",
            )}
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

        {isAdmin && (
          <label className="flex items-center gap-2 cursor-pointer group text-xs text-gray-600">
            <input
              type="checkbox"
              checked={isAdminOnly}
              onChange={(e) => setIsAdminOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Lock className="w-3 h-3 text-gray-400 group-hover:text-gray-600" />
            <span>Admin only — appraisers won&apos;t see this message.</span>
          </label>
        )}

        {sendError && (
          <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">{sendError}</div>
        )}
        {recipientIds.length > 20 && (
          <div className="text-xs text-amber-600">Sending to {recipientIds.length} people — double-check the list.</div>
        )}
        </div>
      </CardContent>
    </Card>
  )
}
