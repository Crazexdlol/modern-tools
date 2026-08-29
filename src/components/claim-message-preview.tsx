"use client"

import { useState, useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LastMessage {
  senderName: string
  body: string
  createdAt: string
}

type Resolved = LastMessage | 'empty' | 'error'
type CacheValue = { value: Resolved; ts: number } | { promise: Promise<Resolved> }

// ─── Module-level cache (session-scoped, deduplicated, 30s TTL) ──────────────
// TTL keeps hover previews fresh after new messages are posted in the same
// session; 'empty' and 'error' expire so a subsequent hover refetches.

const cache = new Map<string, CacheValue>()
const TTL_MS = 30_000

// ─── Relative time helper ────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks <= 4) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchLastMessage(claimId: string): Promise<LastMessage | 'empty' | 'error'> {
  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data, error } = await supabase
      .from('messages')
      .select('sender_name, body, created_at')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return 'error'
    if (!data) return 'empty'
    return {
      senderName: (data as { sender_name: string; body: string; created_at: string }).sender_name,
      body: (data as { sender_name: string; body: string; created_at: string }).body,
      createdAt: (data as { sender_name: string; body: string; created_at: string }).created_at,
    }
  } catch {
    return 'error'
  }
}

// ─── Popover positioning state ───────────────────────────────────────────────

interface PopoverPos {
  vertical: 'above' | 'below'
  horizontal: 'left' | 'right'
}

function computePos(rect: DOMRect): PopoverPos {
  const vertical: 'above' | 'below' =
    rect.bottom + 200 > window.innerHeight ? 'above' : 'below'
  const horizontal: 'left' | 'right' =
    rect.right + 340 > window.innerWidth ? 'right' : 'left'
  return { vertical, horizontal }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClaimMessagePreview({ claimId }: { claimId: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPos>({ vertical: 'below', horizontal: 'left' })
  const [result, setResult] = useState<LastMessage | 'empty' | 'error' | 'loading'>('loading')
  const [touchOnly, setTouchOnly] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect touch-only devices on mount; render nothing if so.
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) {
      setTouchOnly(true)
    }
  }, [])

  if (touchOnly) return null

  const resolveCache = async () => {
    const cached = cache.get(claimId)
    const now = Date.now()
    if (cached && 'value' in cached && now - cached.ts < TTL_MS) {
      setResult(cached.value)
      return
    }
    if (cached && 'promise' in cached) {
      setResult('loading')
      const value = await cached.promise
      setResult(value)
      return
    }
    setResult('loading')
    const promise = fetchLastMessage(claimId)
    cache.set(claimId, { promise })
    const value = await promise
    cache.set(claimId, { value, ts: Date.now() })
    setResult(value)
  }

  const handleMouseEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    hoverTimer.current = setTimeout(() => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setPos(computePos(rect))
      setOpen(true)
      resolveCache()
    }, 150)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    hideTimer.current = setTimeout(() => {
      setOpen(false)
    }, 100)
  }

  // Popover position classes
  const verticalClass = pos.vertical === 'above'
    ? 'bottom-full mb-1'
    : 'top-full mt-1'
  const horizontalClass = pos.horizontal === 'right'
    ? 'right-0'
    : 'left-0'

  // Truncate body for display
  const displayBody = (msg: LastMessage) =>
    msg.body.length > 300 ? msg.body.slice(0, 300) + '…' : msg.body

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Preview last message"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-blue-500 hover:text-blue-700 transition-colors"
      >
        <MessageCircle className="w-[18px] h-[18px]" strokeWidth={2.25} />
      </button>

      {open && (
        <div
          role="tooltip"
          aria-hidden={!open}
          className={`absolute ${verticalClass} ${horizontalClass} w-80 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 pointer-events-none`}
        >
          {result === 'loading' && (
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
            </div>
          )}
          {result === 'error' && (
            <p className="text-red-600 text-xs">Couldn&apos;t load message</p>
          )}
          {result === 'empty' && (
            <p className="text-gray-400 text-xs italic">No messages yet</p>
          )}
          {result !== 'loading' && result !== 'error' && result !== 'empty' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700 truncate">{result.senderName}</span>
                <span className="text-xs text-gray-400 ml-2 shrink-0">{formatRelative(result.createdAt)}</span>
              </div>
              <p
                className="text-xs text-gray-600 leading-relaxed overflow-hidden"
                style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', maxHeight: '120px' }}
              >
                {displayBody(result)}
              </p>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
