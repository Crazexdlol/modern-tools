'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

// Minimum typed chars before we start suggesting. Below this the ghost stays
// hidden so the user can tab out of an empty / barely-started field cleanly.
const MIN_PREFIX = 3

// Opposing Appraiser name field with inline ghost-text autocomplete:
// after you've typed MIN_PREFIX+ characters, the remainder of the best
// matching saved OA appears in gray AFTER your cursor. Press Tab to accept —
// the field fills in and the company auto-fills via onSelect. Any other key
// just types normally. No dropdown, no modal.
export function OpposingAppraiserPicker({ value, currentCompany, onChange, onSelect, placeholder }: Props) {
  const [oas, setOas] = useState<OpposingAppraiser[]>([])
  const lastAutoFilledRef = useRef<string>('')

  // Load the full OA list once per mount.
  useEffect(() => {
    let cancelled = false
    listAllOpposingAppraisers().then(rows => {
      if (!cancelled) setOas(rows)
    })
    return () => { cancelled = true }
  }, [])

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

  const byName = useMemo(() => {
    const m = new Map<string, OpposingAppraiser>()
    for (const oa of oas) m.set(norm(oa.name), oa)
    return m
  }, [oas])

  // Compute the best prefix match for the current typed value. Returns the
  // full completed name (user's casing preserved for the prefix, saved OA's
  // characters for the remainder) and the matched OA record.
  const suggestion = useMemo(() => {
    const trimmed = value.trim()
    if (trimmed.length < MIN_PREFIX) return null
    const key = norm(value)
    // Scan the sorted-by-name list for the first entry whose normalized name
    // starts with the typed prefix but ISN'T exactly equal (nothing to
    // complete if it's already an exact match).
    const match = oas.find(oa => {
      const n = norm(oa.name)
      return n.startsWith(key) && n !== key
    })
    if (!match) return null
    // Preserve the user's typed characters as-is for the first value.length
    // characters so the ghost's invisible prefix aligns with the input text.
    const completedName = value + match.name.slice(value.length)
    return { oa: match, completedName }
  }, [value, oas])

  // Exact-match auto-fill: when `value` becomes a complete match (either by
  // typing or by accepting the ghost), fire onSelect to fill the company.
  // Guard against loops with lastAutoFilledRef.
  useEffect(() => {
    const key = norm(value)
    if (!key || key === lastAutoFilledRef.current) return
    const match = byName.get(key)
    if (!match) return
    if (norm(currentCompany ?? '') === norm(match.company ?? '')) {
      lastAutoFilledRef.current = key
      return
    }
    lastAutoFilledRef.current = key
    onSelect(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, byName, currentCompany])

  const acceptSuggestion = () => {
    if (!suggestion) return
    // Fire onChange with the completed name — the exact-match effect above
    // will then fire onSelect to also set the company.
    onChange(suggestion.completedName)
  }

  return (
    <div className="relative w-full">
      {suggestion && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none px-2.5 py-1.5 text-sm whitespace-pre"
          // text-transparent on the prefix so it aligns with the input char
          // for char, then gray for the tail = classic ghost-autocomplete.
        >
          <span className="text-transparent">{value}</span>
          <span className="text-gray-400">{suggestion.completedName.slice(value.length)}</span>
        </div>
      )}
      <input
        type="text"
        className="relative w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder ?? 'First Last'}
        value={value}
        onChange={e => {
          // User is editing again — allow the next exact match to auto-fill.
          lastAutoFilledRef.current = ''
          onChange(e.target.value)
        }}
        onKeyDown={e => {
          // Tab (with no modifiers) and Right-Arrow at the end of the input
          // accept the ghost suggestion. Shift+Tab retains default behavior.
          if (e.key === 'Tab' && !e.shiftKey && suggestion) {
            e.preventDefault()
            acceptSuggestion()
          } else if (
            e.key === 'ArrowRight' &&
            suggestion &&
            e.currentTarget.selectionStart === value.length
          ) {
            e.preventDefault()
            acceptSuggestion()
          }
        }}
        style={{ background: suggestion ? 'transparent' : undefined }}
      />
    </div>
  )
}
