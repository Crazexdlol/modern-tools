"use client"

import Link from 'next/link'
import { useState } from 'react'
import { STATES } from '@/data/states/_index'

export function StateMobileMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 text-left text-xl font-semibold text-[color:var(--color-ink)]"
        aria-expanded={open}
      >
        <span>States We Serve</span>
        <span className="text-sm text-[color:var(--color-ink-muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="pl-3 space-y-1 pb-3">
          {STATES.map(s => (
            <li key={s.slug}>
              <Link
                href={`/states/${s.slug}`}
                className="block py-1 text-base text-[color:var(--color-ink)]"
                onClick={onNavigate}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
