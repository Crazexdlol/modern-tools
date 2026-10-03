'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { searchOpposingAppraisers, type OpposingAppraiser } from '@/lib/supabase/opposing-appraisers'

interface Props {
  value: string
  onChange: (text: string) => void
  onSelect: (oa: OpposingAppraiser) => void
  placeholder?: string
}

export function OpposingAppraiserPicker({ value, onChange, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<OpposingAppraiser[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Debounced search whenever query >= 2 chars.
  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const timer = setTimeout(() => {
      searchOpposingAppraisers(query.trim(), 10).then(rows => {
        setResults(rows)
        setLoading(false)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [query, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Sync display value when the parent changes value externally (e.g. claim switch).
  useEffect(() => {
    if (!open) setQuery('')
  }, [value, open])

  const pick = (oa: OpposingAppraiser) => {
    setOpen(false)
    setQuery('')
    setResults([])
    onSelect(oa)
  }

  // If what the user typed exactly matches a saved OA (name, case-insensitive,
  // whitespace-tolerant), return that OA so we can auto-fill the company
  // instead of leaving it to the user to click the dropdown.
  const findExactMatch = (text: string): OpposingAppraiser | null => {
    const norm = text.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!norm) return null
    return results.find(oa => oa.name.trim().toLowerCase().replace(/\s+/g, ' ') === norm) ?? null
  }

  const commitTextOrPick = (text: string) => {
    const exact = findExactMatch(text)
    if (exact) { pick(exact); return }
    if (text.trim()) onChange(text.trim())
    setOpen(false)
    setQuery('')
  }

  const handleBlur = () => {
    // Small delay so onMouseDown on a result fires before blur.
    setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        commitTextOrPick(query)
      }
    }, 150)
  }

  const displayValue = open ? query : value

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder ?? 'First Last'}
        value={displayValue}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); setQuery('') }
          if (e.key === 'Enter' && query.trim()) { e.preventDefault(); commitTextOrPick(query) }
        }}
      />

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-60 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No saved OAs match. Type freely or add via Admin → Settings.</div>
          )}
          {results.map(oa => (
            <button
              key={oa.id}
              type="button"
              // onMouseDown (not onClick) so the dropdown doesn't close before the
              // click registers when the input loses focus on the same event.
              onMouseDown={e => { e.preventDefault(); pick(oa) }}
              className="w-full flex flex-col items-start px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
            >
              <span className="text-sm font-semibold text-gray-900">{oa.name}</span>
              {oa.company && (
                <span className="text-xs text-gray-500">{oa.company}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
