"use client"

import { useState } from 'react'
import { Download, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ClaimInfo } from '@/lib/acv/types'
import { formatCurrency } from '@/lib/acv/calculations'
import type { DVVariant } from '@/lib/acv/dv-pdf-filler'

// Damage severity rubric — straight from the Modern Appraisers DV reports.
export const DAMAGE_SEVERITY_SCALE = [
  { value: 1.0, label: 'Frame replacement, Multi structural panel replacement' },
  { value: 0.85, label: 'Extensive Body/Frame Pulls, One structural part replacement, major damage to structure' },
  { value: 0.6, label: 'Minor Body/Frame Pulls, Minor damage to structure, Multi bolt-on body panel replacement' },
  { value: 0.45, label: 'Electrical damage, Mechanical/Suspension damage' },
  { value: 0.3, label: 'Exterior body panel repair, One exterior body panel replacement, Multi body panel refinish' },
  { value: 0.15, label: 'Cosmetic damage, One body panel refinish' },
]

// Mileage rubric — modifier by loss-vehicle mileage band.
export const MILEAGE_SCALE = [
  { value: 1.0, label: '0 – 15,000' },
  { value: 0.9, label: '15,001 – 30,000' },
  { value: 0.8, label: '30,001 – 45,000' },
  { value: 0.7, label: '45,001 – 60,000' },
  { value: 0.6, label: '60,001 – 75,000' },
  { value: 0.5, label: '75,001 – 90,000' },
  { value: 0.4, label: '90,001 – 105,000' },
  { value: 0.3, label: '105,001+' },
]

export function mileageModifierFor(miles: number): number {
  if (miles <= 15000) return 1.0
  if (miles <= 30000) return 0.9
  if (miles <= 45000) return 0.8
  if (miles <= 60000) return 0.7
  if (miles <= 75000) return 0.6
  if (miles <= 90000) return 0.5
  if (miles <= 105000) return 0.4
  return 0.3
}

// Per-claim DV state, stored as acv_history.dv jsonb via workspace auto-save.
export interface DVState {
  reportType: 'attorney' | 'sedgwick'
  withPriorLoss: boolean
  kbbHigh: number
  kbbLow: number
  priorLossAdjust: number
  conditionAdjust: number
  aftermarketAdjust: number
  damageSeverity: number
  mileageModifier: number | null // null = auto from claim mileage
  priorLossPercent: number
  policyNumber: string
  licensePlate: string
  licenseState: string
  adjusterEmail: string
}

export function defaultDVState(): DVState {
  return {
    reportType: 'sedgwick',
    withPriorLoss: false,
    kbbHigh: 0,
    kbbLow: 0,
    priorLossAdjust: 0,
    conditionAdjust: 0,
    aftermarketAdjust: 0,
    damageSeverity: 0.3,
    mileageModifier: null,
    priorLossPercent: 30,
    policyNumber: '',
    licensePlate: '',
    licenseState: '',
    adjusterEmail: '',
  }
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export function MoneyInput({ label, value, onChange, prefix = '$' }: {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{prefix}</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-full bg-white border border-gray-200 rounded-md pl-7 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={text ?? (value === 0 ? '' : String(value))}
          onChange={(e) => {
            setText(e.target.value)
            const n = parseFloat(e.target.value.replace(/[^0-9.-]/g, ''))
            onChange(isNaN(n) ? 0 : n)
          }}
          onBlur={() => setText(null)}
          placeholder="0.00"
        />
      </div>
    </div>
  )
}

export function DVResultCard({ dv, claimMileage }: { dv: DVState; claimMileage: number }) {
  const mileMod = dv.mileageModifier ?? mileageModifierFor(claimMileage)
  const baselineLov = Math.max(0, dv.kbbHigh - dv.kbbLow)
  const smLov = baselineLov * dv.damageSeverity * mileMod
  const adjustedLov = smLov * (dv.priorLossPercent / 100)
  const finalDv = dv.withPriorLoss ? smLov - adjustedLov : smLov
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-1.5 text-sm">
      <div className="flex justify-between"><span className="text-gray-600">Baseline L.O.V. (high − low value)</span><span className="font-semibold text-gray-900">{formatCurrency(baselineLov)}</span></div>
      <div className="flex justify-between"><span className="text-gray-600">× Damage Severity</span><span className="font-semibold text-gray-900">{dv.damageSeverity.toFixed(2)}</span></div>
      <div className="flex justify-between"><span className="text-gray-600">× Mileage Modifier{dv.mileageModifier == null ? ' (auto)' : ''}</span><span className="font-semibold text-gray-900">{mileMod.toFixed(2)}</span></div>
      <div className="flex justify-between border-t border-blue-200 pt-1.5"><span className="text-gray-600">Severity-Modified L.O.V.</span><span className="font-semibold text-gray-900">{formatCurrency(smLov)}</span></div>
      {dv.withPriorLoss && (
        <>
          <div className="flex justify-between"><span className="text-gray-600">− Prior-loss reduction ({dv.priorLossPercent}%)</span><span className="font-semibold text-red-600">−{formatCurrency(adjustedLov)}</span></div>
        </>
      )}
      <div className="flex justify-between border-t-2 border-blue-300 pt-2 text-base">
        <span className="font-bold text-gray-900">Inherent Diminished Value</span>
        <span className="font-bold text-blue-700">{formatCurrency(finalDv)}</span>
      </div>
    </div>
  )
}

