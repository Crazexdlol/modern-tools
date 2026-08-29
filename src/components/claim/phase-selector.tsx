"use client"

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  fetchStatusPhaseConfigs,
  formatPhaseAge,
  phaseColorClasses,
  type StatusPhaseConfig,
} from '@/lib/supabase/status-phase-configs'

interface PhaseSelectorProps {
  claimId: string
  currentPhase: string | null | undefined
  currentSetAt: string | null | undefined
  onChanged: (newPhase: string | null, newSetAt: string | null) => void
}

/**
 * Compact phase picker for the claim workspace toolbar.
 * Fetches configs on mount. Renders as a button that opens a dropdown menu.
 * When a phase is active, the button shows a colored pill + age.
 */
export function PhaseSelector({ claimId, currentPhase, currentSetAt, onChanged }: PhaseSelectorProps) {
  const [configs, setConfigs] = useState<StatusPhaseConfig[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchStatusPhaseConfigs().then(setConfigs)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeConfig = configs.find(c => c.code === currentPhase) ?? null

  const pickPhase = async (code: string | null) => {
    setOpen(false)
    if (code === currentPhase) return
    setBusy(true)
    try {
      const res = await fetch(`/api/claims/${claimId}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: code }),
      })
      if (res.ok) {
        const newSetAt = code === null ? null : new Date().toISOString()
        onChanged(code, newSetAt)
      } else {
        const body = await res.json().catch(() => ({}))
        console.error('Phase update failed:', (body as { error?: string }).error ?? res.statusText)
      }
    } finally {
      setBusy(false)
    }
  }

  if (configs.length === 0) return null

  const age = formatPhaseAge(currentSetAt)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          activeConfig
            ? phaseColorClasses(activeConfig.color)
            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
        } ${busy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        title={activeConfig ? `Phase: ${activeConfig.label}${age ? ` (${age})` : ''} — click to change` : 'Set phase'}
      >
        {activeConfig ? (
          <span className="flex flex-col items-center leading-tight">
            <span>{activeConfig.label}</span>
            {age && <span className="opacity-70 font-normal text-[10px]">{age}</span>}
          </span>
        ) : (
          <span className="text-gray-500">No Phase</span>
        )}
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 overflow-hidden">
          <button
            type="button"
            onClick={() => pickPhase(null)}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 italic"
          >
            — None —
          </button>
          <div className="border-t border-gray-100 my-1" />
          {configs.map(cfg => (
            <button
              key={cfg.code}
              type="button"
              onClick={() => pickPhase(cfg.code)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full border ${phaseColorClasses(cfg.color)}`}
                  aria-hidden
                />
                {cfg.label}
              </span>
              {cfg.code === currentPhase && (
                <span className="text-xs text-gray-400 shrink-0">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
