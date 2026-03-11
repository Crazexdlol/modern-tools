"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RotateCcw,
  Search,
  AlertCircle,
  Car,
  MapPin,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ClaimInfo, MarketComp, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import {
  calculateACV,
  calculateCompValue,
  defaultAdjustments,
  formatCurrency,
} from '@/lib/acv/calculations'

const HISTORY_KEY = 'modern-tools-acv-history'

interface ACVHistoryEntry {
  id: string
  date: string
  mode: string
  vehicle: string
  vin: string
  maNumber: string
  acv: number
  claim: ClaimInfo
  comps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
}

function saveToHistory(
  claim: ClaimInfo,
  comps: SelectedComp[],
  adjustments: ACVAdjustments,
  result: ACVResult,
  mode: 'comp-finder' | 'auto-acv',
  editId?: string | null,
) {
  try {
    const entry = {
      id: editId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      mode,
      vehicle: `${claim.year} ${claim.make} ${claim.model}`,
      vin: claim.vin,
      maNumber: claim.maNumber,
      acv: result.acv,
      claim,
      comps,
      adjustments,
      result,
    }
    let existing = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (editId) {
      existing = existing.filter((e: ACVHistoryEntry) => e.id !== editId)
    }
    existing.unshift(entry)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(existing.slice(0, 50)))
  } catch { /* localStorage unavailable */ }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

