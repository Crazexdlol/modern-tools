"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, Send, Sparkles, X, MessageCircle, Ticket } from 'lucide-react'
import { TICKET_SUBJECTS, type TicketSubject, submitTicketViaApi } from '@/lib/supabase/tickets'

/**
 * Floating circular "Ask Henry" button at the bottom-right of every page.
 * Click opens a popover with the Henry chatbot inline. Session persists for
 * 20 minutes across page navigations via sessionStorage.
 *
 * Hidden on /login (not signed in) and on /help (which already has the chat).
 */

interface AskResponse {
  answer: string
  agent: string
  error?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content: `Hi — I'm Henry. Ask me anything about how to do something in HamsPortal and I'll walk you through it.`,
}

const SESSION_KEY = 'hamsportal.henry.session.v1'
const SESSION_TTL_MS = 20 * 60 * 1000

interface SavedSession {
  chat: ChatMessage[]
  lastActivity: number
}

function loadSession(): ChatMessage[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const saved: SavedSession = JSON.parse(raw)
    if (Date.now() - saved.lastActivity > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return saved.chat
  } catch {
    return null
  }
}

function saveSession(chat: ChatMessage[]): void {
  try {
    const payload: SavedSession = { chat, lastActivity: Date.now() }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    // noop
  }
}

type LauncherTab = 'ask' | 'ticket'

export function HenryFloatingLauncher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<LauncherTab>('ask')
  const [chat, setChat] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useState<TicketSubject>(TICKET_SUBJECTS[0])
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [ticketSuccess, setTicketSuccess] = useState(false)

  // Hidden on login (not signed in) and on /help (that page hosts the full chat).
  const hidden = pathname === '/login' || pathname?.startsWith('/help')

  // Hydrate session on mount — survives across navigations because it's in
  // sessionStorage. 20-min TTL enforced inside loadSession.
  useEffect(() => {
    const restored = loadSession()
    if (restored && restored.length > 0) setChat(restored)
  }, [])

  useEffect(() => {
    if (chat.length > 1) saveSession(chat)
  }, [chat])

  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, sending, open])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  // Focus the input when the popover opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    const nextChat: ChatMessage[] = [...chat, { role: 'user', content: text }]
    setChat(nextChat)
    setInput('')
    setChatError(null)
    setSending(true)
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextChat }),
      })
      const data: AskResponse = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setChat([...nextChat, { role: 'assistant', content: data.answer || '(no answer)' }])
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [chat, input, sending])

  const resetChat = () => {
    setChat([GREETING])
    setChatError(null)
    setInput('')
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
  }

  const submitTicket = async () => {
    const desc = ticketDescription.trim()
    if (!desc) { setTicketError('Please enter a description.'); return }
    setTicketSubmitting(true)
    setTicketError(null)
    const result = await submitTicketViaApi({ subject: ticketSubject, description: desc })
    setTicketSubmitting(false)
    if (!result.ok) {
      setTicketError(result.error ?? 'Submission failed. Please try again.')
      return
    }
    setTicketSuccess(true)
    setTicketDescription('')
    setTicketSubject(TICKET_SUBJECTS[0])
  }

  const resetTicketForm = () => {
    setTicketSuccess(false)
    setTicketError(null)
    setTicketDescription('')
    setTicketSubject(TICKET_SUBJECTS[0])
  }

  if (hidden) return null

  return (
    <>
      {/* Floating launcher button — always visible bottom-right */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Henry"
          className="no-print fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Popover window */}
      {open && (
        <div className="no-print fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100vh-64px)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">Henry</div>
                <div className="text-[11px] text-blue-100/90 leading-tight">Your help assistant</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeTab === 'ask' && chat.length > 1 && (
                <button
                  onClick={resetChat}
                  className="text-xs text-blue-100 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  title="Start a new chat"
                >
                  New
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-blue-100 hover:text-white w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 bg-white shrink-0">
            <button
              onClick={() => setActiveTab('ask')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === 'ask'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Ask
            </button>
            <button
              onClick={() => { setActiveTab('ticket'); resetTicketForm() }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === 'ticket'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              Submit ticket
            </button>
          </div>

          {/* Ask tab */}
          {activeTab === 'ask' && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/40">
                {chat.map((m, i) => (
                  <ChatBubble key={i} role={m.role} content={m.content} />
                ))}
                {sending && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 pl-2">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </span>
                    Henry is typing…
                  </div>
                )}
                {chatError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    {chatError}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-gray-100 bg-white px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    placeholder="Ask Henry…"
                    rows={1}
                    disabled={sending}
                    className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 max-h-40"
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || sending}
                    aria-label="Send"
                    className="shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Submit ticket tab */}
          {activeTab === 'ticket' && (
            <div className="flex-1 overflow-y-auto px-4 py-5 bg-gray-50/40">
              {ticketSuccess ? (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Ticket className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800 mb-1">Ticket submitted</div>
                    <div className="text-xs text-gray-500">Thanks — we&apos;ll look into it.</div>
                  </div>
                  <button
                    onClick={resetTicketForm}
                    className="mt-2 text-xs text-blue-600 hover:underline"
                  >
                    Submit another
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                    <select
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value as TicketSubject)}
                      disabled={ticketSubmitting}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {TICKET_SUBJECTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Description
                      <span className="text-gray-400 font-normal ml-1">({ticketDescription.length}/4000)</span>
                    </label>
                    <textarea
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value.slice(0, 4000))}
                      disabled={ticketSubmitting}
                      placeholder="Describe the issue or request…"
                      rows={6}
                      className="w-full resize-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>

                  {ticketError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      {ticketError}
                    </div>
                  )}

                  <button
                    onClick={submitTicket}
                    disabled={ticketSubmitting || !ticketDescription.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
                  >
                    {ticketSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                    ) : (
                      <><Ticket className="w-4 h-4" /> Submit ticket</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
