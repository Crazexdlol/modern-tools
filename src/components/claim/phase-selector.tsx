"use client"

import { useEffect, useRef, useState } from 'react'
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
  /** 'sm' fits dashboard rows; 'lg' is the prominent workspace toolbar version. */
  size?: 'sm' | 'lg'
}

/**
 * Compact phase picker for the claim workspace toolbar.
 * Fetches configs on mount. Renders as a button that opens a dropdown menu.
 * When a phase is active, the button shows a colored pill + age.
 */
export function PhaseSelector({ claimId, currentPhase, currentSetAt, onChanged, size = 'sm' }: PhaseSelectorProps) {
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
  const isLg = size === 'lg'

  // Sizing tokens per variant. Active-phase button always uses phase-tinted
  // background with BLACK text so the label is legible and prominent.
  // min-h keeps every pill the same height whether or not an age is shown.
  // Dashboard uses size="lg". w-full + fixed min-h keeps every pill the
  // same width and height whether it says "No Phase" or "Umpire\n1d".
  const buttonSize = isLg
    ? 'px-4 py-3 rounded-lg border-2 min-h-[68px] h-[68px] justify-center w-full'
    : 'px-3 py-2 rounded-lg border-2 min-h-[52px] h-[52px] justify-center w-full'
  const activeLabelSize = isLg ? 'text-xl font-black !text-black leading-tight' : 'text-sm font-bold !text-black'
  const activeAgeSize = isLg ? 'text-sm !text-black' : 'text-xs !text-black'
  const emptyLabelSize = isLg ? 'text-xl font-bold' : 'text-sm font-semibold'
  const activeBg = activeConfig
    ? phaseColorClasses(activeConfig.color)
    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center transition-colors ${buttonSize} ${activeBg} ${busy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        title={activeConfig ? `Phase: ${activeConfig.label}${age ? ` (${age})` : ''} — click to change` : 'Set phase'}
      >
        {activeConfig ? (
          <span className="flex flex-col items-center leading-tight">
            <span className={activeLabelSize}>{activeConfig.label}</span>
            {age && <span className={`font-normal ${activeAgeSize}`}>{age}</span>}
          </span>
        ) : (
          <span className={`whitespace-nowrap ${emptyLabelSize}`}>No Phase</span>
        )}
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
