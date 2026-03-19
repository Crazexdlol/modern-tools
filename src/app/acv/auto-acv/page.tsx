"use client"

import { useState, useEffect, useRef } from 'react'
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
  AlertCircle,
  Car,
  MapPin,
  Phone,
  CheckCircle2,
  Circle,
  Upload,
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
  getMileageRate,
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

// ── Claim form ───────────────────────────────────────────────────────────────
function ClaimInfoForm({
  claim,
  onChange,
  onVinDecoded,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  onVinDecoded?: (updatedClaim: ClaimInfo) => void
}) {
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
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
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-6">
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
          className={cn(
            'gap-2 border-dashed',
            pdfSuccess && 'border-emerald-500 text-emerald-600'
          )}
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
            <label className={labelCls}>Client Name</label>
            <input
              className={inputCls}
              placeholder="Sedgwick"
              value={claim.clientName}
              onChange={(e) => set('clientName', e.target.value)}
            />
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
            <label className={labelCls}>Engine</label>
            <input
              className={inputCls}
              placeholder="2.5L I4"
              value={claim.engine}
              onChange={(e) => set('engine', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Drivetrain</label>
            <input
              className={inputCls}
              placeholder="FWD"
              value={claim.drivetrain}
              onChange={(e) => set('drivetrain', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Transmission</label>
            <input
              className={inputCls}
              placeholder="Automatic"
              value={claim.transmission}
              onChange={(e) => set('transmission', e.target.value)}
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
            <label className={labelCls}>Search Radius</label>
            <select
              className={inputCls}
              value={claim.radius}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                onChange({ ...claim, radius: val, ...(val === 0 ? { zip: '' } : {}) })
              }}
            >
              <option value={25}>25 miles</option>
              <option value={50}>50 miles</option>
              <option value={100}>100 miles</option>
              <option value={200}>200 miles</option>
              <option value={500}>500 miles</option>
              <option value={0}>Nationwide</option>
            </select>
          </div>
          {claim.radius !== 0 && (
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
          )}
        </div>
      </div>
    </div>
  )
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

// ── Adjustments (report-level only) ─────────────────────────────────────────
function ReportAdjustmentsForm({
  adjustments,
  onChange,
}: {
  adjustments: ACVAdjustments
  onChange: (updated: ACVAdjustments) => void
}) {
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  const rows = [
    { label: 'Vehicle History', noteKey: 'vehicleHistoryNote' as const, valKey: 'vehicleHistory' as const, placeholder: 'e.g. Clean title' },
    { label: 'Prior Damages', noteKey: 'priorDamagesNote' as const, valKey: 'priorDamages' as const, placeholder: 'e.g. No prior damage' },
    { label: 'Additions', noteKey: 'additionsNote' as const, valKey: 'additions' as const, placeholder: 'e.g. Aftermarket rims' },
    { label: 'Deductions', noteKey: 'deductionsNote' as const, valKey: 'deductions' as const, placeholder: 'Dealer Vs. Private ($500.00)' },
  ]

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{row.label}</span>
          <input
            className={`${inputCls} flex-1`}
            placeholder={row.placeholder}
            value={adjustments[row.noteKey]}
            onChange={(e) => onChange({ ...adjustments, [row.noteKey]: e.target.value })}
          />
          <div className="w-36 shrink-0">
            <CurrencyInput
              className={`${inputCls} text-right`}
              value={adjustments[row.valKey]}
              onChange={(val) => onChange({ ...adjustments, [row.valKey]: val })}
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
              onChange({ ...adjustments, taxRate: parseFloat(e.target.value) || 0 })
            }
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
        </div>
      </div>
    </div>
  )
}

