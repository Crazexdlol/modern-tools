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

// Combobox for the Opposing Appraiser Name field. The input is driven DIRECTLY
// by `value` (one source of truth — no local shadow state). Typing calls
// onChange on every keystroke so the parent's claim data stays in sync.
// A dropdown of saved OAs appears when the input is focused and the text is
// at least 2 chars; clicking a result fires onSelect to fill name + company.
// On blur, if the typed text exactly matches a saved OA, we also auto-select
// so company fills without needing the dropdown click.
export function OpposingAppraiserPicker({ value, onChange, onSelect, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<OpposingAppraiser[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Debounced search whenever the field is focused + value >= 2 chars.
  useEffect(() => {
    if (!open || value.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const timer = setTimeout(() => {
      searchOpposingAppraisers(value.trim(), 10).then(rows => {
        setResults(rows)
        setLoading(false)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [value, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

  const pick = (oa: OpposingAppraiser) => {
    setOpen(false)
    setResults([])
    onSelect(oa)
  }

  const handleBlur = () => {
    // Small delay so onMouseDown on a dropdown result fires before blur.
    setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        // If what the user typed exactly matches a saved OA (name only),
        // promote to a full select so the company auto-fills.
        const match = results.find(oa => norm(oa.name) === norm(value))
        if (match && norm(match.name) !== norm(match.company ?? '')) {
          pick(match)
          return
        }
        setOpen(false)
      }
    }, 150)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder ?? 'First Last'}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); if (!open) setOpen(true) }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault()
            const match = results.find(oa => norm(oa.name) === norm(value))
            if (match) pick(match)
            else setOpen(false)
          }
        }}
      />

      {open && value.trim().length >= 2 && (
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
              // onMouseDown (not onClick) so the dropdown doesn't close before
              // the click registers when the input loses focus on the same event.
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
