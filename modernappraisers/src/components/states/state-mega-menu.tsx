"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { STATES } from '@/data/states/_index'

const CLOSE_GRACE_MS = 150

// Build 4 columns from the alphabetical STATES list.
const COLUMNS = (() => {
  const perCol = Math.ceil(STATES.length / 4)
  return [0, 1, 2, 3].map(i => STATES.slice(i * perCol, (i + 1) * perCol))
})()

export function StateMegaMenu() {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      {/* Hover-only trigger — clicking does nothing by design. Keyboard users
          toggle the dropdown with Enter/Space on this button. */}
      <button
        type="button"
        className="hover:text-[color:var(--color-accent)] cursor-default"
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(o => !o)}
      >
        States We Serve
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-3 z-40 bg-[color:var(--color-bg-elevated)] border border-white/10 rounded-lg shadow-xl p-6 w-[760px] max-w-[90vw]"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="grid grid-cols-4 gap-x-6 gap-y-1">
            {COLUMNS.map((col, i) => (
              <ul key={i} className="space-y-1">
                {col.map(s => (
                  <li key={s.slug}>
                    <Link
                      href={`/states/${s.slug}`}
                      className="block px-2 py-1 rounded text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-accent)]/10 hover:text-[color:var(--color-accent)]"
                      onClick={() => setOpen(false)}
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