// ── Shared claim form fields ────────────────────────────────────────────────
function ClaimInfoForm({
  claim,
  onChange,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
}) {
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)

  const set = (field: keyof ClaimInfo, value: string | number) =>
    onChange({ ...claim, [field]: value })

  const decodeVin = async () => {
    if (claim.vin.length !== 17) {
      setDecodeError('VIN must be exactly 17 characters')
      return
    }
    setDecoding(true)
    setDecodeError(null)
    try {
      const res = await fetch(`/api/acv/decode-vin?vin=${claim.vin}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Decode failed')
      onChange({
        ...claim,
        year: data.year ?? claim.year,
        make: data.make ?? claim.make,
        model: data.model ?? claim.model,
        trim: data.trim ?? claim.trim,
      })
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'VIN decode failed')
    } finally {
      setDecoding(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Report Info
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>MA Number</label>
            <input
              className={inputCls}
              placeholder="MA-12345"
              value={claim.maNumber}
              onChange={(e) => set('maNumber', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Insurance Claim #</label>
            <input
              className={inputCls}
              placeholder="CLM-00001"
              value={claim.claimNumber}
              onChange={(e) => set('claimNumber', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Date of Loss</label>
            <input
              type="date"
              className={inputCls}
              value={claim.dateOfLoss}
              onChange={(e) => set('dateOfLoss', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Owner fields */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Owner / Client
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Client Type</label>
            <select
              className={inputCls}
              value={claim.clientType}
              onChange={(e) => set('clientType', e.target.value as 'Insured' | 'Claimant')}
            >
              <option value="Insured">Insured</option>
              <option value="Claimant">Claimant</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Insured / Owner Name</label>
            <input
              className={inputCls}
              placeholder="John Smith"
              value={claim.insuredName}
              onChange={(e) => set('insuredName', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Owner Phone</label>
            <input
              className={inputCls}
              placeholder="(555) 000-0000"
              value={claim.ownerPhone}
              onChange={(e) => set('ownerPhone', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Owner Email</label>
            <input
              className={inputCls}
              placeholder="owner@email.com"
              value={claim.ownerEmail}
              onChange={(e) => set('ownerEmail', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Owner Address</label>
            <input
              className={inputCls}
              placeholder="123 Main St, City, ST 00000"
              value={claim.ownerAddress}
              onChange={(e) => set('ownerAddress', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Insurance fields */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Insurance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Insurance Company</label>
            <input
              className={inputCls}
              placeholder="State Farm"
              value={claim.insuranceCompany}
              onChange={(e) => set('insuranceCompany', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Adjuster Name</label>
            <input
              className={inputCls}
              placeholder="Jane Doe"
              value={claim.adjuster}
              onChange={(e) => set('adjuster', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Adjuster Phone</label>
            <input
              className={inputCls}
              placeholder="(555) 000-0000"
              value={claim.adjusterPhone}
              onChange={(e) => set('adjusterPhone', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Adjuster Email</label>
            <input
              className={inputCls}
              placeholder="adjuster@insurer.com"
              value={claim.adjusterEmail}
              onChange={(e) => set('adjusterEmail', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Vehicle fields */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Vehicle
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>VIN</label>
            <div className="flex gap-2">
              <input
                className={cn(inputCls, 'flex-1 font-mono uppercase')}
                placeholder="17-character VIN"
                maxLength={17}
                value={claim.vin}
                onChange={(e) => set('vin', e.target.value.toUpperCase())}
              />
              <Button
                onClick={decodeVin}
                disabled={decoding || claim.vin.length !== 17}
                className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white"
                size="sm"
              >
                {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decode'}
              </Button>
            </div>
            {decodeError && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {decodeError}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <input
              type="number"
              className={inputCls}
              placeholder="2020"
              value={claim.year || ''}
              onChange={(e) => set('year', parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className={labelCls}>Make</label>
            <input
              className={inputCls}
              placeholder="Toyota"
              value={claim.make}
              onChange={(e) => set('make', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input
              className={inputCls}
              placeholder="Camry"
              value={claim.model}
              onChange={(e) => set('model', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Trim</label>
            <input
              className={inputCls}
              placeholder="XLE"
              value={claim.trim}
              onChange={(e) => set('trim', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Mileage</label>
            <input
              type="number"
              className={inputCls}
              placeholder="45000"
              value={claim.mileage || ''}
              onChange={(e) => set('mileage', parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className={labelCls}>ZIP Code</label>
            <input
              className={inputCls}
              placeholder="90210"
              maxLength={5}
              value={claim.zip}
              onChange={(e) => set('zip', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Search Radius (miles)</label>
            <input
              type="number"
              className={inputCls}
              placeholder="150"
              value={claim.radius || ''}
              onChange={(e) => set('radius', parseInt(e.target.value) || 150)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Comp card ────────────────────────────────────────────────────────────────
function CompCard({
  comp,
  selected,
  selectionIndex,
  onToggle,
  disabled,
}: {
  comp: MarketComp
  selected: boolean
  selectionIndex: number
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled && !selected}
      className={cn(
        'w-full text-left rounded-lg border transition-all duration-150 overflow-hidden',
        selected
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/40'
          : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm',
        disabled && !selected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      {comp.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comp.photoUrl}
          alt={comp.heading}
          className="w-full h-36 object-cover"
        />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {comp.year} {comp.make} {comp.model}
            {comp.trim ? ` ${comp.trim}` : ''}
          </p>
          {selected && (
            <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-blue-500">
              <Check className="w-3 h-3 text-white" />
            </span>
          )}
          {selected && selectionIndex > 0 && (
            <Badge className="shrink-0 text-xs bg-blue-600 hover:bg-blue-600 text-white ml-1">
              #{selectionIndex}
            </Badge>
          )}
        </div>
        <p className="text-lg font-bold text-emerald-600">
          {formatCurrency(comp.price)}
        </p>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
          <Car className="w-3 h-3" />
          {(comp.miles ?? 0).toLocaleString()} miles
        </p>
        {comp.dealerName && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {comp.dealerName}
            {comp.dealerCity ? `, ${comp.dealerCity}` : ''}
            {comp.dealerState ? `, ${comp.dealerState}` : ''}
          </p>
        )}
        {comp.dealerPhone && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 shrink-0" />
            {comp.dealerPhone}
          </p>
        )}
      </div>
    </button>
  )
}

// ── Adjustments form ────────────────────────────────────────────────────────
function AdjustmentsForm({
  claim,
  selectedComps,
  compAdjustments,
  onCompAdjChange,
  adjustments,
  onAdjChange,
  result,
}: {
  claim: ClaimInfo
  selectedComps: MarketComp[]
  compAdjustments: { mileageAdj: number; yearAdj: number }[]
  onCompAdjChange: (index: number, field: 'mileageAdj' | 'yearAdj', value: number) => void
  adjustments: ACVAdjustments
  onAdjChange: (updated: ACVAdjustments) => void
  result: ACVResult
}) {
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-6">
      {/* Per-comp adjustments — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {selectedComps.map((comp, i) => {
          const mileageDiff = comp.miles - claim.mileage
          const yearDiff = comp.year - claim.year
          const adj = compAdjustments[i] ?? { mileageAdj: 0, yearAdj: 0 }
          const compVal = comp.price + adj.mileageAdj + adj.yearAdj

          return (
            <Card key={comp.id} className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs w-fit mb-1">Comp #{i + 1}</Badge>
                <CardTitle className="text-gray-900 text-sm">
                  {comp.year} {comp.make} {comp.model}
                  {comp.trim ? ` ${comp.trim}` : ''}
                </CardTitle>
                <p className="text-xs text-blue-600 font-bold">{formatCurrency(comp.price)}</p>
                <p className="text-xs text-gray-400 leading-snug">
                  {(comp.miles ?? 0).toLocaleString()} mi · {comp.dealerName}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className={labelCls}>Mileage Diff</label>
                  <div className={cn('px-2 py-1.5 rounded text-xs font-mono border', mileageDiff > 0 ? 'text-red-500 border-red-200 bg-red-50' : 'text-green-600 border-green-200 bg-green-50')}>
                    {mileageDiff >= 0 ? '+' : ''}{mileageDiff.toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Mileage Adj ($)</label>
                  <input type="number" className={inputCls} placeholder="0" value={adj.mileageAdj || ''} onChange={(e) => onCompAdjChange(i, 'mileageAdj', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className={labelCls}>Year Diff</label>
                  <div className={cn('px-2 py-1.5 rounded text-xs font-mono border', yearDiff > 0 ? 'text-green-600 border-green-200 bg-green-50' : yearDiff < 0 ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200 bg-gray-50')}>
                    {yearDiff >= 0 ? '+' : ''}{yearDiff}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Year Adj ($)</label>
                  <input type="number" className={inputCls} placeholder="0" value={adj.yearAdj || ''} onChange={(e) => onCompAdjChange(i, 'yearAdj', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Value</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(compVal)}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Report-level adjustments */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Report Adjustments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Vehicle History Note</label>
              <input
                className={inputCls}
                placeholder="e.g. Clean title"
                value={adjustments.vehicleHistoryNote}
                onChange={(e) =>
                  onAdjChange({ ...adjustments, vehicleHistoryNote: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Vehicle History ($)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="0"
                value={adjustments.vehicleHistory || ''}
                onChange={(e) =>
                  onAdjChange({
                    ...adjustments,
                    vehicleHistory: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Prior Damages Note</label>
              <input
                className={inputCls}
                placeholder="e.g. No prior damage"
                value={adjustments.priorDamagesNote}
                onChange={(e) =>
                  onAdjChange({ ...adjustments, priorDamagesNote: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Prior Damages ($)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="0"
                value={adjustments.priorDamages || ''}
                onChange={(e) =>
                  onAdjChange({
                    ...adjustments,
                    priorDamages: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Additions Note</label>
              <input
                className={inputCls}
                placeholder="e.g. Aftermarket rims"
                value={adjustments.additionsNote}
                onChange={(e) =>
                  onAdjChange({ ...adjustments, additionsNote: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Additions ($)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="0"
                value={adjustments.additions || ''}
                onChange={(e) =>
                  onAdjChange({
                    ...adjustments,
                    additions: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Deductions Note</label>
              <input
                className={inputCls}
                placeholder="Dealer Vs. Private ($500.00)"
                value={adjustments.deductionsNote}
                onChange={(e) =>
                  onAdjChange({ ...adjustments, deductionsNote: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Deductions ($)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="-500"
                value={adjustments.deductions || ''}
                onChange={(e) =>
                  onAdjChange({
                    ...adjustments,
                    deductions: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                placeholder="0.00"
                value={adjustments.taxRate || ''}
                onChange={(e) =>
                  onAdjChange({
                    ...adjustments,
                    taxRate: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={cn(inputCls, 'resize-none h-24')}
              value={adjustments.notes}
              onChange={(e) => onAdjChange({ ...adjustments, notes: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Live ACV Preview */}
      <Card className="bg-white border-gray-300 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Live ACV Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Comp #1 Value</span>
              <span className="tabular-nums">{formatCurrency(result.comp1Value)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Comp #2 Value</span>
              <span className="tabular-nums">{formatCurrency(result.comp2Value)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Comp #3 Value</span>
              <span className="tabular-nums">{formatCurrency(result.comp3Value)}</span>
            </div>
            <div className="flex justify-between text-gray-500 border-t border-gray-200 pt-2">
              <span>Average Value</span>
              <span className="tabular-nums">{formatCurrency(result.averageValue)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Total Adjustments</span>
              <span className={cn('tabular-nums', result.totalAdjustments < 0 ? 'text-red-500' : 'text-emerald-600')}>
                {formatCurrency(result.totalAdjustments)}
              </span>
            </div>
            {adjustments.taxRate > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax ({adjustments.taxRate}%)</span>
                <span className="tabular-nums">{formatCurrency(result.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-300 pt-2 text-base">
              <span>ACV</span>
              <span className="tabular-nums text-emerald-600">{formatCurrency(result.acv)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Review & Generate ────────────────────────────────────────────────────────
function ReviewStep({
  claim,
  selectedComps,
  adjustments,
  result,
  onBack,
  onStartOver,
  onSave,
  editId,
}: {
  claim: ClaimInfo
  selectedComps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
  onBack: () => void
  onStartOver: () => void
  onSave: () => void
  editId?: string | null
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch('/api/acv/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim, comps: selectedComps, adjustments }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ACV-${claim.maNumber || 'report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      saveToHistory(claim, selectedComps, adjustments, result, 'comp-finder', editId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Vehicle summary */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: 'VIN', value: claim.vin },
              { label: 'Vehicle', value: `${claim.year} ${claim.make} ${claim.model}` },
              { label: 'Trim', value: claim.trim || '—' },
              { label: 'Mileage', value: claim.mileage.toLocaleString() },
              { label: 'Owner', value: claim.insuredName || '—' },
              { label: 'Insurance', value: claim.insuranceCompany || '—' },
              { label: 'MA #', value: claim.maNumber || '—' },
              { label: 'Claim #', value: claim.claimNumber || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-gray-800 font-medium truncate">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comps table */}
      <Card className="bg-white border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Selected Comps</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Vehicle</th>
                <th className="text-right px-4 py-2">Asking</th>
                <th className="text-right px-4 py-2">Miles</th>
                <th className="text-right px-4 py-2">Mile Adj</th>
                <th className="text-right px-4 py-2">Year Adj</th>
                <th className="text-right px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {selectedComps.map((comp, i) => (
                <tr key={comp.id} className="border-b border-gray-100">
                  <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2.5 text-gray-800">
                    {comp.year} {comp.make} {comp.model}
                    {comp.trim ? ` ${comp.trim}` : ''}
                    <p className="text-xs text-gray-400">{comp.dealerName}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {formatCurrency(comp.price)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {(comp.miles ?? 0).toLocaleString()}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right tabular-nums',
                      comp.mileageAdjDollar < 0 ? 'text-red-500' : 'text-emerald-600'
                    )}
                  >
                    {formatCurrency(comp.mileageAdjDollar)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right tabular-nums',
                      comp.yearAdjDollar < 0 ? 'text-red-500' : 'text-emerald-600'
                    )}
                  >
                    {formatCurrency(comp.yearAdjDollar)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(comp.compValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ACV calculation */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">ACV Calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm max-w-sm">
            <div className="flex justify-between text-gray-700">
              <span>Average of 3 Comps</span>
              <span className="tabular-nums">{formatCurrency(result.averageValue)}</span>
            </div>
            {adjustments.vehicleHistory !== 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Vehicle History ({adjustments.vehicleHistoryNote})</span>
                <span className="tabular-nums">{formatCurrency(adjustments.vehicleHistory)}</span>
              </div>
            )}
            {adjustments.priorDamages !== 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Prior Damages ({adjustments.priorDamagesNote})</span>
                <span className="tabular-nums">{formatCurrency(adjustments.priorDamages)}</span>
              </div>
            )}
            {adjustments.additions !== 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Additions ({adjustments.additionsNote})</span>
                <span className="tabular-nums">{formatCurrency(adjustments.additions)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500 text-xs">
              <span>Deductions ({adjustments.deductionsNote})</span>
              <span className="tabular-nums text-red-500">
                {formatCurrency(adjustments.deductions)}
              </span>
            </div>
            <div className="flex justify-between text-gray-700 border-t border-gray-200 pt-2">
              <span>Total Adjustments</span>
              <span
                className={cn(
                  'tabular-nums',
                  result.totalAdjustments < 0 ? 'text-red-500' : 'text-emerald-600'
                )}
              >
                {formatCurrency(result.totalAdjustments)}
              </span>
            </div>
            {adjustments.taxRate > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Tax ({adjustments.taxRate}%)</span>
                <span className="tabular-nums">{formatCurrency(result.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-300 pt-2 text-base">
              <span>ACV</span>
              <span className="tabular-nums text-emerald-600">{formatCurrency(result.acv)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={onBack}
          variant="outline"
          className="border-gray-200 text-gray-700 hover:bg-gray-100"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          onClick={onSave}
          variant="outline"
          className="border-blue-200 text-blue-600 hover:bg-blue-50"
        >
          Save Claim
        </Button>
        <Button
          onClick={downloadPdf}
          disabled={downloading}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Download PDF
        </Button>
        <Button
          onClick={onStartOver}
          variant="outline"
          className="border-gray-200 text-gray-700 hover:bg-gray-100 ml-auto"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Start Over
        </Button>
      </div>
    </div>
  )
}

// ── Default empty claim ─────────────────────────────────────────────────────
function defaultClaim(): ClaimInfo {
  return {
    maNumber: '',
    claimNumber: '',
    dateOfLoss: '',
    clientType: 'Insured',
    insuredName: '',
    ownerPhone: '',
    ownerEmail: '',
    ownerAddress: '',
    insuranceCompany: '',
    adjuster: '',
    adjusterPhone: '',
    adjusterEmail: '',
    vin: '',
    year: 0,
    make: '',
    model: '',
    trim: '',
    mileage: 0,
    zip: '',
    radius: 150,
  }
}

// ── History Dashboard ────────────────────────────────────────────────────────
// ── Main page ────────────────────────────────────────────────────────────────
function CompFinderInner() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [claim, setClaim] = useState<ClaimInfo>(defaultClaim)
  const [listings, setListings] = useState<MarketComp[]>([])
  const [loadingComps, setLoadingComps] = useState(false)
  const [compsError, setCompsError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Per-comp adjustments
  const [compAdjs, setCompAdjs] = useState<{ mileageAdj: number; yearAdj: number }[]>([
    { mileageAdj: 0, yearAdj: 0 },
    { mileageAdj: 0, yearAdj: 0 },
    { mileageAdj: 0, yearAdj: 0 },
  ])
  const [adjustments, setAdjustments] = useState<ACVAdjustments>(defaultAdjustments)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    // Load claim from sessionStorage if editing
    if (searchParams.get('edit') === 'true') {
      try {
        const raw = sessionStorage.getItem('modern-tools-acv-edit')
        if (raw) {
          const entry: ACVHistoryEntry = JSON.parse(raw)
          sessionStorage.removeItem('modern-tools-acv-edit')
          setClaim(entry.claim)
          setAdjustments(entry.adjustments)
          setEditingId(entry.id)
          // Restore saved comps into listings and selections
          if (entry.comps && entry.comps.length > 0) {
            setListings(entry.comps)
            setSelectedIds(entry.comps.map(c => c.id))
            setCompAdjs(entry.comps.map(c => ({
              mileageAdj: c.mileageAdjDollar ?? 0,
              yearAdj: c.yearAdjDollar ?? 0,
            })))
          }
        }
      } catch { /* ignore */ }
    }
  }, [searchParams])

  const selectedComps = selectedIds
    .map((id) => listings.find((l) => l.id === id))
    .filter((c): c is MarketComp => !!c)

  // Build SelectedComp[] with current adj values
  const builtComps: SelectedComp[] = selectedComps.map((comp, i) => {
    const adj = compAdjs[i] ?? { mileageAdj: 0, yearAdj: 0 }
    return {
      ...comp,
      mileageDiffRaw: comp.miles - claim.mileage,
      mileageAdjDollar: adj.mileageAdj,
      yearDiffRaw: comp.year - claim.year,
      yearAdjDollar: adj.yearAdj,
      compValue: calculateCompValue({
        price: comp.price,
        mileageAdjDollar: adj.mileageAdj,
        yearAdjDollar: adj.yearAdj,
      }),
    }
  })

  const result = calculateACV(builtComps, adjustments)

  const searchComps = useCallback(async () => {
    if (!claim.year || !claim.make || !claim.model || !claim.zip) return
    setLoadingComps(true)
    setCompsError(null)
    try {
      const params = new URLSearchParams({
        year: String(claim.year),
        make: claim.make,
        model: claim.model,
        zip: claim.zip,
        radius: String(claim.radius),
        ...(claim.trim ? { trim: claim.trim } : {}),
      })
      const res = await fetch(`/api/acv/search-comps?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setListings(data.listings ?? [])
      if ((data.listings ?? []).length === 0) {
        setCompsError('No listings found. Try expanding the radius or removing the trim filter.')
      }
    } catch (err) {
      setCompsError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoadingComps(false)
    }
  }, [claim])

  useEffect(() => {
    if (step === 2) {
      searchComps()
    }
  }, [step, searchComps])

  const toggleComp = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  const updateCompAdj = (index: number, field: 'mileageAdj' | 'yearAdj', value: number) => {
    setCompAdjs((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const canProceedStep1 =
    claim.year > 0 && claim.make && claim.model && claim.mileage > 0 && claim.zip.length === 5

  const steps = ['Claim Info', 'Select Comps', 'Adjustments', 'Review & Generate']

  const handleSaveClaim = () => {
    if (builtComps.length < 3) return
    saveToHistory(claim, builtComps, adjustments, result, 'comp-finder', editingId)
    // If this was a new claim, capture the new ID so subsequent saves update it
    if (!editingId) {
      try {
        const h: ACVHistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
        if (h.length > 0) setEditingId(h[0].id)
      } catch { /* ignore */ }
    }
  }

  const startOver = () => {
    setStep(1)
    setClaim(defaultClaim())
    setListings([])
    setSelectedIds([])
    setCompAdjs([
      { mileageAdj: 0, yearAdj: 0 },
      { mileageAdj: 0, yearAdj: 0 },
      { mileageAdj: 0, yearAdj: 0 },
    ])
    setAdjustments(defaultAdjustments())
    setCompsError(null)
    setEditingId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/acv" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Comp Finder</h1>
            <p className="text-xs text-gray-500">Manual ACV · 4-step workflow</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
          {/* Step indicators */}
            <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
              {steps.map((label, i) => {
                const n = i + 1
                const active = step === n
                const done = step > n
                return (
                  <div key={n} className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setStep(n)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer hover:opacity-80',
                        active
                          ? 'bg-blue-600 text-white'
                          : done
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-gray-100 text-gray-400'
                      )}
                    >
                      {done ? <Check className="w-3 h-3" /> : <span>{n}</span>}
                      {label}
                    </button>
                    {i < steps.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Step 1: Claim Info */}
            {step === 1 && (
              <div>
                <Card className="bg-white border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900">Claim Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ClaimInfoForm claim={claim} onChange={setClaim} />
                  </CardContent>
                </Card>
                <div className="flex justify-end mt-6">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Next: Select Comps
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Search & Select */}
            {step === 2 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Select 3 Comps</h2>
                    <p className="text-sm text-gray-500">
                      {selectedIds.length} selected / 3 needed
                      {listings.length > 0 && ` · ${listings.length} results`}
                    </p>
                  </div>
                  <Button
                    onClick={searchComps}
                    disabled={loadingComps}
                    variant="outline"
                    size="sm"
                    className="border-gray-200 text-gray-700 hover:bg-gray-100 gap-1.5"
                  >
                    {loadingComps ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Refresh
                  </Button>
                </div>

                {loadingComps && (
                  <div className="flex items-center justify-center py-16 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mr-3" />
                    Searching Marketcheck...
                  </div>
                )}

                {compsError && !loadingComps && (
                  <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm mb-4">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {compsError}
                  </div>
                )}

                {!loadingComps && listings.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {listings.map((comp) => {
                      const selIdx = selectedIds.indexOf(comp.id)
                      return (
                        <CompCard
                          key={comp.id}
                          comp={comp}
                          selected={selIdx !== -1}
                          selectionIndex={selIdx + 1}
                          onToggle={() => toggleComp(comp.id)}
                          disabled={selectedIds.length >= 3}
                        />
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center gap-3 mt-6">
                  <Button
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={selectedIds.length < 3}
                    className="bg-blue-600 hover:bg-blue-500 text-white ml-auto"
                  >
                    Next: Adjustments
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Adjustments */}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Adjustments</h2>
                <AdjustmentsForm
                  claim={claim}
                  selectedComps={selectedComps}
                  compAdjustments={compAdjs}
                  onCompAdjChange={updateCompAdj}
                  adjustments={adjustments}
                  onAdjChange={setAdjustments}
                  result={result}
                />
                <div className="flex items-center gap-3 mt-6">
                  <Button
                    onClick={() => setStep(2)}
                    variant="outline"
                    className="border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handleSaveClaim}
                    variant="outline"
                    className="border-blue-200 text-blue-600 hover:bg-blue-50 ml-auto"
                  >
                    Save Claim
                  </Button>
                  <Button
                    onClick={() => setStep(4)}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Next: Review & Generate
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Review & Generate */}
            {step === 4 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Generate</h2>
                <ReviewStep
                  claim={claim}
                  selectedComps={builtComps}
                  adjustments={adjustments}
                  result={result}
                  onBack={() => setStep(3)}
                  onStartOver={startOver}
                  onSave={handleSaveClaim}
                  editId={editingId}
                />
              </div>
            )}
      </main>
    </div>
  )
}

export default function CompFinderPage() {
  return (
    <Suspense>
      <CompFinderInner />
    </Suspense>
  )
}
