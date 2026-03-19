"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  Upload,
  CheckCircle2,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ClaimInfo, MarketComp, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import { parseClaimPDF } from '@/lib/parse-claim-pdf'
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

// ── Currency input: raw number while typing, formatted on blur ───────────────
function CurrencyInput({
  value,
  onChange,
  placeholder = '0',
  className,
}: {
  value: number
  onChange: (val: number) => void
  placeholder?: string
  className?: string
}) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={focused ? raw : (value ? formatCurrency(value) : '')}
      onFocus={() => {
        setFocused(true)
        setRaw(value ? String(value) : '')
      }}
      onBlur={() => {
        setFocused(false)
        onChange(parseFloat(raw) || 0)
      }}
      onChange={(e) => setRaw(e.target.value)}
    />
  )
}

// ── Claim form (NO vehicle fields — those are on step 2) ─────────────────────
function ClaimInfoForm({
  claim,
  onChange,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
}) {
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfSuccess, setPdfSuccess] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof ClaimInfo, value: string | number) =>
    onChange({ ...claim, [field]: value })

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true)
    setPdfError(null)
    setPdfSuccess(false)
    try {
      const data = await parseClaimPDF(file)
      onChange({
        ...claim,
        maNumber: data.maNumber || claim.maNumber,
        claimNumber: data.claimNumber || claim.claimNumber,
        dateOfLoss: data.dateOfLoss || claim.dateOfLoss,
        clientType: data.clientType || claim.clientType,
        clientName: data.clientName || claim.clientName,
        insuredName: data.insuredName || claim.insuredName,
        ownerPhone: data.ownerPhone || claim.ownerPhone,
        ownerEmail: data.ownerEmail || claim.ownerEmail,
        ownerAddress: data.ownerAddress || claim.ownerAddress,
        insuranceCompany: data.insuranceCompany || claim.insuranceCompany,
        adjuster: data.adjuster || claim.adjuster,
        adjusterPhone: data.adjusterPhone || claim.adjusterPhone,
        adjusterEmail: data.adjusterEmail || claim.adjusterEmail,
        vin: data.vin || claim.vin,
        year: data.year || claim.year,
        make: data.make || claim.make,
        model: data.model || claim.model,
        mileage: data.mileage || claim.mileage,
        zip: data.zip || claim.zip,
      })
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3000)
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF parse failed')
    } finally {
      setPdfUploading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

  return (
    <div className="space-y-8">
      {/* PDF Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePdfUpload(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-2 border-dashed ${pdfSuccess ? 'border-emerald-500 text-emerald-600' : ''}`}
          disabled={pdfUploading}
          onClick={() => pdfInputRef.current?.click()}
        >
          {pdfUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : pdfSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {pdfUploading ? 'Parsing...' : pdfSuccess ? 'Filled!' : 'Upload Claim PDF'}
        </Button>
        <span className="text-xs text-gray-400">Auto-fill from a claim assignment PDF</span>
        {pdfError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {pdfError}
          </p>
        )}
      </div>

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
  onVinDecoded,
  loading,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  onSearch: () => void
  onVinDecoded?: (updatedClaim: ClaimInfo) => void
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
      const updated = {
        ...claim,
        year: data.year ?? claim.year,
        make: data.make ?? claim.make,
        model: data.model ?? claim.model,
        trim: data.trim ?? claim.trim,
        engine: data.engine ?? claim.engine,
        drivetrain: data.drivetrain ?? claim.drivetrain,
        transmission: data.transmission ?? claim.transmission,
      }
      onChange(updated)
      onVinDecoded?.(updated)
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
          {(comp.distanceMi > 0 || comp.dealerCity) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[
                comp.dealerCity ? `${comp.dealerCity}, ${comp.dealerState}` : '',
                comp.distanceMi > 0 ? `${comp.distanceMi} mi` : '',
              ].filter(Boolean).join(' · ')}
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
            <div className="w-40">
              <CurrencyInput
                className={`${inputCls} text-right`}
                placeholder="0.05"
                value={mileageRate}
                onChange={(val) => onMileageRateChange(val)}
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
                  <CurrencyInput className={inputCls} value={adj.mileageAdj} onChange={(val) => onCompAdjChange(i, 'mileageAdj', val)} />
                </div>
                <div>
                  <label className={labelCls}>Year Diff</label>
                  <div className={cn('px-2 py-1.5 rounded text-xs font-mono border', yearDiff > 0 ? 'text-green-600 border-green-200 bg-green-50' : yearDiff < 0 ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200 bg-gray-50')}>
                    {yearDiff >= 0 ? '+' : ''}{yearDiff}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Year Adj ($)</label>
                  <CurrencyInput className={inputCls} value={adj.yearAdj} onChange={(val) => onCompAdjChange(i, 'yearAdj', val)} />
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
                <div className="w-36 shrink-0">
                  <CurrencyInput
                    className={`${inputCls} text-right`}
                    value={adjustments[row.valKey]}
                    onChange={(val) => onAdjChange({ ...adjustments, [row.valKey]: val })}
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
  onNext,
  editId,
}: {
  claim: ClaimInfo
  selectedComps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
  onBack: () => void
  onStartOver: () => void
  onSave: () => void
  onNext?: () => void
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
      a.download = `${claim.maNumber || 'report'}-acv.pdf`
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
        <Button onClick={onStartOver} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
          <RotateCcw className="w-4 h-4 mr-1" />
          Start Over
        </Button>
        <Button onClick={onSave} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50">
          Save Claim
        </Button>
        <div className="flex items-center gap-3 ml-auto">
          <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download PDF
          </Button>
          {onNext && (
            <Button onClick={onNext} className="bg-blue-600 hover:bg-blue-500 text-white">
              Next: Reports
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reports step ────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'award-agreement',
    name: 'Award Agreement',
    description: 'Award letter with ACV amount for signatures',
  },
  {
    id: 'closing-notes',
    name: 'Closing Notes',
    description: 'Appraisers notes with closing verbiage',
  },
]

type NotesType = 'acv' | 'dv' | 'acv-umpire' | 'dv-umpire'

function buildNotesComments(
  type: NotesType,
  maValue: string,
  appraiserName: string,
  appraiserCompany: string,
  appraiserValue: string,
  appraiserTitle: string,
  appraiserLastName: string,
  agreementAmount: string,
  umpireName: string,
  umpireAmount: string,
): string {
  let text = ''

  if (type === 'acv' || type === 'acv-umpire') {
    text += `We established a market value on insureds vehicle using three comparable vehicles, with adjustments made for mileage, condition, and options. Our appraised value was ${maValue} not including sales tax or any other costs.\n\n`
  } else {
    text += `We established a diminished value on insureds vehicle using our designated DV formula. Our appraised DV was ${maValue} not including sales tax or any other costs.\n\n`
  }

  text += `The insured's hired appraiser, ${appraiserName} with ${appraiserCompany}, prepared an evaluation in the amount of ${appraiserValue}.\n\n`

  if (type === 'acv' || type === 'dv') {
    text += `Our negotiations with ${appraiserTitle} ${appraiserLastName} led to an award amount of ${agreementAmount} not including sales tax or any other costs.\n\n`
    text += 'Mutually signed award letter attached.\n\n'
  } else {
    text += `${appraiserTitle} ${appraiserLastName} and I couldn't agree on a value in our negotiations. ${umpireName} was selected as the Umpire and ruled in the amount of ${umpireAmount}.\n\n`
    text += 'Signed award letter attached.\n\n'
  }

  text += 'If you have any questions pertaining to this assignment, please feel free to contact me directly.'

  return text
}

function getDropdownValue(type: NotesType): string {
  if (type === 'acv' || type === 'acv-umpire') return 'Appraisal Clause Assignment – ACV '
  return 'Diminished Value Assignment – DV'
}

function ReportsStep({
  claim,
  result,
  onBack,
}: {
  claim: ClaimInfo
  result: ACVResult
  onBack: () => void
}) {
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Closing Notes form state
  const [notesType, setNotesType] = useState<NotesType>('acv')
  const [notesData, setNotesData] = useState(() => ({
    maValueNum: 0,
    appraiserName: '',
    appraiserCompany: '',
    appraiserValueNum: 0,
    appraiserTitle: 'Mr.',
    appraiserLastName: '',
    agreementAmountNum: 0,
    umpireName: '',
    umpireAmountNum: 0,
  }))

  const setNotes = (field: string, value: string | number) =>
    setNotesData(prev => ({ ...prev, [field]: value }))

  // Sync Award Appraiser 2 → Closing Notes opposing appraiser
  useEffect(() => {
    const block = awardData.signatureBlock2.trim()
    if (!block) return
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    const name = lines[0] || ''
    const company = lines[1] || ''
    const lastNameParts = name.split(/\s+/)
    const lastName = lastNameParts.length > 1 ? lastNameParts[lastNameParts.length - 1] : name
    setNotesData(prev => ({
      ...prev,
      appraiserName: name,
      appraiserCompany: company,
      appraiserLastName: lastName,
    }))
  }, [awardData.signatureBlock2])

  const maValueForNotes = (notesType === 'acv' || notesType === 'acv-umpire')
    ? (result.acv || notesData.maValueNum)
    : notesData.maValueNum

  const notesPreview = buildNotesComments(
    notesType,
    maValueForNotes ? formatCurrency(maValueForNotes) : '$0.00',
    notesData.appraiserName || '[Appraiser Name]',
    notesData.appraiserCompany || '[Company]',
    notesData.appraiserValueNum ? formatCurrency(notesData.appraiserValueNum) : '$0.00',
    notesData.appraiserTitle || 'Mr.',
    notesData.appraiserLastName || '[Last Name]',
    notesData.agreementAmountNum ? formatCurrency(notesData.agreementAmountNum) : '$0.00',
    notesData.umpireName || '[Umpire Name]',
    notesData.umpireAmountNum ? formatCurrency(notesData.umpireAmountNum) : '$0.00',
  )

  const downloadNotesPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const maValue = maValueForNotes ? formatCurrency(maValueForNotes) : '$0.00'
      const comments = buildNotesComments(
        notesType,
        maValue,
        notesData.appraiserName,
        notesData.appraiserCompany,
        notesData.appraiserValueNum ? formatCurrency(notesData.appraiserValueNum) : '$0.00',
        notesData.appraiserTitle,
        notesData.appraiserLastName,
        notesData.agreementAmountNum ? formatCurrency(notesData.agreementAmountNum) : '$0.00',
        notesData.umpireName,
        notesData.umpireAmountNum ? formatCurrency(notesData.umpireAmountNum) : '$0.00',
      )
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/acv/generate-notes-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          fileNumber: claim.maNumber,
          claimNumber: claim.claimNumber,
          insuranceCompany: claim.insuranceCompany,
          vehicleOwner: claim.insuredName,
          vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
          dateOfLoss: claim.dateOfLoss,
          comments,
          dropdownValue: getDropdownValue(notesType),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${claim.maNumber || 'report'}-notes.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  // Award form state — auto-filled from claim
  const [awardData, setAwardData] = useState(() => ({
    insuranceCompany: claim.insuranceCompany || '',
    vehicleOwner: claim.insuredName || '',
    vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
    dateOfLoss: claim.dateOfLoss || '',
    claimDate: new Date().toISOString().split('T')[0],
    claimNumber: claim.claimNumber || '',
    acvAmountNum: 0,
    signatureDate1: new Date().toISOString().split('T')[0],
    signatureDate2: '',
    signatureBlock1: 'Henry Aleksanyan\nModern Appraisers',
    signatureBlock2: '',
  }))

  const setAward = (field: string, value: string) =>
    setAwardData(prev => ({ ...prev, [field]: value }))

  const downloadAwardPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const payload = {
        ...awardData,
        acvAmount: awardData.acvAmountNum ? formatCurrency(awardData.acvAmountNum) : '',
      }
      const res = await fetch('/api/acv/generate-award-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${claim.maNumber || 'report'}-award.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  // Report selection view
  if (!selectedReport) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TYPES.map((report) => (
            <Card
              key={report.id}
              className="bg-white border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setSelectedReport(report.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{report.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Review
          </Button>
        </div>
      </div>
    )
  }

  // Award Agreement form
  if (selectedReport === 'award-agreement') {
    return (
      <div className="space-y-6">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900">Award Agreement</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setSelectedReport(null)}
              >
                <X className="w-4 h-4 mr-1" />
                Back to Reports
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Insurance Company</label>
                <input
                  className={inputCls}
                  value={awardData.insuranceCompany}
                  onChange={(e) => setAward('insuranceCompany', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Vehicle Owner</label>
                <input
                  className={inputCls}
                  value={awardData.vehicleOwner}
                  onChange={(e) => setAward('vehicleOwner', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Vehicle</label>
                <input
                  className={inputCls}
                  value={awardData.vehicle}
                  onChange={(e) => setAward('vehicle', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Claim Number</label>
                <input
                  className={inputCls}
                  value={awardData.claimNumber}
                  onChange={(e) => setAward('claimNumber', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Date of Loss</label>
                <input
                  type="date"
                  className={inputCls}
                  value={awardData.dateOfLoss}
                  onChange={(e) => setAward('dateOfLoss', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={awardData.claimDate}
                  onChange={(e) => setAward('claimDate', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Actual Cash Value (ACV)</label>
                <CurrencyInput
                  className={inputCls}
                  placeholder="$0.00"
                  value={awardData.acvAmountNum}
                  onChange={(val) => setAwardData(prev => ({ ...prev, acvAmountNum: val }))}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Appraisers</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Appraiser 1</label>
                  <textarea
                    className={inputCls}
                    rows={2}
                    placeholder="Name / Company"
                    value={awardData.signatureBlock1}
                    onChange={(e) => setAward('signatureBlock1', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Appraiser 2</label>
                  <textarea
                    className={inputCls}
                    rows={2}
                    placeholder="Name / Company"
                    value={awardData.signatureBlock2}
                    onChange={(e) => setAward('signatureBlock2', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={awardData.signatureDate1}
                    onChange={(e) => setAward('signatureDate1', e.target.value)}
                  />
                </div>
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
          <Button onClick={() => setSelectedReport(null)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button onClick={downloadAwardPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download Award PDF
          </Button>
        </div>
      </div>
    )
  }

  // Closing Notes form
  if (selectedReport === 'closing-notes') {
    const isUmpire = notesType === 'acv-umpire' || notesType === 'dv-umpire'

    return (
      <div className="space-y-6">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900">Closing Notes</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setSelectedReport(null)}
              >
                <X className="w-4 h-4 mr-1" />
                Back to Reports
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type selector */}
            <div>
              <label className={labelCls}>Assignment Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {([
                  ['acv', 'ACV'],
                  ['dv', 'DV'],
                  ['acv-umpire', 'ACV → Umpire'],
                  ['dv-umpire', 'DV → Umpire'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setNotesType(value)}
                    className={cn(
                      'px-3 py-2 text-sm font-semibold rounded-lg border transition-all',
                      notesType === value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Our Value */}
            <div className="border-t border-gray-100 pt-4">
              <div className="w-64">
                <label className={labelCls}>
                  {notesType === 'acv' || notesType === 'acv-umpire' ? 'Our Appraised Value (ACV)' : 'Our Appraised DV'}
                </label>
                {(notesType === 'acv' || notesType === 'acv-umpire') && result.acv > 0 ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 font-medium">
                    {formatCurrency(result.acv)}
                    <span className="text-xs text-gray-400 ml-2">(from report)</span>
                  </div>
                ) : (
                  <CurrencyInput
                    className={inputCls}
                    value={notesData.maValueNum}
                    onChange={(val) => setNotes('maValueNum', val)}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Opposing Appraiser</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input
                    className={inputCls}
                    placeholder="John Smith"
                    value={notesData.appraiserName}
                    onChange={(e) => setNotes('appraiserName', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Company</label>
                  <input
                    className={inputCls}
                    placeholder="National Appraisers"
                    value={notesData.appraiserCompany}
                    onChange={(e) => setNotes('appraiserCompany', e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-24">
                    <label className={labelCls}>Title</label>
                    <select
                      className={inputCls}
                      value={notesData.appraiserTitle}
                      onChange={(e) => setNotes('appraiserTitle', e.target.value)}
                    >
                      <option value="Mr.">Mr.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Mrs.">Mrs.</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Last Name</label>
                    <input
                      className={inputCls}
                      placeholder="Smith"
                      value={notesData.appraiserLastName}
                      onChange={(e) => setNotes('appraiserLastName', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Their Appraised Value</label>
                  <CurrencyInput
                    className={inputCls}
                    value={notesData.appraiserValueNum}
                    onChange={(val) => setNotes('appraiserValueNum', val)}
                  />
                </div>
              </div>
            </div>

            {/* Agreement or Umpire fields */}
            <div className="border-t border-gray-100 pt-4">
              {!isUmpire ? (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Agreement</h4>
                  <div className="w-64">
                    <label className={labelCls}>Award Amount</label>
                    <CurrencyInput
                      className={inputCls}
                      value={notesData.agreementAmountNum}
                      onChange={(val) => setNotes('agreementAmountNum', val)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Umpire</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Umpire Name</label>
                      <input
                        className={inputCls}
                        placeholder="Darren DiMaria"
                        value={notesData.umpireName}
                        onChange={(e) => setNotes('umpireName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Umpire Ruling Amount</label>
                      <CurrencyInput
                        className={inputCls}
                        value={notesData.umpireAmountNum}
                        onChange={(val) => setNotes('umpireAmountNum', val)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Preview</h4>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {notesPreview}
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
          <Button onClick={() => setSelectedReport(null)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button onClick={downloadNotesPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download Closing Notes
          </Button>
        </div>
      </div>
    )
  }

  return null
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
  const [activeFilters, setActiveFilters] = useState<{ trim: string[]; drivetrain: string[]; transmission: string[]; engine: string[] }>({ trim: [], drivetrain: [], transmission: [], engine: [] })

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
    const filtered = listings.filter((comp) => {
      if (activeFilters.trim.length > 0 && !activeFilters.trim.includes(comp.trim || '')) return false
      if (activeFilters.drivetrain.length > 0 && !activeFilters.drivetrain.includes(comp.drivetrain || '')) return false
      if (activeFilters.transmission.length > 0 && !activeFilters.transmission.includes(comp.transmission || '')) return false
      if (activeFilters.engine.length > 0 && !activeFilters.engine.includes(comp.engine || '')) return false
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
  }, [listings, sortBy, claim.mileage, activeFilters])

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
        ...(claim.trim ? { trim: claim.trim } : {}),
        ...(claim.drivetrain ? { drivetrain: claim.drivetrain } : {}),
        ...(claim.transmission ? { transmission: claim.transmission } : {}),
        ...(claim.engine ? { engine: claim.engine } : {}),
      })
      const res = await fetch(`/api/acv/search-comps?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setActiveFilters({ trim: [], drivetrain: [], transmission: [], engine: [] })
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

  const steps = ['Claim Info', 'Select Comps', 'Adjustments', 'Review & Generate', 'Reports']

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

  const handleVinDecoded = (updatedClaim: ClaimInfo) => {
    const emptyResult: ACVResult = { comp1Value: 0, comp2Value: 0, comp3Value: 0, averageValue: 0, totalAdjustments: 0, taxAmount: 0, acv: 0 }
    saveToHistory(updatedClaim, [], adjustments, emptyResult, 'comp-finder', editingId)
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
              onVinDecoded={handleVinDecoded}
              loading={loadingComps}
            />

            {/* Results header */}
            {listings.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-bold text-gray-900">{sortedListings.length}</span> listings
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

                {/* Attribute filters */}
                {(['trim', 'drivetrain', 'transmission', 'engine'] as const).map((field) => {
                  const unique = [...new Set(listings.map((l) => l[field] || '').filter(Boolean))].sort()
                  if (unique.length < 2) return null
                  return (
                    <div key={field} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 shrink-0">
                        {field === 'drivetrain' ? 'Drive' : field.charAt(0).toUpperCase() + field.slice(1)}
                      </span>
                      {unique.map((val) => {
                        const active = activeFilters[field].includes(val)
                        return (
                          <button
                            key={val}
                            onClick={() =>
                              setActiveFilters((prev) => ({
                                ...prev,
                                [field]: active
                                  ? prev[field].filter((v) => v !== val)
                                  : [...prev[field], val],
                              }))
                            }
                            className={cn(
                              'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                              active
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                            )}
                          >
                            {val}
                          </button>
                        )
                      })}
                      {activeFilters[field].length > 0 && (
                        <button
                          onClick={() => setActiveFilters((prev) => ({ ...prev, [field]: [] }))}
                          className="text-[11px] text-gray-400 hover:text-gray-600 ml-1"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )
                })}
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
              onNext={() => setStep(5)}
              editId={editingId}
            />
          </div>
        )}

        {/* Step 5: Reports */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reports</h2>
            <ReportsStep
              claim={claim}
              result={result}
              onBack={() => setStep(4)}
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
