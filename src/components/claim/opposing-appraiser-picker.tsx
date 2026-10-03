'use client'

import { useEffect, useRef, useState } from 'react'
import { listAllOpposingAppraisers, type OpposingAppraiser } from '@/lib/supabase/opposing-appraisers'

interface Props {
  value: string
  // Current company value — used to detect "already filled" so we don't
  // re-fire onSelect in a loop when the parent re-renders.
  currentCompany?: string
  onChange: (text: string) => void
  onSelect: (oa: OpposingAppraiser) => void
  placeholder?: string
}

// Opposing Appraiser name field. Looks and behaves like a plain text input.
// Behind the scenes: on mount it fetches the full saved-OA list into local
// state, and on every keystroke checks for an exact-name match (case- and
// whitespace-insensitive). When matched, it auto-fills the company via
// onSelect — no dropdown, no click, no confirm. Non-matching text is passed
// through as free-form via onChange.
export function OpposingAppraiserPicker({ value, currentCompany, onChange, onSelect, placeholder }: Props) {
  const [oas, setOas] = useState<OpposingAppraiser[]>([])
  const lastAutoFilledRef = useRef<string>('')

  // Load the full OA list once per mount. 83 rows (as of 2026-10-03) — small
  // enough to keep in memory and lookup synchronously on every keystroke.
  useEffect(() => {
    let cancelled = false
    listAllOpposingAppraisers().then(rows => {
      if (!cancelled) setOas(rows)
    })
    return () => { cancelled = true }
  }, [])

  // Build a lookup map keyed by normalized name.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const byName = (() => {
    const m = new Map<string, OpposingAppraiser>()
    for (const oa of oas) m.set(norm(oa.name), oa)
    return m
  })()

  // When value changes to something that matches a saved OA AND the company
  // isn't already correctly set, auto-fire onSelect. Guard against loops with
  // lastAutoFilledRef so we don't call onSelect every re-render.
  useEffect(() => {
    const key = norm(value)
    if (!key || key === lastAutoFilledRef.current) return
    const match = byName.get(key)
    if (!match) return
    if (norm(currentCompany ?? '') === norm(match.company ?? '')) {
      // Company already correct — just remember we matched this name so we
      // don't keep checking.
      lastAutoFilledRef.current = key
      return
    }
    lastAutoFilledRef.current = key
    onSelect(match)
    // byName is intentionally omitted from deps — oas drives the map; adding
    // byName (recomputed every render) would churn this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, oas, currentCompany])

  return (
    <input
      type="text"
      className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      placeholder={placeholder ?? 'First Last'}
      value={value}
      onChange={e => {
        // User is editing again — allow the next match to auto-fill.
        lastAutoFilledRef.current = ''
        onChange(e.target.value)
      }}
    />
  )
}