export function DVTab({
  claim,
  dv,
  onChange,
  onGenerated,
}: {
  claim: ClaimInfo
  dv: DVState | null
  onChange: (next: DVState) => void
  onGenerated?: (blob: Blob, name: string) => void
}) {
  const state = dv ?? defaultDVState()
  const set = (patch: Partial<DVState>) => onChange({ ...state, ...patch })

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mileMod = state.mileageModifier ?? mileageModifierFor(claim.mileage)
  const baselineLov = Math.max(0, state.kbbHigh - state.kbbLow)
  const smLov = baselineLov * state.damageSeverity * mileMod
  const adjustedLov = smLov * (state.priorLossPercent / 100)
  const finalDv = state.withPriorLoss ? smLov - adjustedLov : smLov
  const acv = state.kbbHigh + state.priorLossAdjust + state.conditionAdjust + state.aftermarketAdjust

  const variant: DVVariant = `${state.withPriorLoss ? 'wloss' : 'nationwide'}-${state.reportType}` as DVVariant

  const highLabel = state.reportType === 'attorney' ? 'KBB / JDP HIGH — "Fair Purchase Price / Updated Value"' : 'KBB / JDP HIGH — "Private Party, Excellent Value"'
  const lowLabel = state.reportType === 'attorney' ? 'KBB / JDP LOW — "Trade-In, Fair Value"' : 'KBB / JDP LOW — "Private Party, Fair Value"'

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch('/api/acv/generate-dv-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant,
          data: {
            date: new Date().toISOString().split('T')[0],
            claimNumber: claim.claimNumber,
            fileNumber: claim.maNumber,
            clientName: claim.insuredName,
            phone: claim.ownerPhone,
            vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
            vin: claim.vin,
            mileage: claim.mileage,
            ownerEmail: claim.ownerEmail,
            ownerAddress: claim.ownerAddress,
            dateOfLoss: claim.dateOfLoss,
            licensePlate: state.licensePlate,
            licenseState: state.licenseState,
            insuranceCompany: claim.insuranceCompany,
            policyNumber: state.policyNumber,
            adjusterName: claim.adjuster,
            adjusterPhone: claim.adjusterPhone,
            adjusterEmail: state.adjusterEmail || claim.adjusterEmail,
            kbbHigh: state.kbbHigh,
            priorLossAdjust: state.priorLossAdjust,
            conditionAdjust: state.conditionAdjust,
            aftermarketAdjust: state.aftermarketAdjust,
            acv,
            kbbLow: state.kbbLow,
            baselineLov,
            damageSeverity: state.damageSeverity,
            mileageModifier: mileMod,
            severityModifiedLov: smLov,
            priorLossPercent: state.priorLossPercent,
            adjustedLov,
            finalDv,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const name = `${claim.maNumber || 'claim'}-DV-${state.reportType}${state.withPriorLoss ? '-wLoss' : ''}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      onGenerated?.(blob, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-6">
      {/* Report type */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Report Type</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client Type</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => set({ reportType: 'sedgwick' })} className={cn('flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors', state.reportType === 'sedgwick' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>Insurance</button>
                <button type="button" onClick={() => set({ reportType: 'attorney' })} className={cn('flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors', state.reportType === 'attorney' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>Consumer / Attorney</button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Prior Loss on Record?</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => set({ withPriorLoss: false })} className={cn('flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors', !state.withPriorLoss ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>No Prior Loss</button>
                <button type="button" onClick={() => set({ withPriorLoss: true })} className={cn('flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors', state.withPriorLoss ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>With Prior Loss</button>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400">Claim info, owner, insurance, and vehicle details fill automatically from the Claim Info tab.</p>
        </CardContent>
      </Card>

      {/* Values */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Vehicle Values (KBB / J.D. Power)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MoneyInput label={highLabel} value={state.kbbHigh} onChange={(v) => set({ kbbHigh: v })} />
            <MoneyInput label={lowLabel} value={state.kbbLow} onChange={(v) => set({ kbbLow: v })} />
            <MoneyInput label="Prior Loss Vehicle Adjustments" value={state.priorLossAdjust} onChange={(v) => set({ priorLossAdjust: v })} />
            <MoneyInput label="Condition Adjustment" value={state.conditionAdjust} onChange={(v) => set({ conditionAdjust: v })} />
            <MoneyInput label="After Market Parts Adjustment" value={state.aftermarketAdjust} onChange={(v) => set({ aftermarketAdjust: v })} />
            <div>
              <label className={labelCls}>Resulting ACV (auto)</label>
              <div className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-900">{formatCurrency(acv)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Damage severity rubric */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Damage Severity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {DAMAGE_SEVERITY_SCALE.map((row) => (
            <button
              key={row.value}
              type="button"
              onClick={() => set({ damageSeverity: row.value })}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                state.damageSeverity === row.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <span className={cn('font-mono text-sm font-bold shrink-0 mt-0.5', state.damageSeverity === row.value ? 'text-blue-700' : 'text-gray-500')}>{row.value.toFixed(2)}</span>
              <span className="text-sm text-gray-700">{row.label}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Mileage rubric */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-gray-900">
            Mileage Modifier
            <span className="ml-2 text-xs font-normal text-gray-400">
              Loss vehicle mileage: {claim.mileage ? claim.mileage.toLocaleString() : '—'} → auto {mileageModifierFor(claim.mileage).toFixed(2)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {MILEAGE_SCALE.map((row) => {
              const selected = mileMod === row.value
              const isAuto = mileageModifierFor(claim.mileage) === row.value
              return (
                <button
                  key={row.value}
                  type="button"
                  onClick={() => set({ mileageModifier: row.value === mileageModifierFor(claim.mileage) ? null : row.value })}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left transition-colors',
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <span className={cn('font-mono text-sm font-bold', selected ? 'text-blue-700' : 'text-gray-500')}>{row.value.toFixed(2)}</span>
                  <span className="block text-xs text-gray-500">{row.label}{isAuto ? ' (auto)' : ''}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Prior loss reduction (wLoss only) */}
      {state.withPriorLoss && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader><CardTitle className="text-gray-900">Prior-Loss Reduction</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              −15% for observed pre-loss prior repairs / unrepaired unrelated damage over $1,000.
              −30% if the VIN check reveals prior claims, accidents, damage, theft, salvage title, or total-loss events.
              +15% more per additional occurrence, up to 100%.
            </p>
            <div className="flex flex-wrap gap-2">
              {[15, 30, 45, 60, 75, 90, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => set({ priorLossPercent: pct })}
                  className={cn('px-4 py-2 rounded-lg border text-sm font-semibold transition-colors', state.priorLossPercent === pct ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extra report fields not in Claim Info */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Additional Report Fields</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Policy Number</label>
              <input className={inputCls} value={state.policyNumber} onChange={(e) => set({ policyNumber: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Adjuster E-mail (defaults from Claim Info)</label>
              <input className={inputCls} placeholder={claim.adjusterEmail || 'adjuster@insurer.com'} value={state.adjusterEmail} onChange={(e) => set({ adjusterEmail: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>License Plate</label>
              <input className={inputCls} value={state.licensePlate} onChange={(e) => set({ licensePlate: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>License State</label>
              <select className={inputCls} value={state.licenseState} onChange={(e) => set({ licenseState: e.target.value })}>
                <option value="">—</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live result */}
      <DVResultCard dv={{ ...state, mileageModifier: state.mileageModifier }} claimMileage={claim.mileage} />

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
        {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
        Download DV Report ({state.reportType === 'attorney' ? 'Attorney' : 'Insurance'}{state.withPriorLoss ? ', w/ Prior Loss' : ''})
      </Button>
    </div>
  )
}
