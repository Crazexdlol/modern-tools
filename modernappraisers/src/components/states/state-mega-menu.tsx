"use client"

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { STATES } from '@/data/states/_index'

const CLOSE_GRACE_MS = 180

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
        className="hover:text-[color:var(--color-accent)] cursor-default transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(o => !o)}
      >
        States We Serve
      </button>

      {/* Always mounted — opacity + translate + pointer-events controlled by
          open state. Gives a smooth fade+slide in/out without unmount flicker. */}
      <div
        className={
          'absolute left-1/2 -translate-x-1/2 top-full z-40 ' +
          'bg-[color:var(--color-bg-elevated)]/95 backdrop-blur-md ' +
          'border border-white/[0.08] rounded-xl p-6 w-[780px] max-w-[92vw] ' +
          'shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] ' +
          'transition-[opacity,transform] duration-200 ease-out ' +
          (open
            ? 'opacity-100 translate-y-3 pointer-events-auto'
            : 'opacity-0 translate-y-1 pointer-events-none')
        }
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        aria-hidden={!open}
      >
        <div className="grid grid-cols-4 gap-x-6 gap-y-0.5">
          {COLUMNS.map((col, i) => (
            <ul key={i} className="space-y-0.5">
              {col.map(s => (
                <li key={s.slug}>
                  <Link
                    href={`/states/${s.slug}`}
                    className="block px-2.5 py-1.5 rounded-md text-sm text-[color:var(--color-ink)]/90 hover:bg-white/5 hover:text-[color:var(--color-accent)] transition-colors"
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
    </div>
  )
}