// ── Status step indicator ────────────────────────────────────────────────────
type ProcessStatus = 'pending' | 'running' | 'done' | 'error'

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string
  status: ProcessStatus
  detail?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">
        {status === 'done' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
        {status === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
        {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
        {status === 'pending' && <Circle className="w-4 h-4 text-gray-300" />}
      </div>
      <div>
        <p
          className={cn(
            'text-sm font-medium',
            status === 'done'
              ? 'text-gray-800'
              : status === 'running'
              ? 'text-gray-900'
              : status === 'error'
              ? 'text-red-500'
              : 'text-gray-400'
          )}
        >
          {label}
        </p>
        {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
      </div>
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
      a.download = `${claim.maNumber || 'report'}-acv.pdf`
      a.click()
      URL.revokeObjectURL(url)
      saveToHistory(claim, selectedComps, adjustments, result, 'auto-acv', editId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
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
              { label: 'Engine', value: claim.engine || '—' },
              { label: 'Drivetrain', value: claim.drivetrain || '—' },
              { label: 'Transmission', value: claim.transmission || '—' },
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

      <Card className="bg-white border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Auto-Selected Comps</CardTitle>
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
                      comp.mileageAdjDollar < 0 ? 'text-red-500' : 'text-blue-600'
                    )}
                  >
                    {formatCurrency(comp.mileageAdjDollar)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right tabular-nums',
                      comp.yearAdjDollar < 0 ? 'text-red-500' : 'text-blue-600'
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
                  result.totalAdjustments < 0 ? 'text-red-500' : 'text-blue-600'
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
              <span className="tabular-nums text-blue-600">{formatCurrency(result.acv)}</span>
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

// ── Auto-processing step ─────────────────────────────────────────────────────
type StatusKey = 'searching' | 'expanding' | 'depreciation' | 'selecting' | 'done'

interface ProcessState {
  statuses: Record<StatusKey, ProcessStatus>
  details: Record<StatusKey, string>
  selectedComps: SelectedComp[]
  result: ACVResult | null
  finalAdjustments: ACVAdjustments | null
  error: string | null
  radiusUsed: number
  totalFound: number
}

function AutoProcessStep({
  claim,
  adjustments,
  onDone,
  onBack,
}: {
  claim: ClaimInfo
  adjustments: ACVAdjustments
  onDone: (comps: SelectedComp[], result: ACVResult, finalAdj: ACVAdjustments) => void
  onBack: () => void
}) {
  const [state, setState] = useState<ProcessState>({
    statuses: {
      searching: 'pending',
      expanding: 'pending',
      depreciation: 'pending',
      selecting: 'pending',
      done: 'pending',
    },
    details: {
      searching: '',
      expanding: '',
      depreciation: '',
      selecting: '',
      done: '',
    },
    selectedComps: [],
    result: null,
    finalAdjustments: null,
    error: null,
    radiusUsed: 300,
    totalFound: 0,
  })

  const ran = useRef(false)

  const updateStatus = (key: StatusKey, status: ProcessStatus, detail?: string) => {
    setState((prev) => ({
      ...prev,
      statuses: { ...prev.statuses, [key]: status },
      details: detail !== undefined ? { ...prev.details, [key]: detail } : prev.details,
    }))
  }

  const searchAtRadius = async (radius: number): Promise<MarketComp[]> => {
    const isNationwide = radius === 0
    const baseParams = {
      year: String(claim.year),
      make: claim.make,
      radius: String(radius),
      ...(isNationwide ? { nationwide: 'true' } : { zip: claim.zip }),
    }

    // Try with trim as separate param first
    const params = new URLSearchParams({
      ...baseParams,
      model: claim.model,
      ...(claim.trim ? { trim: claim.trim } : {}),
    })
    const res = await fetch(`/api/acv/search-comps?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    let results: MarketComp[] = data.listings ?? []

    // If trim provided but results are sparse or wrong trims, retry with trim in model name
    // e.g. model="RC" trim="F" → model="RC F" (common in MarketCheck for performance trims)
    if (claim.trim && results.length < 3) {
      const altParams = new URLSearchParams({
        ...baseParams,
        model: `${claim.model} ${claim.trim}`,
      })
      const altRes = await fetch(`/api/acv/search-comps?${altParams}`)
      if (altRes.ok) {
        const altData = await altRes.json()
        const altResults: MarketComp[] = altData.listings ?? []
        if (altResults.length > results.length) {
          results = altResults
        }
      }
    }

    return results
  }

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function run() {
      try {
        const isNationwide = claim.radius === 0
        const initialRadius = isNationwide ? 0 : claim.radius
        const radiusLabel = isNationwide ? 'nationwide' : `within ${initialRadius} miles of ${claim.zip}`

        // Step 1: Search at selected radius
        updateStatus('searching', 'running', `Searching ${radiusLabel}...`)
        let listings = await searchAtRadius(initialRadius)
        let radiusUsed = initialRadius

        updateStatus(
          'searching',
          'done',
          `Found ${listings.length} listing${listings.length !== 1 ? 's' : ''} ${radiusLabel}`
        )

        // Step 2: Expand if needed (skip if nationwide)
        if (!isNationwide && listings.length < 2) {
          const expansions = [500, 750, 0] // 0 = nationwide fallback
          for (const expandTo of expansions) {
            if (expandTo <= initialRadius) continue
            const expandLabel = expandTo === 0 ? 'nationwide' : `${expandTo} miles`
            updateStatus('expanding', 'running', `Too few results, expanding to ${expandLabel}...`)
            listings = await searchAtRadius(expandTo)
            radiusUsed = expandTo
            if (listings.length >= 3) break
          }

          if (listings.length < 3) {
            updateStatus(
              'expanding',
              'error',
              `Only ${listings.length} listing${listings.length !== 1 ? 's' : ''} found — cannot generate report`
            )
            setState((prev) => ({
              ...prev,
              error: `Not enough comparables found (${listings.length} found, need at least 3). Try a different vehicle.`,
            }))
            return
          }

          const expandedLabel = radiusUsed === 0 ? 'nationwide' : `within ${radiusUsed} miles`
          updateStatus(
            'expanding',
            'done',
            `Found ${listings.length} listing${listings.length !== 1 ? 's' : ''} ${expandedLabel}`
          )
        } else if (isNationwide && listings.length < 3) {
          updateStatus(
            'expanding',
            'error',
            `Only ${listings.length} listing${listings.length !== 1 ? 's' : ''} found nationwide — cannot generate report`
          )
          setState((prev) => ({
            ...prev,
            error: `Not enough comparables found (${listings.length} found, need at least 3).`,
          }))
          return
        } else {
          updateStatus('expanding', 'done', 'Radius expansion not needed')
        }

        // Filter by trim: prefer exact trim matches, then word-boundary,
        // then partial overlap — only fall back to all if zero matches
        if (claim.trim) {
          const trimLower = claim.trim.toLowerCase().trim()
          const trimWords = trimLower.split(/\s+/)

          // 1. Exact match
          const exactMatch = listings.filter((l) =>
            (l.trim as string || '').toLowerCase().trim() === trimLower
          )
          // 2. Word-boundary match: all subject trim words appear in comp trim
          const wordMatch = listings.filter((l) => {
            const compTrimWords = (l.trim as string || '').toLowerCase().trim().split(/\s+/)
            return trimWords.every((tw) => compTrimWords.includes(tw))
          })
          // 3. Partial overlap: comp trim contains OR is contained by subject trim
          const partialMatch = listings.filter((l) => {
            const compTrim = (l.trim as string || '').toLowerCase().trim()
            return compTrim.includes(trimLower) || trimLower.includes(compTrim)
          })

          if (exactMatch.length >= 3) {
            listings = exactMatch
          } else if (wordMatch.length >= 3) {
            listings = wordMatch
          } else if (partialMatch.length >= 3) {
            listings = partialMatch
          } else {
            // Use the best available trim-matched set, even if < 3
            // Only fall back to all listings if there are ZERO trim matches
            const bestMatch = exactMatch.length > 0
              ? exactMatch
              : wordMatch.length > 0
                ? wordMatch
                : partialMatch
            if (bestMatch.length > 0) {
              listings = bestMatch
            }
            // If all match arrays are empty, keep all listings as last resort
          }
        }

        // If trim filtering reduced below 3, warn but continue with what we have
        if (claim.trim && listings.length < 3 && listings.length > 0) {
          updateStatus(
            'expanding',
            'running',
            `Only ${listings.length} trim-matched comp${listings.length !== 1 ? 's' : ''} found for "${claim.trim}" — report may use fewer than 3 comps`
          )
        } else if (claim.trim && listings.length === 0) {
          setState((prev) => ({
            ...prev,
            error: `No comparables found matching trim "${claim.trim}". Try adjusting the trim or searching manually.`,
          }))
          return
        }

        // Step 3: Depreciation
        updateStatus(
          'depreciation',
          'running',
          `Calculating depreciation for ${claim.year} ${claim.make} ${claim.model}...`
        )
        let depreciationPerYear = 0
        try {
          const depRes = await fetch(
            `/api/acv/depreciation?make=${encodeURIComponent(claim.make)}&model=${encodeURIComponent(claim.model)}&year=${claim.year}&zip=${claim.zip}`
          )
          if (depRes.ok) {
            const depData = await depRes.json()
            depreciationPerYear = depData.depreciationPerYear ?? 0
          }
        } catch { /* use 0 if fails */ }

        updateStatus(
          'depreciation',
          'done',
          depreciationPerYear !== 0
            ? `Depreciation: ${formatCurrency(Math.abs(depreciationPerYear))} / year`
            : 'Depreciation data unavailable — year adjustments set to $0'
        )

        // Step 4: Calculate comp values, find average, select 3 closest
        const mileageRate = getMileageRate(claim.make, claim.model, claim.trim, claim.year)
        updateStatus('selecting', 'running', `Mileage rate: $${mileageRate.toFixed(3)}/mile — selecting best 3...`)
        const compsWithValues = listings.map((comp) => {
          const mileageDiffRaw = comp.miles - claim.mileage
          const mileageAdjDollar = -(mileageDiffRaw * mileageRate)
          const yearDiffRaw = comp.year - claim.year
          const yearAdjDollar = yearDiffRaw * depreciationPerYear
          const compValue = calculateCompValue({
            price: comp.price,
            mileageAdjDollar,
            yearAdjDollar,
          })
          return {
            ...comp,
            mileageDiffRaw,
            mileageAdjDollar,
            yearDiffRaw,
            yearAdjDollar,
            compValue,
          } as SelectedComp
        })

        // Average of all comp values
        const allValues = compsWithValues.map((c) => c.compValue)
        const overallAvg = allValues.reduce((a, b) => a + b, 0) / allValues.length

        // Select 3 closest to average
        const sorted = [...compsWithValues].sort(
          (a, b) => Math.abs(a.compValue - overallAvg) - Math.abs(b.compValue - overallAvg)
        )
        const top3 = sorted.slice(0, 3)

        updateStatus(
          'selecting',
          'done',
          `Selected 3 comps closest to average (${formatCurrency(overallAvg)})`
        )

        // Step 5: Calculate final ACV
        // Build final notes
        const radiusDesc = radiusUsed === 0 ? 'nationwide' : `within a ${radiusUsed}-mile radius`
        const top3Avg = (top3[0].compValue + top3[1].compValue + top3[2].compValue) / 3
        const finalAcvPreview = calculateACV(top3, adjustments)
        const autoNotes = `Based on the information provided, I have attached the recommended ACV on this vehicle. This report was generated using 3 comparable vehicles selected from ${listings.length} available listings ${radiusDesc}. The average adjusted value of the selected comparables is ${formatCurrency(top3Avg)}, and the subject vehicle's ACV has been established at ${formatCurrency(finalAcvPreview.acv)}.`

        const finalAdj: ACVAdjustments = { ...adjustments, notes: autoNotes }
        const finalResult = calculateACV(top3, finalAdj)

        updateStatus(
          'done',
          'done',
          `ACV: ${formatCurrency(finalResult.acv)} · Avg: ${formatCurrency(finalResult.averageValue)}`
        )

        setState((prev) => ({
          ...prev,
          selectedComps: top3,
          result: finalResult,
          finalAdjustments: finalAdj,
          radiusUsed,
          totalFound: listings.length,
        }))

        onDone(top3, finalResult, finalAdj)
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Processing failed',
        }))
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const statusLabels: Record<StatusKey, string> = {
    searching: 'Searching comparables',
    expanding: 'Radius expansion',
    depreciation: 'Calculating depreciation',
    selecting: 'Selecting best 3 comps',
    done: 'Finalizing ACV',
  }

  const hasError = !!state.error
  const isDone = state.statuses.done === 'done'

  return (
    <div className="space-y-6">
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            ) : hasError ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            )}
            {isDone ? 'Processing Complete' : hasError ? 'Processing Failed' : 'Processing...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            {(Object.keys(statusLabels) as StatusKey[]).map((key) => (
              <StatusRow
                key={key}
                label={statusLabels[key]}
                status={state.statuses[key]}
                detail={state.details[key]}
              />
            ))}
          </div>
          {state.error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Show comp cards when done */}
      {isDone && state.selectedComps.length === 3 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Auto-Selected Comps</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {state.selectedComps.map((comp, i) => (
              <Card key={comp.id} className="bg-white border-gray-200 shadow-sm">
                {comp.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={comp.photoUrl}
                    alt={comp.heading}
                    className="w-full h-32 object-cover rounded-t-lg"
                  />
                )}
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">
                      {comp.year} {comp.make} {comp.model}
                    </p>
                    <Badge className="shrink-0 text-xs bg-blue-600 hover:bg-blue-600 text-white">
                      #{i + 1}
                    </Badge>
                  </div>
                  <p className="text-base font-bold text-blue-600">
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
                    </p>
                  )}
                  {comp.dealerPhone && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      {comp.dealerPhone}
                    </p>
                  )}
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Mile adj</span>
                      <span
                        className={
                          comp.mileageAdjDollar < 0 ? 'text-red-500' : 'text-blue-600'
                        }
                      >
                        {formatCurrency(comp.mileageAdjDollar)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Year adj</span>
                      <span
                        className={comp.yearAdjDollar < 0 ? 'text-red-500' : 'text-blue-600'}
                      >
                        {formatCurrency(comp.yearAdjDollar)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-gray-900">
                      <span>Value</span>
                      <span>{formatCurrency(comp.compValue)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {state.result && (
            <Card className="bg-white border-emerald-200 shadow-sm mt-4">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    <p>
                      Average Value:{' '}
                      <span className="text-gray-900 font-semibold">
                        {formatCurrency(state.result.averageValue)}
                      </span>
                    </p>
                    <p>
                      Total Adjustments:{' '}
                      <span
                        className={
                          state.result.totalAdjustments < 0 ? 'text-red-500' : 'text-blue-600'
                        }
                      >
                        {formatCurrency(state.result.totalAdjustments)}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">ACV</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(state.result.acv)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {hasError && (
        <Button
          onClick={onBack}
          variant="outline"
          className="border-gray-200 text-gray-700 hover:bg-gray-100"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      )}
    </div>
  )
}

// ── History Dashboard ────────────────────────────────────────────────────────
// ── Main page ────────────────────────────────────────────────────────────────
const AUTO_ACV_SESSION_KEY = 'modern-tools-auto-acv-draft'

function getAutoACVDraft(): { step: number; claim: ClaimInfo; adjustments: ACVAdjustments; finalComps: SelectedComp[]; finalResult: ACVResult | null; finalAdj: ACVAdjustments; editingId: string | null } | null {
  try {
    const raw = sessionStorage.getItem(AUTO_ACV_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function AutoACVInner() {
  const searchParams = useSearchParams()
  const draft = useRef(getAutoACVDraft())
  const [step, setStep] = useState(() => draft.current?.step ?? 1)
  const [claim, setClaim] = useState<ClaimInfo>(() => draft.current?.claim ?? defaultClaim())
  const [adjustments, setAdjustments] = useState<ACVAdjustments>(
    () => draft.current?.adjustments ?? defaultAdjustments()
  )
  const [finalComps, setFinalComps] = useState<SelectedComp[]>(() => draft.current?.finalComps ?? [])
  const [finalResult, setFinalResult] = useState<ACVResult | null>(() => draft.current?.finalResult ?? null)
  const [finalAdj, setFinalAdj] = useState<ACVAdjustments>(
    () => draft.current?.finalAdj ?? defaultAdjustments()
  )
  const [processKey, setProcessKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(() => draft.current?.editingId ?? null)

  // On mount: if not in edit mode, clear any stale draft so a fresh form loads
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (searchParams.get('edit') === 'true') {
      // Edit mode: load from history
      try {
        const raw = sessionStorage.getItem('modern-tools-acv-edit')
        if (raw) {
          const entry: ACVHistoryEntry = JSON.parse(raw)
          sessionStorage.removeItem('modern-tools-acv-edit')
          sessionStorage.removeItem(AUTO_ACV_SESSION_KEY)
          setClaim(entry.claim)
          setAdjustments(entry.adjustments)
          setEditingId(entry.id)
          if (entry.comps && entry.comps.length > 0) {
            setFinalComps(entry.comps)
            setFinalResult(entry.result)
            setFinalAdj(entry.adjustments)
          }
        }
      } catch { /* ignore */ }
    } else {
      // Fresh start: clear old draft
      sessionStorage.removeItem(AUTO_ACV_SESSION_KEY)
      setClaim(defaultClaim())
      setAdjustments(defaultAdjustments())
      setFinalComps([])
      setFinalResult(null)
      setFinalAdj(defaultAdjustments())
      setEditingId(null)
    }
  }, [searchParams])

  // Persist form state to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(AUTO_ACV_SESSION_KEY, JSON.stringify({
        step, claim, adjustments, finalComps, finalResult, finalAdj, editingId,
      }))
    } catch { /* ignore */ }
  }, [step, claim, adjustments, finalComps, finalResult, finalAdj, editingId])

  const canProceedStep1 =
    claim.year > 0 && claim.make && claim.model && claim.mileage > 0 && (claim.radius === 0 || claim.zip.length === 5)

  const steps = ['Claim Info', 'Adjustments', 'Auto Process', 'Review & Generate']

  const handleSaveClaim = () => {
    if (finalComps.length < 3 || !finalResult) return
    saveToHistory(claim, finalComps, finalAdj, finalResult, 'auto-acv', editingId)
    if (!editingId) {
      try {
        const h: ACVHistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
        if (h.length > 0) setEditingId(h[0].id)
      } catch { /* ignore */ }
    }
  }

  const handleVinDecoded = (updatedClaim: ClaimInfo) => {
    const emptyResult: ACVResult = { comp1Value: 0, comp2Value: 0, comp3Value: 0, averageValue: 0, totalAdjustments: 0, taxAmount: 0, acv: 0 }
    saveToHistory(updatedClaim, [], adjustments, emptyResult, 'auto-acv', editingId)
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
    setAdjustments(defaultAdjustments())
    setFinalComps([])
    setFinalResult(null)
    setFinalAdj(defaultAdjustments())
    setProcessKey((k) => k + 1)
    setEditingId(null)
    sessionStorage.removeItem(AUTO_ACV_SESSION_KEY)
  }

  const goToStep3 = () => {
    setProcessKey((k) => k + 1)
    setStep(3)
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/acv" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">Auto ACV</h1>
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
                      onClick={() => {
                        if (n === 3) {
                          setProcessKey((k) => k + 1)
                        }
                        setStep(n)
                      }}
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
                    <ClaimInfoForm claim={claim} onChange={setClaim} onVinDecoded={handleVinDecoded} />
                  </CardContent>
                </Card>
                <div className="flex justify-end mt-6">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Next: Adjustments
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Adjustments */}
            {step === 2 && (
              <div>
                <Card className="bg-white border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900">Report Adjustments</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Comp selection and year adjustments will be calculated automatically. Enter any
                      manual adjustments below.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ReportAdjustmentsForm adjustments={adjustments} onChange={setAdjustments} />
                  </CardContent>
                </Card>
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
                    onClick={goToStep3}
                    className="bg-blue-600 hover:bg-blue-500 text-white ml-auto"
                  >
                    Next: Run Auto Process
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Auto Process */}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Auto Processing</h2>
                <AutoProcessStep
                  key={processKey}
                  claim={claim}
                  adjustments={adjustments}
                  onDone={(comps, result, adj) => {
                    setFinalComps(comps)
                    setFinalResult(result)
                    setFinalAdj(adj)
                    // Auto-advance to review after a short delay
                    setTimeout(() => setStep(4), 800)
                  }}
                  onBack={() => setStep(2)}
                />
              </div>
            )}

            {/* Step 4: Review & Generate */}
            {step === 4 && finalResult && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Generate</h2>
                <ReviewStep
                  claim={claim}
                  selectedComps={finalComps}
                  adjustments={finalAdj}
                  result={finalResult}
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

export default function AutoACVPage() {
  return (
    <Suspense>
      <AutoACVInner />
    </Suspense>
  )
}
