"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Search, Send, Sparkles, X } from 'lucide-react'
import { fetchHelpArticles, type HelpArticle } from '@/lib/supabase/help-articles'

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
  content: `Hi — I'm Henry. Ask me anything about how to do something in Modern Tools and I'll walk you through it.`,
}

// Simple case-insensitive multi-token score for the article browser.
function scoreArticle(article: HelpArticle, tokens: string[]): number {
  if (tokens.length === 0) return 1
  const haystack = (article.question + ' ' + article.answer + ' ' + article.tags.join(' ')).toLowerCase()
  let score = 0
  for (const t of tokens) if (haystack.includes(t)) score++
  return score
}

export function HelpClient() {
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [articlesLoading, setArticlesLoading] = useState(true)

  const [chat, setChat] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const [browseOpen, setBrowseOpen] = useState(true)
  const [browseQuery, setBrowseQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchHelpArticles().then((rows) => {
      setArticles(rows)
      setArticlesLoading(false)
    })
  }, [])

  // Auto-scroll chat to bottom whenever it grows.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, sending])

  // Auto-resize the textarea up to a max height as user types.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  const tokens = useMemo(() => {
    return browseQuery.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  }, [browseQuery])

  const filtered = useMemo(() => {
    if (tokens.length === 0) return articles
    return articles
      .map((a) => ({ a, s: scoreArticle(a, tokens) }))
      .filter(({ s }) => s > 0)
      .sort((x, y) => y.s - x.s)
      .map(({ a }) => a)
  }, [articles, tokens])

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
      // return focus to the textarea for rapid follow-up
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [chat, input, sending])

  const resetChat = () => {
    setChat([GREETING])
    setChatError(null)
    setInput('')
  }

  const askArticleQuestion = (question: string) => {
    // Preserve conversation but drop a specific question into the chat so
    // the user can iterate on it.
    setInput(question)
    setBrowseOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Browse curated articles (primary, open by default) ────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setBrowseOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-left">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 leading-tight">Browse curated articles</div>
              <div className="text-xs text-gray-500 leading-tight">
                {articlesLoading ? 'Loading…' : `${articles.length} how-to article${articles.length === 1 ? '' : 's'}`}
              </div>
            </div>
          </div>
          {browseOpen
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {browseOpen && (
          <div className="border-t border-gray-100 p-5 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search articles…"
                value={browseQuery}
                onChange={(e) => setBrowseQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {articlesLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">
                No article matches. Try asking Henry below.
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filtered.map((a) => {
                  const expanded = expandedIds.has(a.id)
                  return (
                    <div key={a.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggle(a.id)}
                        className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-semibold text-gray-900">{a.question}</span>
                        {expanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                      </button>
                      {expanded && (
                        <div className="px-4 py-3 border-t border-gray-100 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50/50">
                          {a.answer}
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex gap-1 flex-wrap">
                              {a.tags.map((t) => (
                                <span key={t} className="text-[10px] font-semibold uppercase tracking-wider bg-white text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => askArticleQuestion(a.question)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" /> Ask Henry a follow-up
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Chat with Henry (secondary, always visible) ───────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">Henry</div>
              <div className="text-[11px] text-blue-100/90 leading-tight">Your help assistant</div>
            </div>
          </div>
          {chat.length > 1 && (
            <button
              onClick={resetChat}
              className="text-xs text-blue-100 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" /> New chat
            </button>
          )}
        </div>

        <div className="max-h-[520px] min-h-[320px] overflow-y-auto px-5 py-5 space-y-4 bg-gray-50/40">
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
              placeholder="Ask Henry how to do something…"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 max-h-40"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              aria-label="Send"
              className="shrink-0 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 px-1">
            Henry only answers how-to questions about Modern Tools. Verify anything important with an admin.
          </p>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
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
