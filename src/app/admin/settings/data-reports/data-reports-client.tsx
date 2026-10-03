"use client"

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../_shared'
import { fetchStatusPhaseConfigs, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 'last-week' | 'last-month' | 'last-90' | 'custom'
type PhaseFilterMode = 'include' | 'exclude'

interface MetricsResult {
  received: number
  closed: number
  overDays: number
  range: { from: string; to: string }
  overDaysThreshold: number
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function presetDates(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const to = toDateStr(today)
  if (preset === 'last-week') {
    const f = new Date(today); f.setDate(today.getDate() - 7)
    return { from: toDateStr(f), to }
  }
  if (preset === 'last-month') {
    const f = new Date(today); f.setDate(today.getDate() - 30)
    return { from: toDateStr(f), to }
  }
  if (preset === 'last-90') {
    const f = new Date(today); f.setDate(today.getDate() - 90)
    return { from: toDateStr(f), to }
  }
  return { from: to, to }
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataReportsClient() {
  // --- Filters state ---
  const [preset, setPreset] = useState<Preset>('last-month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [overDays, setOverDays] = useState(60)

  // --- Phase filter state ---
  const [phases, setPhases] = useState<StatusPhaseConfig[]>([])
  const [checkedPhases, setCheckedPhases] = useState<Set<string>>(new Set())
  const [phaseMode, setPhaseMode] = useState<PhaseFilterMode>('include')
  const [phasesLoaded, setPhasesLoaded] = useState(false)

  // --- Metrics state ---
  const [metrics, setMetrics] = useState<MetricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load phase configs on mount.
  useEffect(() => {
    fetchStatusPhaseConfigs().then(configs => {
      setPhases(configs)
      setCheckedPhases(new Set(configs.map(c => c.code)))
      setPhasesLoaded(true)
    })
  }, [])

  // Compute effective from/to.
  const effectiveDates = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : presetDates(preset)

  const doFetch = useCallback(async () => {
    const { from, to } = effectiveDates
    if (!from || !to) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to, overDays: String(overDays) })
      // Build phase filter params.
      if (phasesLoaded && phases.length > 0) {
        const allCodes = phases.map(p => p.code)
        const checkedArr = allCodes.filter(c => checkedPhases.has(c))
        if (phaseMode === 'include' && checkedArr.length < allCodes.length) {
          // Some phases unchecked — only include the checked ones.
          params.set('includePhases', checkedArr.join(','))
        } else if (phaseMode === 'exclude' && checkedArr.length > 0) {
          // Exclude the checked codes.
          params.set('excludePhases', checkedArr.join(','))
        }
      }
      const res = await fetch(`/api/admin/data-reports?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setMetrics(body as MetricsResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo, overDays, phases, checkedPhases, phaseMode, phasesLoaded])

  // Trigger initial fetch after phases loaded.
  useEffect(() => {
    if (phasesLoaded) doFetch()
  // Only re-run when phasesLoaded first becomes true.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesLoaded])

  const handlePresetChange = (next: Preset) => {
    setPreset(next)
    if (next !== 'custom') {
      const dates = presetDates(next)
      setCustomFrom(dates.from)
      setCustomTo(dates.to)
    }
  }

  const togglePhase = (code: string) => {
    setCheckedPhases(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleAllPhases = () => {
    if (checkedPhases.size === phases.length) {
      setCheckedPhases(new Set())
    } else {
      setCheckedPhases(new Set(phases.map(p => p.code)))
    }
  }

  const { from: displayFrom, to: displayTo } = effectiveDates

  return (
    <div className="space-y-6">
      {/* ── Filters ── */}
      <SectionCard title="Filters">
        <div className="space-y-5">
          {/* Date range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Date range
              </label>
              <select
                value={preset}
                onChange={e => handlePresetChange(e.target.value as Preset)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="last-week">Last week (7 days)</option>
                <option value="last-month">Last month (30 days)</option>
                <option value="last-90">Last 90 days</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={preset === 'custom' ? customFrom : displayFrom}
                  disabled={preset !== 'custom'}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={preset === 'custom' ? customTo : displayTo}
                  disabled={preset !== 'custom'}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* Over X days */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
              "Over X days old" threshold
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={overDays}
              onChange={e => setOverDays(Math.max(1, parseInt(e.target.value, 10) || 60))}
              className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">days</span>
          </div>

          {/* Phase filter */}
          {phases.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Phase filter
                  </span>
                  {/* Include / Exclude toggle */}
                  <div className="inline-flex rounded border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPhaseMode('include')}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                        phaseMode === 'include' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Include selected
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhaseMode('exclude')}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors border-l border-gray-200 ${
                        phaseMode === 'exclude' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Exclude selected
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleAllPhases}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {checkedPhases.size === phases.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {phases.map(phase => (
                  <label key={phase.code} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checkedPhases.has(phase.code)}
                      onChange={() => togglePhase(phase.code)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {phase.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Refresh */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={doFetch}
              disabled={loading || !displayFrom || !displayTo}
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </SectionCard>

      {/* ── Metrics ── */}
      <SectionCard title="Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Claims received"
            hint={displayFrom && displayTo ? `created ${fmtDate(displayFrom)} – ${fmtDate(displayTo)}` : ''}
            value={loading ? null : (metrics?.received ?? null)}
          />
          <MetricCard
            label="Claims closed"
            hint={displayFrom && displayTo ? `closed ${fmtDate(displayFrom)} – ${fmtDate(displayTo)}` : ''}
            value={loading ? null : (metrics?.closed ?? null)}
          />
          <MetricCard
            label={`Claims over ${metrics?.overDaysThreshold ?? overDays} days old`}
            hint="open claims only"
            value={loading ? null : (metrics?.overDays ?? null)}
          />
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Metric card sub-component ────────────────────────────────────────────────

function MetricCard({
  label,
  hint,
  value,
}: {
  label: string
  hint: string
  value: number | null
}) {
  return (
    <div className="border border-gray-200 rounded-lg px-5 py-4 bg-white">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1">
        {label}
      </div>
      <div className="text-4xl font-bold text-gray-900 tabular-nums leading-none mb-2">
        {value === null ? <span className="text-gray-300">—</span> : value.toLocaleString()}
      </div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  )
}
