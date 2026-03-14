"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
  X,
  Plus,
  Gauge,
  ArrowUpDown,
} from 'lucide-react'
import { useRef } from 'react'
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

// ── Claim form (NO vehicle fields — those are on step 2) ─────────────────────
function ClaimInfoForm({
  claim,
  onChange,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
}) {
  const set = (field: keyof ClaimInfo, value: string | number) =>
    onChange({ ...claim, [field]: value })

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

  return (
    <div className="space-y-8">
      {/* Report Info */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Report Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>MA Number</label>
            <input className={inputCls} placeholder="MA-12345" value={claim.maNumber} onChange={(e) => set('maNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Insurance Claim #</label>
            <input className={inputCls} placeholder="CLM-00001" value={claim.claimNumber} onChange={(e) => set('claimNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Date of Loss</label>
            <input type="date" className={inputCls} value={claim.dateOfLoss} onChange={(e) => set('dateOfLoss', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Owner / Client */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Owner / Client</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Client Type</label>
            <select className={inputCls} value={claim.clientType} onChange={(e) => set('clientType', e.target.value as 'Insured' | 'Claimant')}>
              <option value="Insured">Insured</option>
              <option value="Claimant">Claimant</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Client Name</label>
            <input className={inputCls} placeholder="Sedgwick" value={claim.clientName} onChange={(e) => set('clientName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Insured / Owner Name</label>
            <input className={inputCls} placeholder="John Smith" value={claim.insuredName} onChange={(e) => set('insuredName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Email</label>
            <input className={inputCls} placeholder="owner@email.com" value={claim.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Owner Address</label>
            <input className={inputCls} placeholder="123 Main St, City, ST 00000" value={claim.ownerAddress} onChange={(e) => set('ownerAddress', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Insurance */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Insurance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Insurance Company</label>
            <input className={inputCls} placeholder="State Farm" value={claim.insuranceCompany} onChange={(e) => set('insuranceCompany', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Name</label>
            <input className={inputCls} placeholder="Jane Doe" value={claim.adjuster} onChange={(e) => set('adjuster', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.adjusterPhone} onChange={(e) => set('adjusterPhone', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Email</label>
            <input className={inputCls} placeholder="adjuster@insurer.com" value={claim.adjusterEmail} onChange={(e) => set('adjusterEmail', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Search parameters panel (shown on step 2) ──────────────────────────────
function SearchParametersPanel({
  claim,
  onChange,
  onSearch,
  loading,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  onSearch: () => void
  loading: boolean
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
        engine: data.engine ?? claim.engine,
        drivetrain: data.drivetrain ?? claim.drivetrain,
        transmission: data.transmission ?? claim.transmission,
      })
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'VIN decode failed')
    } finally {
      setDecoding(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

  const canSearch = claim.year > 0 && claim.make && claim.model && (claim.radius === 0 || claim.zip.length === 5)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Search Parameters</h3>
      </div>

      {/* VIN row */}
      <div className="mb-4">
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

      {/* Vehicle fields grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className={labelCls}>Year <span className="text-red-400">*</span></label>
          <input type="number" className={inputCls} placeholder="2020" value={claim.year || ''} onChange={(e) => set('year', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelCls}>Make <span className="text-red-400">*</span></label>
          <input className={inputCls} placeholder="Toyota" value={claim.make} onChange={(e) => set('make', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Model <span className="text-red-400">*</span></label>
          <input className={inputCls} placeholder="Camry" value={claim.model} onChange={(e) => set('model', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Trim</label>
          <input className={inputCls} placeholder="XLE" value={claim.trim} onChange={(e) => set('trim', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Mileage</label>
          <input type="number" className={inputCls} placeholder="45000" value={claim.mileage || ''} onChange={(e) => set('mileage', parseInt(e.target.value) || 0)} />
        </div>
        {claim.radius !== 0 && (
          <div>
            <label className={labelCls}>ZIP Code</label>
            <input className={inputCls} placeholder="90210" maxLength={5} value={claim.zip} onChange={(e) => set('zip', e.target.value)} />
          </div>
        )}
      </div>

      {/* Radius */}
      <div className="flex items-end gap-4 mb-5">
        <div className="w-48">
          <label className={labelCls}>Radius</label>
          <select
            className={inputCls}
            value={claim.radius}
            onChange={(e) => {
              const val = parseInt(e.target.value)
              onChange({ ...claim, radius: val, ...(val === 0 ? { zip: '' } : {}) })
            }}
          >
            <option value={25}>25 mi</option>
            <option value={50}>50 mi</option>
            <option value={100}>100 mi</option>
            <option value={200}>200 mi</option>
            <option value={500}>500 mi</option>
            <option value={0}>Nationwide</option>
          </select>
        </div>
      </div>

      {/* Search button */}
      <Button
        onClick={onSearch}
        disabled={loading || !canSearch}
        className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2 h-11 px-6"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Search className="w-4 h-4" />
        )}
        Search Comparable Vehicles
      </Button>
    </div>
  )
}

// ── Comp card (redesigned like reference) ─────────────────────────────────────
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
  const vehicle = `${comp.year || ''} ${comp.make} ${comp.model} ${comp.trim || ''}`.trim()
  const specs = [comp.engine, comp.transmission, comp.drivetrain].filter(Boolean).join(' \u00B7 ')

  return (
    <div
      className={cn(
        'relative bg-white border rounded-xl overflow-hidden transition-all duration-200',
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
          : 'border-gray-200 hover:shadow-lg hover:border-gray-300',
        disabled && !selected ? 'opacity-40 pointer-events-none' : ''
      )}
    >
      {/* Selection badge */}
      {selected && selectionIndex > 0 && (
        <div className="absolute top-3 left-3 z-10 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-lg">
          {selectionIndex}
        </div>
      )}

      {/* Image with price overlay */}
      <div className="relative h-44 bg-gray-100">
        {comp.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={comp.photoUrl} alt={vehicle} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-10 h-10 text-gray-300" />
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-10 pb-3 px-3">
          <p className="text-xl font-extrabold text-white drop-shadow-sm">
            {formatCurrency(comp.price)}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-[13px] font-extrabold text-gray-900 leading-snug tracking-tight">
          {comp.year && comp.make ? `${comp.year} ${comp.make} ${comp.model}` : comp.heading || 'Unknown Vehicle'}
        </p>
        {comp.trim && (
          <p className="text-xs font-semibold text-gray-500 mt-0.5">{comp.trim}</p>
        )}
        {specs && (
          <p className="text-[11px] text-gray-400 mt-1">{specs}</p>
        )}
        <p className="text-[10px] font-mono text-gray-400 mt-1.5 tracking-wider">
          {comp.vin || 'No VIN'}
        </p>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            {(comp.miles ?? 0).toLocaleString()} mi
          </span>
          {comp.distanceMi > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {comp.dealerCity ? `${comp.dealerCity}, ${comp.dealerState}` : `${comp.distanceMi} mi away`}
            </span>
          )}
        </div>

        {/* Dealer */}
        {comp.dealerName && !comp.distanceMi && (
          <p className="text-[11px] text-gray-400 mt-2 truncate">
            {comp.dealerName}
            {comp.dealerCity ? ` \u00B7 ${comp.dealerCity}, ${comp.dealerState}` : ''}
          </p>
        )}
        {comp.dealerName && comp.distanceMi > 0 && (
          <p className="text-[11px] text-gray-400 mt-1 truncate">{comp.dealerName}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={onToggle}
          disabled={disabled && !selected}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg transition-all',
            selected
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {selected ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Selected
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Select
            </>
          )}
        </button>
        <a
          href={comp.vdpUrl || `https://www.google.com/search?q=${encodeURIComponent(comp.vin as string)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-4 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
        >
          View
        </a>
      </div>
    </div>
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
  mileageRate,
  onMileageRateChange,
}: {
  claim: ClaimInfo
  selectedComps: MarketComp[]
  compAdjustments: { mileageAdj: number; yearAdj: number }[]
  onCompAdjChange: (index: number, field: 'mileageAdj' | 'yearAdj', value: number) => void
  adjustments: ACVAdjustments
  onAdjChange: (updated: ACVAdjustments) => void
  result: ACVResult
  mileageRate: number
  onMileageRateChange: (rate: number) => void
}) {
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

  return (
    <div className="space-y-6">
      {/* Mileage rate input */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Mileage Adjustment Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="relative w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                className={`${inputCls} pl-7 text-right`}
                placeholder="0.05"
                value={mileageRate || ''}
                onChange={(e) => onMileageRateChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <span className="text-xs text-gray-500">per mile</span>
            <p className="text-xs text-gray-400 ml-auto">
              Automatically calculates mileage adjustments for each comp
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Per-comp adjustments */}
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
          <div className="space-y-3">
            {[
              { label: 'Vehicle History', noteKey: 'vehicleHistoryNote' as const, valKey: 'vehicleHistory' as const, placeholder: 'e.g. Clean title' },
              { label: 'Prior Damages', noteKey: 'priorDamagesNote' as const, valKey: 'priorDamages' as const, placeholder: 'e.g. No prior damage' },
              { label: 'Additions', noteKey: 'additionsNote' as const, valKey: 'additions' as const, placeholder: 'e.g. Aftermarket rims' },
              { label: 'Deductions', noteKey: 'deductionsNote' as const, valKey: 'deductions' as const, placeholder: 'Dealer Vs. Private ($500.00)' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{row.label}</span>
                <input
                  className={`${inputCls} flex-1`}
                  placeholder={row.placeholder}
                  value={adjustments[row.noteKey]}
                  onChange={(e) => onAdjChange({ ...adjustments, [row.noteKey]: e.target.value })}
                />
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    className={`${inputCls} pl-7 text-right`}
                    placeholder="0"
                    value={adjustments[row.valKey] || ''}
                    onChange={(e) =>
                      onAdjChange({ ...adjustments, [row.valKey]: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-gray-500">Tax Rate</span>
              <div className="flex-1" />
              <div className="relative w-28 shrink-0">
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} text-right`}
                  placeholder="0.00"
                  value={adjustments.taxRate || ''}
                  onChange={(e) =>
                    onAdjChange({ ...adjustments, taxRate: parseFloat(e.target.value) || 0 })
                  }
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={cn(inputCls, 'resize-none h-24')} value={adjustments.notes} onChange={(e) => onAdjChange({ ...adjustments, notes: e.target.value })} />
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
              { label: 'Trim', value: claim.trim || '--' },
              { label: 'Mileage', value: claim.mileage.toLocaleString() },
              { label: 'Owner', value: claim.insuredName || '--' },
              { label: 'Insurance', value: claim.insuranceCompany || '--' },
              { label: 'MA #', value: claim.maNumber || '--' },
              { label: 'Claim #', value: claim.claimNumber || '--' },
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
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', comp.mileageAdjDollar < 0 ? 'text-red-500' : 'text-emerald-600')}>
                    {formatCurrency(comp.mileageAdjDollar)}
                  </td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', comp.yearAdjDollar < 0 ? 'text-red-500' : 'text-emerald-600')}>
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
              <span className="tabular-nums text-red-500">{formatCurrency(adjustments.deductions)}</span>
            </div>
            <div className="flex justify-between text-gray-700 border-t border-gray-200 pt-2">
              <span>Total Adjustments</span>
              <span className={cn('tabular-nums', result.totalAdjustments < 0 ? 'text-red-500' : 'text-emerald-600')}>
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
        <Button onClick={onBack} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button onClick={onSave} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50">
          Save Claim
        </Button>
        <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
          {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Download PDF
        </Button>
        <Button onClick={onStartOver} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100 ml-auto">
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
    clientName: '',
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
    engine: '',
    drivetrain: '',
    transmission: '',
    mileage: 0,
    zip: '',
    radius: 200,
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
const COMP_FINDER_SESSION_KEY = 'modern-tools-comp-finder-draft'

function getCompFinderDraft(): { step: number; claim: ClaimInfo; listings: MarketComp[]; selectedIds: string[]; compAdjs: { mileageAdj: number; yearAdj: number }[]; adjustments: ACVAdjustments; editingId: string | null } | null {
  try {
    const raw = sessionStorage.getItem(COMP_FINDER_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function CompFinderInner() {
  const searchParams = useSearchParams()
  const draft = useRef(getCompFinderDraft())
  const [step, setStep] = useState(() => draft.current?.step ?? 1)
  const [claim, setClaim] = useState<ClaimInfo>(() => draft.current?.claim ?? defaultClaim())
  const [listings, setListings] = useState<MarketComp[]>(() => draft.current?.listings ?? [])
  const [loadingComps, setLoadingComps] = useState(false)
  const [compsError, setCompsError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => draft.current?.selectedIds ?? [])
  const [compAdjs, setCompAdjs] = useState<{ mileageAdj: number; yearAdj: number }[]>(
    () => draft.current?.compAdjs ?? [
      { mileageAdj: 0, yearAdj: 0 },
      { mileageAdj: 0, yearAdj: 0 },
      { mileageAdj: 0, yearAdj: 0 },
    ]
  )
  const [adjustments, setAdjustments] = useState<ACVAdjustments>(
    () => draft.current?.adjustments ?? defaultAdjustments()
  )
  const [editingId, setEditingId] = useState<string | null>(() => draft.current?.editingId ?? null)
  const [mileageRate, setMileageRate] = useState(0)
  const [sortBy, setSortBy] = useState<'default' | 'mileage-closest' | 'mileage-low' | 'mileage-high' | 'price-low' | 'price-high' | 'year-new' | 'year-old' | 'distance'>('default')

  // Handle edit mode (from history)
  useEffect(() => {
    if (searchParams.get('edit') !== 'true') return
    try {
      const raw = sessionStorage.getItem('modern-tools-acv-edit')
      if (raw) {
        const entry: ACVHistoryEntry = JSON.parse(raw)
        sessionStorage.removeItem('modern-tools-acv-edit')
        sessionStorage.removeItem(COMP_FINDER_SESSION_KEY)
        setClaim(entry.claim)
        setAdjustments(entry.adjustments)
        setEditingId(entry.id)
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
  }, [searchParams])

  // Persist form state
  useEffect(() => {
    try {
      sessionStorage.setItem(COMP_FINDER_SESSION_KEY, JSON.stringify({
        step, claim, listings, selectedIds, compAdjs, adjustments, editingId,
      }))
    } catch { /* ignore */ }
  }, [step, claim, listings, selectedIds, compAdjs, adjustments, editingId])

  const sortedListings = useMemo(() => {
    const matches = (compVal: string, claimVal: string) => {
      const a = compVal.toLowerCase().trim()
      const b = claimVal.toLowerCase().trim()
      return a === b || a.includes(b) || b.includes(a)
    }
    const filtered = listings.filter((comp) => {
      if (claim.trim && comp.trim && !matches(comp.trim, claim.trim)) return false
      if (claim.drivetrain && comp.drivetrain && !matches(comp.drivetrain, claim.drivetrain)) return false
      if (claim.transmission && comp.transmission && !matches(comp.transmission, claim.transmission)) return false
      if (claim.engine && comp.engine && !matches(comp.engine, claim.engine)) return false
      return true
    })
    const sorted = [...filtered]
    switch (sortBy) {
      case 'mileage-closest':
        sorted.sort((a, b) => Math.abs(a.miles - claim.mileage) - Math.abs(b.miles - claim.mileage))
        break
      case 'mileage-low':
        sorted.sort((a, b) => a.miles - b.miles)
        break
      case 'mileage-high':
        sorted.sort((a, b) => b.miles - a.miles)
        break
      case 'price-low':
        sorted.sort((a, b) => a.price - b.price)
        break
      case 'price-high':
        sorted.sort((a, b) => b.price - a.price)
        break
      case 'year-new':
        sorted.sort((a, b) => b.year - a.year)
        break
      case 'year-old':
        sorted.sort((a, b) => a.year - b.year)
        break
      case 'distance':
        sorted.sort((a, b) => a.distanceMi - b.distanceMi)
        break
    }
    return sorted
  }, [listings, sortBy, claim.mileage, claim.trim, claim.drivetrain, claim.transmission, claim.engine])

  const selectedComps = selectedIds
    .map((id) => listings.find((l) => l.id === id))
    .filter((c): c is MarketComp => !!c)

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
    if (!claim.year || !claim.make || !claim.model || (claim.radius !== 0 && !claim.zip)) return
    setLoadingComps(true)
    setCompsError(null)
    try {
      const isNationwide = claim.radius === 0
      const params = new URLSearchParams({
        year: String(claim.year),
        make: claim.make,
        model: claim.model,
        radius: String(claim.radius),
        ...(isNationwide ? { nationwide: 'true' } : { zip: claim.zip }),
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

  const handleMileageRateChange = (rate: number) => {
    setMileageRate(rate)
    if (rate === 0) return
    setCompAdjs((prev) => {
      return selectedComps.map((comp, i) => {
        const mileageDiff = comp.miles - claim.mileage
        // Positive diff (comp has more miles) = positive adjustment, negative diff = negative adjustment
        const mileageAdj = Math.round(mileageDiff * rate * 100) / 100
        return { ...prev[i], mileageAdj }
      })
    })
  }

  const canProceedStep1 = claim.maNumber.length > 0 || claim.insuredName.length > 0

  const steps = ['Claim Info', 'Select Comps', 'Adjustments', 'Review & Generate']

  const handleSaveClaim = () => {
    if (builtComps.length < 3) return
    saveToHistory(claim, builtComps, adjustments, result, 'comp-finder', editingId)
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
    sessionStorage.removeItem(COMP_FINDER_SESSION_KEY)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-white">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/acv" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Comp Finder</h1>
        </div>
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

        {/* Step 1: Claim Info (no vehicle fields) */}
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
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Next: Select Comps
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Search & Select Comps */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Search parameters panel */}
            <SearchParametersPanel
              claim={claim}
              onChange={setClaim}
              onSearch={searchComps}
              loading={loadingComps}
            />

            {/* Results header */}
            {listings.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-bold text-gray-900">{listings.length}</span> listings
                  </p>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className={cn(
                          'w-2.5 h-2.5 rounded-full transition-colors',
                          selectedIds.length >= n ? 'bg-blue-500' : 'bg-gray-200'
                        )}
                      />
                    ))}
                    <span className="text-sm font-bold text-gray-700 ml-1">
                      {selectedIds.length}/3 selected
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                  {([
                    ['default', 'Default'],
                    ['mileage-closest', 'Mileage (Closest)'],
                    ['mileage-low', 'Mileage (Low)'],
                    ['mileage-high', 'Mileage (High)'],
                    ['price-low', 'Price (Low)'],
                    ['price-high', 'Price (High)'],
                    ['year-new', 'Year (Newest)'],
                    ['year-old', 'Year (Oldest)'],
                    ['distance', 'Distance'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setSortBy(value)}
                      className={cn(
                        'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                        sortBy === value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingComps && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                <p className="text-sm font-medium text-gray-400">Searching comparables...</p>
              </div>
            )}

            {compsError && !loadingComps && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {compsError}
              </div>
            )}

            {!loadingComps && sortedListings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {sortedListings.map((comp) => {
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

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg font-semibold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={selectedIds.length < 3}
                className="bg-blue-600 hover:bg-blue-500 text-white ml-auto rounded-lg font-bold"
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
              mileageRate={mileageRate}
              onMileageRateChange={handleMileageRateChange}
            />
            <div className="flex items-center gap-3 mt-6">
              <Button onClick={() => setStep(2)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleSaveClaim} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 ml-auto">
                Save Claim
              </Button>
              <Button onClick={() => setStep(4)} className="bg-blue-600 hover:bg-blue-500 text-white">
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
