"use client"

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

// ─── Timestamp helper ────────────────────────────────────────────────────────
// PST (America/Los_Angeles), e.g. "Aug 29, 12:45 PM". No seconds.

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
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

// ─── Popover positioning (viewport-fixed) ────────────────────────────────────
// Rendered via a portal with position:fixed so the popover escapes the table's
// overflow:auto container. Coordinates are computed from the trigger button's
// bounding rect each time it opens.
//
// The popover sizes itself to its content (bounded by MAX_W / MAX_H), is placed
// just below the icon when there's room below, otherwise just above. Horizontal
// alignment anchors to the right edge of the icon by default, flipping to the
// left edge if the popover would spill past the viewport right-edge.

const PX_GAP = 6
const MAX_W = 320
const MAX_H = 220

interface PopoverRect {
  top: number
  left: number
  maxWidth: number
  maxHeight: number
}

function computeRect(iconRect: DOMRect): PopoverRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spaceBelow = vh - iconRect.bottom - PX_GAP
  const spaceAbove = iconRect.top - PX_GAP
  // Prefer below when the popover fits; otherwise flip above. If neither has
  // the full MAX_H the popover shrinks to the available room (overflow-y auto
  // handles the rare long-message case).
  const placeBelow = spaceBelow >= Math.min(MAX_H, 120) || spaceBelow >= spaceAbove
  const maxHeight = Math.min(MAX_H, placeBelow ? spaceBelow : spaceAbove)
  const top = placeBelow ? iconRect.bottom + PX_GAP : iconRect.top - PX_GAP - maxHeight
  // Anchor the popover's right edge to the icon's right edge by default so it
  // doesn't cover the row content to the right. If that would push the left
  // edge off-screen, anchor the left edge to the icon's left edge instead.
  const anchorRight = iconRect.right
  const anchorLeft = iconRect.left
  const maxWidth = Math.min(MAX_W, vw - 16)
  let left = anchorRight - maxWidth
  if (left < 8) left = Math.min(anchorLeft, vw - maxWidth - 8)
  return { top, left, maxWidth, maxHeight }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClaimMessagePreview({ claimId }: { claimId: string }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<PopoverRect | null>(null)
  const [result, setResult] = useState<LastMessage | 'empty' | 'error' | 'loading'>('loading')
  const [touchOnly, setTouchOnly] = useState(false)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect touch-only devices on mount; render nothing if so. Also marks the
  // component mounted so the portal only renders client-side (no SSR fallback).
  useEffect(() => {
    setMounted(true)
    if (window.matchMedia('(hover: none)').matches) {
      setTouchOnly(true)
    }
  }, [])

  // Close the popover on scroll — the fixed-positioned coordinates would
  // otherwise lag behind the icon. Also closes on resize for the same reason.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

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
      const iconRect = buttonRef.current?.getBoundingClientRect()
      if (iconRect) setRect(computeRect(iconRect))
      setOpen(true)
      resolveCache()
    }, 150)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    // Give the cursor enough time to cross the 4px gap between the icon and
    // the popover (and back). Original 100ms was too tight on some users'
    // machines — popover disappeared before they could land on it to read.
    hideTimer.current = setTimeout(() => {
      setOpen(false)
    }, 400)
  }

  // Hovering onto the popover itself should cancel the hide so the user can
  // read it without racing the timer. Leaving the popover re-arms the hide.
  const handlePopoverEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }
  const handlePopoverLeave = () => {
    hideTimer.current = setTimeout(() => {
      setOpen(false)
    }, 400)
  }

  // Strip HTML to plain text, then truncate for display. The message body
  // is stored as sanitized HTML (contenteditable innerHTML from the composer,
  // which emits <br>/<p>/<div> for line breaks and formatting). Rendering it
  // raw inside the preview tooltip surfaced literal "<br><br>" tags next to
  // the text. Pull textContent via a DOMParser rather than regex-stripping so
  // &amp;/&lt; entities decode too. SSR-safe fallback: if no DOM (preview
  // tooltip runs in the browser, but belt-and-suspenders), do a basic regex
  // strip + entity decode so we never show tags to the user.
  const htmlToText = (html: string): string => {
    if (typeof document !== 'undefined') {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      // <br> and <p>/<div> boundaries become spaces so "Hi<br>Jason" renders
      // as "Hi Jason" and not "HiJason" in the preview truncation.
      doc.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
      doc.querySelectorAll('p, div, li').forEach((el) => el.append(' '))
      return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    return html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li)\s*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const displayBody = (msg: LastMessage) => {
    const plain = htmlToText(msg.body)
    return plain.length > 500 ? plain.slice(0, 500) + '…' : plain
  }

  const popover = open && rect && (
    <div
      role="tooltip"
      aria-hidden={!open}
      onMouseEnter={handlePopoverEnter}
      onMouseLeave={handlePopoverLeave}
      className="fixed z-[60] bg-white border border-gray-200 rounded-lg shadow-xl p-3 overflow-y-auto"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.maxWidth,
        maxHeight: rect.maxHeight,
      }}
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
            <span className="text-xs text-gray-400 ml-2 shrink-0">{formatStamp(result.createdAt)}</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
            {displayBody(result)}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <span className="inline-flex items-center">
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
      {mounted && popover ? createPortal(popover, document.body) : null}
    </span>
  )
}
