"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
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
  ClipboardList,
  Printer,
  Lock,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ClaimInfo, ClaimType, MarketComp, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import { parseClaimPDF } from '@/lib/parse-claim-pdf'
import {
  calculateACV,
  calculateCompValue,
  defaultAdjustments,
  formatCurrency,
} from '@/lib/acv/calculations'
import { saveACVHistory, fetchACVEntry, type ClaimStatus } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'
import { LossSearchTab, type LossListing } from '@/components/claim/loss-search-tab'
import { EstimateTab } from '@/components/claim/estimate-tab'
import { DocumentsTab } from '@/components/claim/documents-tab'
import { MessagesTab } from '@/components/claim/messages-tab'
import { GuidelinesTab } from '@/components/claim/guidelines-tab'
import { fetchGuidelineNamesBrowser } from '@/lib/supabase/insurance-guidelines'
import { useDuplicateCheck, type DuplicateResult } from '@/lib/supabase/claim-duplicates'
import { AssignmentSheet, triggerAssignmentSheetPrint } from '@/components/claim/assignment-sheet'
import { DVTab, type DVState } from '@/components/claim/dv-tab'
import { ReportsTab, type InvoiceReportState } from '@/components/claim/reports-tab'
import { uploadClaimDocument, type ClaimDocument } from '@/lib/supabase/documents'
import { savePdfWithPicker } from '@/lib/save-pdf'
import { captureSummaryPdf } from '@/lib/summary-pdf'
import { saveSummary, getSummary, genId, newEmptyForm, type SavedSummary } from '@/app/summary-page/lib'
import { SummaryFields } from '@/app/summary-page/SummaryFields'
import { SummaryPrintDoc } from '@/app/summary-page/SummaryPrintDoc'
import { AppHeader } from '@/components/app-header'

async function saveToHistory(
  claim: ClaimInfo,
  comps: SelectedComp[],
  adjustments: ACVAdjustments,
  result: ACVResult,
  mode: string,
  editId?: string | null,
  mileageRate?: number,
  reportsState?: ReportsState,
  extras?: { status?: ClaimStatus; auctionListings?: LossListing[]; estimate?: unknown; documents?: ClaimDocument[]; dv?: DVState | null; invoice?: InvoiceReportState | null },
) {
  const id = editId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const entry = {
    id,
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
    mileageRate: mileageRate ?? 0,
    reportsState,
    status: extras?.status,
    auctionListings: extras?.auctionListings,
    estimate: extras?.estimate,
    documents: extras?.documents,
    dv: extras?.dv ?? undefined,
    invoice: extras?.invoice ?? undefined,
  }
  await saveACVHistory(entry, editId)
  return id
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

function MileageRateInput({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (val: number) => void
  className?: string
}) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder="0.05"
      value={focused ? raw : (value ? value.toFixed(2) : '')}
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

// ── Duplicate warning (inline under VIN / Claim # fields) ────────────────────
function DuplicateWarning({
  matches,
  field,
}: {
  matches: Array<{ id: string; maNumber: string; insuredName: string; vehicle: string; date: string }>
  field: string
}) {
  if (!matches || matches.length === 0) return null
  const fmt = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
  }
  return (
    <div className="mt-2 p-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
      <div className="font-semibold flex items-center gap-1 mb-1">
        <AlertCircle className="w-3 h-3" />
        Duplicate {field}: matches {matches.length} other claim{matches.length === 1 ? '' : 's'}
      </div>
      <ul className="pl-4 list-disc space-y-0.5">
        {matches.slice(0, 5).map(m => (
          <li key={m.id}>
            <a
              href={`/claims/${m.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-900 underline hover:text-amber-950"
            >
              MA# {m.maNumber || m.id}
            </a>
            {m.insuredName && <> · {m.insuredName}</>}
            {m.vehicle && <> · {m.vehicle}</>}
            {m.date && <> · {fmt(m.date)}</>}
          </li>
        ))}
        {matches.length > 5 && <li>and {matches.length - 5} more…</li>}
      </ul>
    </div>
  )
}

// ── Persistent duplicate banner at top of saved-claim workspace ──────────────
function DuplicateBanner({ duplicates }: { duplicates: DuplicateResult }) {
  const { vinMatches, claimNumberMatches } = duplicates
  const fmt = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
  }
  const renderList = (label: string, list: DuplicateResult['vinMatches']) => (
    <div>
      <span className="font-semibold">{label} matches:</span>{' '}
      {list.slice(0, 5).map((m, i) => (
        <span key={m.id}>
          <a href={`/claims/${m.id}`} target="_blank" rel="noreferrer"
             className="underline hover:no-underline">
            MA# {m.maNumber || m.id}
          </a>
          {m.insuredName && ` (${m.insuredName})`}
          {m.date && `, ${fmt(m.date)}`}
          {i < Math.min(list.length, 5) - 1 && '; '}
        </span>
      ))}
      {list.length > 5 && <> and {list.length - 5} more…</>}
    </div>
  )
  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm space-y-1">
      <div className="font-bold flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Duplicate detected on this claim
      </div>
      {vinMatches.length > 0 && renderList('VIN', vinMatches)}
      {claimNumberMatches.length > 0 && renderList('Claim #', claimNumberMatches)}
    </div>
  )
}

// ── Claim type chips (multi-select toggle) ───────────────────────────────────
const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  acv:      'ACV',
  dv:       'DV',
  estimate: 'Est Dispute',
  other:    'Other',
}
const CLAIM_TYPE_ORDER: ClaimType[] = ['acv', 'dv', 'estimate', 'other']

function ClaimTypeChips({
  selected,
  onChange,
}: {
  selected: ClaimType[]
  onChange: (next: ClaimType[]) => void
}) {
  const toggle = (t: ClaimType) => {
    if (selected.includes(t)) {
      onChange(selected.filter(x => x !== t))
    } else {
      onChange([...selected, t])
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CLAIM_TYPE_ORDER.map(t => {
        const active = selected.includes(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-semibold border transition-colors',
              active
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
            )}
          >
            {CLAIM_TYPE_LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}

// ── Claim form (NO vehicle fields — those are on step 2) ─────────────────────
function ClaimInfoForm({
  claim,
  onChange,
  insuranceCompanyOptions,
  duplicates,
  isNew,
  canEdit,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  insuranceCompanyOptions: string[]
  duplicates: DuplicateResult
  isNew: boolean
  canEdit: boolean
}) {
  // Edit mode: on for brand-new claims (nothing to protect yet), off by
  // default for existing claims. The Edit button flips it. If the user
  // doesn't have permission (`canEdit` false) the Edit button is hidden
  // and the form stays locked — Handling Appraiser stays editable regardless
  // since it feeds Award / Closing Notes downstream.
  const [editMode, setEditMode] = useState<boolean>(isNew)
  const locked = !editMode && !isNew
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
        dateReceived: data.dateReceived || claim.dateReceived,
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
      {/* PDF Upload — only surfaced during initial claim creation. Once
          the claim exists there's nothing to auto-fill into. */}
      {isNew && (
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
      )}

      {/* Lock / Edit toggle — only on existing claims. Admins and users with
          the can_edit_claim_info permission can flip to Edit mode; everyone
          else sees a passive locked notice. */}
      {!isNew && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
          {locked ? (
            <>
              <Lock className="w-4 h-4 text-gray-500" />
              <div className="text-sm text-gray-700 flex-1">
                Claim Info is locked.
                {!canEdit && ' Only admins or users granted edit permission can unlock it.'}
                {' '}Handling Appraiser can still be edited by anyone.
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
            </>
          ) : (
            <>
              <Pencil className="w-4 h-4 text-blue-600" />
              <div className="text-sm text-gray-700 flex-1">Editing enabled. Changes save automatically.</div>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                <Lock className="w-3.5 h-3.5 mr-1" /> Done
              </Button>
            </>
          )}
        </div>
      )}

      {/* Handling Appraiser — always editable (feeds Award / Closing Notes). */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Handling Appraiser</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Handling Appraiser</label>
            <input className={inputCls} placeholder="Henry Aleksanyan" value={claim.handlingAppraiser ?? ''} onChange={(e) => set('handlingAppraiser', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Everything below is subject to the edit lock. A native fieldset with
          disabled disables every descendant input in one shot and dims via
          the styles below. */}
      <fieldset disabled={locked} className={cn('space-y-8 m-0 p-0 border-0', locked && 'opacity-70')}>

      {/* Claim Type — drives which tool tabs appear. Multi-select. "Other"
          unlocks every tool. Empty = show all (backward compat). */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-4">Claim Type</h3>
        <ClaimTypeChips
          selected={claim.claimTypes ?? []}
          onChange={(next) => onChange({ ...claim, claimTypes: next })}
        />
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
            <DuplicateWarning matches={duplicates.claimNumberMatches} field="claim #" />
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
            <input
              className={inputCls}
              placeholder="State Farm"
              value={claim.insuranceCompany}
              onChange={(e) => set('insuranceCompany', e.target.value)}
              list="insurance-company-options"
              autoComplete="off"
            />
            <datalist id="insurance-company-options">
              {insuranceCompanyOptions.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
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

      </fieldset>
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
  duplicates,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  onSearch: () => void
  onVinDecoded?: (updatedClaim: ClaimInfo) => void
  loading: boolean
  duplicates: DuplicateResult
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
        vin: data.vin ?? claim.vin,
        year: data.year ?? claim.year,
        make: data.make ?? claim.make,
        model: data.model ?? claim.model,
        trim: data.trim ?? claim.trim,
        engine: data.engine ?? claim.engine,
        drivetrain: data.drivetrain ?? claim.drivetrain,
        transmission: data.transmission ?? claim.transmission,
        fuelType: data.fuelType ?? claim.fuelType,
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
        <DuplicateWarning matches={duplicates.vinMatches} field="VIN" />
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
          <label className={labelCls}>Engine</label>
          <input className={inputCls} placeholder="2.5L I4" value={claim.engine} onChange={(e) => set('engine', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Drivetrain</label>
          <input className={inputCls} placeholder="AWD" value={claim.drivetrain} onChange={(e) => set('drivetrain', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Transmission</label>
          <input className={inputCls} placeholder="Automatic" value={claim.transmission} onChange={(e) => set('transmission', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Fuel Type</label>
          <select className={inputCls} value={claim.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
            <option value="">Any</option>
            <option value="Gasoline">Gasoline</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Plug-in Hybrid">Plug-in Hybrid</option>
            <option value="Electric">Electric</option>
            <option value="Diesel">Diesel</option>
            <option value="Flex Fuel">Flex Fuel</option>
          </select>
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
  onEdit,
}: {
  comp: MarketComp
  selected: boolean
  selectionIndex: number
  onToggle: () => void
  disabled: boolean
  onEdit?: () => void
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
        {onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-2.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
          >
            Edit
          </button>
        )}
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

  const [pctMode, setPctMode] = useState<Record<string, boolean>>({})
  const [pctInputs, setPctInputs] = useState<Record<string, { base: number; pct: number }>>({})

  return (
    <div className="space-y-6">
      {/* Mileage rate input */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 text-sm">Mileage Adjustment Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <MileageRateInput
              className={`${inputCls} text-right w-40`}
              value={mileageRate}
              onChange={(val) => onMileageRateChange(val)}
            />
            <span className="text-xs text-gray-500">cents per mile</span>
            <p className="text-xs text-gray-400 ml-auto">
              Automatically calculates mileage adjustments for each comp
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Per-comp adjustments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {selectedComps.map((comp, i) => {
          const mileageDiff = (Number(comp.miles) || 0) - (Number(claim.mileage) || 0)
          const yearDiff = (Number(comp.year) || 0) - (Number(claim.year) || 0)
          const adj = compAdjustments[i] ?? { mileageAdj: 0, yearAdj: 0 }
          const compVal = calculateCompValue({
            price: Number(comp.price) || 0,
            mileageAdjDollar: Number(adj.mileageAdj) || 0,
            yearAdjDollar: Number(adj.yearAdj) || 0,
          })

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
              <div key={row.label} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{row.label}</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder={row.placeholder}
                    value={adjustments[row.noteKey]}
                    onChange={(e) => onAdjChange({ ...adjustments, [row.noteKey]: e.target.value })}
                  />
                  {pctMode[row.valKey] ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-28">
                        <CurrencyInput
                          className={`${inputCls} text-right`}
                          value={pctInputs[row.valKey]?.base || 0}
                          onChange={(val) => {
                            const pct = pctInputs[row.valKey]?.pct || 0
                            const result = Math.round(val * pct) / 100
                            setPctInputs(prev => ({ ...prev, [row.valKey]: { base: val, pct } }))
                            onAdjChange({ ...adjustments, [row.valKey]: result })
                          }}
                        />
                      </div>
                      <span className="text-gray-400 text-sm">×</span>
                      <div className="relative w-20">
                        <input
                          type="number"
                          step="1"
                          className={`${inputCls} text-right pr-7`}
                          placeholder="0"
                          value={pctInputs[row.valKey]?.pct || ''}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value) || 0
                            const base = pctInputs[row.valKey]?.base || 0
                            const result = Math.round(base * pct) / 100
                            setPctInputs(prev => ({ ...prev, [row.valKey]: { base, pct } }))
                            onAdjChange({ ...adjustments, [row.valKey]: result })
                          }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                      </div>
                      <span className="text-gray-400 text-sm">=</span>
                      <span className="w-24 text-right text-sm font-medium text-gray-700">{formatCurrency(adjustments[row.valKey])}</span>
                    </div>
                  ) : (
                    <div className="w-36 shrink-0">
                      <CurrencyInput
                        className={`${inputCls} text-right`}
                        value={adjustments[row.valKey]}
                        onChange={(val) => onAdjChange({ ...adjustments, [row.valKey]: val })}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPctMode(prev => ({ ...prev, [row.valKey]: !prev[row.valKey] }))}
                    className={cn(
                      'shrink-0 px-2 py-1.5 text-xs font-medium rounded-md border transition-all',
                      pctMode[row.valKey]
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    )}
                    title="Toggle percentage mode"
                  >
                    %
                  </button>
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
  mileageRate,
  reportsState,
  onDocumentSaved,
}: {
  claim: ClaimInfo
  selectedComps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
  onBack: () => void
  onStartOver: () => void
  onSave: () => void
  editId?: string | null
  mileageRate: number
  reportsState: ReportsState
  onDocumentSaved?: (blob: Blob, name: string) => void
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
      const name = `${claim.maNumber || 'report'}-acv.pdf`
      // Auto-file to Documents FIRST (canonical claim record), then let the
      // user choose where to save a local copy via the OS save-as dialog.
      onSave()
      onDocumentSaved?.(blob, name)
      await savePdfWithPicker(blob, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
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
              <span>Average of {selectedComps.length} Comp{selectedComps.length !== 1 ? 's' : ''}</span>
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
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Print
          </Button>
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
  signatureBlock1: string,
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

  const sigName = signatureBlock1.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
  text += `\n\nSincerely,\n${sigName}\nModern Appraisers\n702-321-5930`

  return text
}

function getDropdownValue(type: NotesType): string {
  if (type === 'acv' || type === 'acv-umpire') return 'Appraisal Clause Assignment – ACV '
  return 'Diminished Value Assignment – DV'
}

interface ReportsState {
  notesType: NotesType
  notesData: {
    // Closing Notes date. Empty until the tab is first opened; then auto-set to
    // that day's date. Editable. Falls back to today's date at PDF generation.
    date: string
    maValueNum: number
    appraiserName: string
    appraiserCompany: string
    appraiserValueNum: number
    appraiserTitle: string
    appraiserLastName: string
    agreementAmountNum: number
    umpireName: string
    umpireAmountNum: number
  }
  awardData: {
    insuranceCompany: string
    vehicleOwner: string
    vehicle: string
    dateOfLoss: string
    claimDate: string
    claimNumber: string
    acvAmountNum: number
    signatureDate1: string
    signatureDate2: string
    signatureBlock1: string
    signatureBlock2: string
  }
  // Id of the Summary Page that belongs to this claim (one per file).
  summaryId?: string
}

function defaultReportsState(claim: ClaimInfo): ReportsState {
  return {
    notesType: 'acv',
    notesData: {
      // Left empty so it can auto-fill with today's date on FIRST tab open,
      // not at claim-creation time. See the useEffect near ReportsStep's view
      // handler.
      date: '',
      maValueNum: 0,
      appraiserName: '',
      appraiserCompany: '',
      appraiserValueNum: 0,
      appraiserTitle: 'Mr.',
      appraiserLastName: '',
      agreementAmountNum: 0,
      umpireName: '',
      umpireAmountNum: 0,
    },
    awardData: {
      insuranceCompany: claim.insuranceCompany || '',
      vehicleOwner: claim.insuredName || '',
      vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
      dateOfLoss: claim.dateOfLoss || '',
      // Left empty so it can auto-fill on FIRST Award tab open — matches
      // Closing Notes behavior. Signature date defaults the same way.
      claimDate: '',
      claimNumber: claim.claimNumber || '',
      acvAmountNum: 0,
      signatureDate1: '',
      signatureDate2: '',
      signatureBlock1: 'Henry Aleksanyan\nModern Appraisers',
      signatureBlock2: '',
    },
  }
}

function ReportsStep({
  claim,
  result,
  onBack,
  reportsState,
  onReportsStateChange,
  view,
  onDocumentSaved,
}: {
  claim: ClaimInfo
  result: ACVResult
  onBack?: () => void
  reportsState: ReportsState
  // Must support functional updates: multiple effects/handlers here update
  // different slices of the same object; plain-value updates from stale
  // closures were overwriting each other (lost Opposing Appraiser edits).
  onReportsStateChange: (updated: ReportsState | ((prev: ReportsState) => ReportsState)) => void
  // When set, the workspace tab bar controls which report shows: the internal
  // hub and back buttons are hidden, and this component stays mounted across
  // the Summary / Closing Notes / Award tabs (so its sync effects keep running).
  view?: 'summary-page' | 'award-agreement' | 'closing-notes'
  // Files a copy of a generated/printed report into the claim's Documents tab.
  onDocumentSaved?: (blob: Blob, name: string, source: 'award' | 'closing-notes' | 'summary') => void
}) {
  const [selectedReport, setSelectedReport] = useState<string | null>(view ?? null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingSummary, setCreatingSummary] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState<SavedSummary | null>(null)
  const summarySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Convenience accessors
  const notesType = reportsState.notesType
  const notesData = reportsState.notesData
  const awardData = reportsState.awardData

  const setNotesType = (t: NotesType) =>
    onReportsStateChange(prev => ({ ...prev, notesType: t }))

  const setNotesData = (fn: (prev: ReportsState['notesData']) => ReportsState['notesData']) =>
    onReportsStateChange(prev => ({ ...prev, notesData: fn(prev.notesData) }))

  const setAwardData = (fn: (prev: ReportsState['awardData']) => ReportsState['awardData']) =>
    onReportsStateChange(prev => ({ ...prev, awardData: fn(prev.awardData) }))

  const setNotes = (field: string, value: string | number) =>
    setNotesData(prev => {
      const next = { ...prev, [field]: value }
      // Auto-derive last name from full name
      if (field === 'appraiserName' && typeof value === 'string') {
        const parts = value.trim().split(/\s+/)
        next.appraiserLastName = parts.length > 1 ? parts[parts.length - 1] : value.trim()
      }
      return next
    })

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
    awardData.signatureBlock1,
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
        awardData.signatureBlock1,
      )
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/acv/generate-notes-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Use the user-set date if present; fall back to today.
          date: notesData.date || today,
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
      const name = `${claim.maNumber || 'report'}-notes.pdf`
      // Auto-file to Documents first, then prompt for local save location.
      onDocumentSaved?.(blob, name, 'closing-notes')
      await savePdfWithPicker(blob, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const setAward = (field: string, value: string) =>
    setAwardData(prev => ({ ...prev, [field]: value }))

  // Keep award fields in sync with claim data. The Handling Appraiser (when set)
  // becomes Appraiser 1 on the award — and, via signatureBlock1, the Closing
  // Notes signature name.
  useEffect(() => {
    setAwardData(prev => ({
      ...prev,
      insuranceCompany: claim.insuranceCompany || prev.insuranceCompany,
      vehicleOwner: claim.insuredName || prev.vehicleOwner,
      vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' ') || prev.vehicle,
      dateOfLoss: claim.dateOfLoss || prev.dateOfLoss,
      claimNumber: claim.claimNumber || prev.claimNumber,
      signatureBlock1: claim.handlingAppraiser
        ? `${claim.handlingAppraiser}\nModern Appraisers`
        : prev.signatureBlock1,
    }))
  }, [claim.insuranceCompany, claim.insuredName, claim.year, claim.make, claim.model, claim.dateOfLoss, claim.claimNumber, claim.handlingAppraiser])

  // Append a role label as the last line of a signature block (idempotent).
  const withRoleLabel = (block: string, label: string) => {
    const lines = block.split('\n').map(l => l.trimEnd())
    if (lines.some(l => l.trim().toLowerCase() === label.toLowerCase())) return block
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return [...lines, label].join('\n')
  }

  const downloadAwardPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const payload = {
        ...awardData,
        signatureBlock1: withRoleLabel(awardData.signatureBlock1, 'For the Insurer'),
        signatureBlock2: withRoleLabel(awardData.signatureBlock2, 'For the Insured'),
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
      const name = `${claim.maNumber || 'report'}-award.pdf`
      // Auto-file to Documents first, then prompt for local save location.
      onDocumentSaved?.(blob, name, 'award')
      await savePdfWithPicker(blob, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  // Open the claim's Summary Page inline (like the Award / Closing Notes views).
  // Reuses this file's summary if it already exists, else creates one pre-filled.
  const openSummaryPage = async () => {
    setSelectedReport('summary-page')
    setCreatingSummary(true)
    setError(null)
    try {
      if (reportsState.summaryId) {
        const existing = await getSummary(reportsState.summaryId)
        if (existing) {
          // Re-sync the opposing appraiser from Claim Info so changes made after
          // the summary was first created still flow through. Only overwrite when
          // Claim Info actually has a value, so an existing entry is never wiped.
          const opposingAppraiser = notesData.appraiserName || existing.opposingAppraiser
          const oaCompany = notesData.appraiserCompany || existing.oaCompany
          // Same idea for Date Received Claim: only backfill if the summary's
          // field is currently empty AND we have a value from the CL PDF parse.
          const dateReceivedClaim =
            existing.dateReceivedClaim || claim.dateReceived || ''
          const needsSync =
            opposingAppraiser !== existing.opposingAppraiser ||
            oaCompany !== existing.oaCompany ||
            dateReceivedClaim !== existing.dateReceivedClaim
          const synced = needsSync
            ? {
                ...existing,
                opposingAppraiser,
                oaCompany,
                dateReceivedClaim,
                updatedAt: new Date().toISOString(),
              }
            : existing
          if (needsSync) await saveSummary(synced)
          setSummaryDraft(synced)
          return
        }
      }
      const now = new Date().toISOString()
      const id = genId()
      const summary: SavedSummary = {
        ...newEmptyForm(),
        id,
        createdAt: now,
        updatedAt: now,
        date: now.split('T')[0],
        claimNumber: claim.claimNumber || '',
        insuranceCompany: claim.insuranceCompany || '',
        vehicleOwner: claim.insuredName || '',
        vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
        dateOfLoss: claim.dateOfLoss || '',
        // Auto-fill from the CL PDF's Appraisal Information > Date Created.
        dateReceivedClaim: claim.dateReceived || '',
        opposingAppraiser: notesData.appraiserName || '',
        oaCompany: notesData.appraiserCompany || '',
      }
      await saveSummary(summary)
      // Link the summary to this claim so returning here reopens the same file.
      onReportsStateChange(prev => ({ ...prev, summaryId: id }))
      setSummaryDraft(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open summary page')
      setSelectedReport(null)
    } finally {
      setCreatingSummary(false)
    }
  }

  // Debounced auto-save of the inline summary editor.
  const handleSummaryChange = (next: SavedSummary) => {
    setSummaryDraft(next)
    if (summarySaveTimer.current) clearTimeout(summarySaveTimer.current)
    summarySaveTimer.current = setTimeout(() => {
      saveSummary({ ...next, updatedAt: new Date().toISOString() })
    }, 700)
  }

  // Workspace-tab control: entering the Summary tab (re)opens the linked
  // summary (with OA re-sync), the other tabs just switch the visible report.
  useEffect(() => {
    if (!view) return
    if (view === 'summary-page') {
      openSummaryPage()
    } else {
      setSelectedReport(view)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // First-open date auto-fill: when the user opens the Closing Notes or Award
  // tab and the date field is still empty, fill in today's date. Editable
  // afterwards; a manual clear that leaves the field empty will re-fill on the
  // next open (acceptable trade-off — dates rarely stay intentionally blank).
  useEffect(() => {
    if (view !== 'closing-notes') return
    if (reportsState.notesData.date) return
    const today = new Date().toISOString().split('T')[0]
    onReportsStateChange(prev =>
      prev.notesData.date
        ? prev
        : { ...prev, notesData: { ...prev.notesData, date: today } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  useEffect(() => {
    if (view !== 'award-agreement') return
    const today = new Date().toISOString().split('T')[0]
    onReportsStateChange(prev => {
      const needsClaimDate = !prev.awardData.claimDate
      const needsSigDate = !prev.awardData.signatureDate1
      if (!needsClaimDate && !needsSigDate) return prev
      return {
        ...prev,
        awardData: {
          ...prev.awardData,
          claimDate: needsClaimDate ? today : prev.awardData.claimDate,
          signatureDate1: needsSigDate ? today : prev.awardData.signatureDate1,
        },
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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
          <Card
            className={cn(
              'bg-white border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all',
              creatingSummary ? 'opacity-60 pointer-events-none' : 'cursor-pointer',
            )}
            onClick={openSummaryPage}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  {creatingSummary
                    ? <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                    : <ClipboardList className="w-5 h-5 text-indigo-600" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Summary Page</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Create a claim summary pre-filled from this report</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={onBack} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Review
          </Button>
        </div>
      </div>
    )
  }

  // Summary Page (inline editor, auto-saved)
  if (selectedReport === 'summary-page') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {!view && (
            <Button
              onClick={() => setSelectedReport(null)}
              variant="outline"
              className="border-gray-200 text-gray-700 hover:bg-gray-100"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">Summary Page</h3>
            <p className="text-xs text-gray-400">Auto-saved. Unique to this claim.</p>
          </div>
          <Button
            onClick={async () => {
              // File a PDF copy into Documents before opening the print dialog.
              try {
                const blob = await captureSummaryPdf()
                if (blob) onDocumentSaved?.(blob, `${claim.maNumber || 'claim'}-summary.pdf`, 'summary')
              } catch { /* printing still works even if capture fails */ }
              window.print()
            }}
            variant="outline"
            disabled={!summaryDraft}
            className="border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {creatingSummary && !summaryDraft ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading summary…
          </div>
        ) : summaryDraft ? (
          <>
            <SummaryFields summary={summaryDraft} onChange={handleSummaryChange} />
            <SummaryPrintDoc summary={summaryDraft} />
          </>
        ) : null}
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
              {!view && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => setSelectedReport(null)}
                >
                  <X className="w-4 h-4 mr-1" />
                  Back to Tools
                </Button>
              )}
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
                  onChange={(val) => onReportsStateChange(prev => ({
                    ...prev,
                    awardData: { ...prev.awardData, acvAmountNum: val },
                    notesData: { ...prev.notesData, agreementAmountNum: val },
                  }))}
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
          {!view && (
            <Button onClick={() => setSelectedReport(null)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button onClick={downloadAwardPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Print Award
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
              {!view && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => setSelectedReport(null)}
                >
                  <X className="w-4 h-4 mr-1" />
                  Back to Tools
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date (auto-fills today on first open; editable) */}
            <div className="w-48">
              <label className={labelCls}>Date</label>
              <input
                type="date"
                className={inputCls}
                value={notesData.date}
                onChange={(e) => setNotes('date', e.target.value)}
              />
            </div>

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
          {!view && (
            <Button onClick={() => setSelectedReport(null)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button onClick={downloadNotesPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Print Closing Notes
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
    handlingAppraiser: '',
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
    fuelType: '',
    mileage: 0,
    zip: '',
    radius: 200,
    claimTypes: [],
  }
}

// ── Subject-spec matching ────────────────────────────────────────────────────
// Comps must match the subject vehicle's specs by default. Matching is done
// client-side on the fetched listings (not via API params) so toggling a spec
// on/off is instant and never costs extra MarketCheck/Auto.dev calls.

type MatchKey = 'trim' | 'engine' | 'drivetrain' | 'transmission' | 'fuelType'

const MATCH_LABELS: Record<MatchKey, string> = {
  trim: 'Trim',
  engine: 'Engine',
  drivetrain: 'Drive',
  transmission: 'Trans',
  fuelType: 'Fuel',
}

// Transmission off by default: listing data is too noisy ("8-Speed Automatic"
// vs "Automatic") to be a useful default gate.
function defaultMatchSubject(): Record<MatchKey, boolean> {
  return { trim: true, engine: true, drivetrain: true, transmission: false, fuelType: true }
}

const normText = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Same trim, tolerant of suffix noise: "XLE" matches "XLE" and "XLE Premium"
// (every subject-trim word appears in the comp trim), but not "SE".
function matchesTrim(subject: string, comp: string): boolean {
  const s = normText(subject)
  const c = normText(comp)
  if (!s) return true
  if (!c) return false
  if (s === c) return true
  const compWords = c.split(' ')
  return s.split(' ').every((w) => compWords.includes(w))
}

// Compare engines on displacement + cylinder count so "2.5L I4" matches
// "4-Cyl, 2.5 Liter" but not "3.5L V6". Falls back to string containment
// when neither feature can be extracted.
function engineFeatures(s: string): { disp: string | null; cyl: string | null } {
  const t = normText(s)
  const disp = t.match(/(\d\.\d)\s*l?/)
  const cyl = t.match(/\b[vih]-?(\d{1,2})\b/) || t.match(/(\d{1,2})[\s-]*cyl/)
  return { disp: disp ? disp[1] : null, cyl: cyl ? cyl[1] : null }
}

function matchesEngine(subject: string, comp: string): boolean {
  const s = normText(subject)
  const c = normText(comp)
  if (!s) return true
  if (!c) return false
  const sf = engineFeatures(s)
  const cf = engineFeatures(c)
  if (sf.disp && cf.disp) {
    if (sf.disp !== cf.disp) return false
    if (sf.cyl && cf.cyl && sf.cyl !== cf.cyl) return false
    return true
  }
  if (sf.cyl && cf.cyl) return sf.cyl === cf.cyl
  return s === c || c.includes(s) || s.includes(c)
}

function normDrivetrain(s: string): string {
  const t = normText(s)
  if (!t) return ''
  if (/awd|4wd|4x4|all wheel|four wheel/.test(t)) return 'awd'
  if (/fwd|front/.test(t)) return 'fwd'
  if (/rwd|rear|4x2|2wd/.test(t)) return 'rwd'
  return t
}

function normTransmission(s: string): string {
  const t = normText(s)
  if (!t) return ''
  if (/manual|m t\b/.test(t)) return 'manual'
  // CVTs are grouped with automatics — sources label them inconsistently.
  if (/auto|cvt/.test(t)) return 'automatic'
  return t
}

function normFuel(s: string): string {
  const t = normText(s)
  if (!t) return ''
  if (/plug ?in|phev/.test(t)) return 'plug-in hybrid'
  if (/hybrid|hev/.test(t)) return 'hybrid'
  if (/electric|bev|^ev$/.test(t)) return 'electric'
  if (/diesel/.test(t)) return 'diesel'
  if (/flex|e85/.test(t)) return 'flex'
  if (/gas|petrol|unleaded/.test(t)) return 'gasoline'
  return t
}

function matchesSubjectSpec(key: MatchKey, subjectVal: string, compVal: string): boolean {
  switch (key) {
    case 'trim': return matchesTrim(subjectVal, compVal)
    case 'engine': return matchesEngine(subjectVal, compVal)
    case 'drivetrain': return normDrivetrain(compVal) === normDrivetrain(subjectVal)
    case 'transmission': return normTransmission(compVal) === normTransmission(subjectVal)
    case 'fuelType': return normFuel(compVal) === normFuel(subjectVal)
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
const COMP_FINDER_SESSION_KEY = 'modern-tools-comp-finder-draft'

function getCompFinderDraft(): { step: number; claim: ClaimInfo; listings: MarketComp[]; selectedIds: string[]; compAdjs: { mileageAdj: number; yearAdj: number }[]; adjustments: ACVAdjustments; editingId: string | null; reportsState?: ReportsState; mileageRate?: number; matchSubject?: Record<MatchKey, boolean> } | null {
  try {
    // localStorage so an in-progress claim survives closing the tab/browser.
    // Fall back to any older sessionStorage draft so nothing is lost on upgrade.
    const raw =
      localStorage.getItem(COMP_FINDER_SESSION_KEY) ??
      sessionStorage.getItem(COMP_FINDER_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

// Tab ↔ internal step mapping. Steps 1-4 are the original comp-finder wizard
// steps (Claim Info + the ACV stepper); 5/8/9 are the report views (Summary /
// Closing Notes / Award — one mounted ReportsStep behind all three); 6 is
// Loss Search (an option INSIDE the ACV tab); 7 is Estimate Dispute; 10 is
// Documents; 11 is Diminished Value; 12 is Reports (Invoice, more report
// types later). Two tab rows: claim rows (info/documents) on top, tool tabs
// below.
const CLAIM_TABS = [
  { id: 'info', label: 'Claim Info', step: 1 },
  { id: 'documents', label: 'Documents', step: 10 },
  { id: 'messages', label: 'Messages', step: 13 },
  { id: 'guidelines', label: 'Guidelines', step: 14 },
] as const

const TOOL_TABS = [
  { id: 'acv', label: 'ACV Report', step: 2 },
  { id: 'dv', label: 'Diminished Value', step: 11 },
  { id: 'award', label: 'Award', step: 9 },
  { id: 'notes', label: 'Closing Notes', step: 8 },
  { id: 'summary', label: 'Summary', step: 5 },
  { id: 'estimate', label: 'Estimate Dispute', step: 7 },
  { id: 'reports', label: 'Invoice', step: 12 },
] as const

function tabForStep(step: number): string {
  if (step === 1) return 'info'
  if (step === 10) return 'documents'
  if (step === 5) return 'summary'
  if (step === 8) return 'notes'
  if (step === 9) return 'award'
  if (step === 7) return 'estimate'
  if (step === 11) return 'dv'
  if (step === 12) return 'reports'
  if (step === 13) return 'messages'
  if (step === 14) return 'guidelines'
  return 'acv' // 2-4 stepper + 6 (Loss Search lives inside the ACV tab)
}

function stepForTab(tab: string | null): number | null {
  const all = [...CLAIM_TABS, ...TOOL_TABS]
  const t = all.find((x) => x.id === tab)
  if (t) return t.step
  if (tab === 'loss') return 6 // old deep links
  return null
}

// Claim workspace header — MA #/CL #/Vehicle/Client/Owner shown as equally-
// weighted stats rather than one big title + small subtitle.
function ClaimHeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
      <div className="text-base font-bold text-gray-900 break-words">{value || '—'}</div>
    </div>
  )
}

function ClaimWorkspaceInner({ claimId }: { claimId: string }) {
  const router = useRouter()
  const isNew = claimId === 'new'
  // The localStorage draft only applies to a brand-new claim. Hydrating it for
  // an existing id would show a different claim's in-progress work.
  const draft = useRef(isNew ? getCompFinderDraft() : null)
  const initialTab = useRef<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
  )
  // A brand-new claim shows ONLY Claim Info; the tool tabs unlock once the
  // claim exists (auto-save promotion or the Create Claim button).
  const [step, setStep] = useState(() => (isNew ? 1 : stepForTab(initialTab.current) ?? 1))
  const [claim, setClaim] = useState<ClaimInfo>(() => draft.current?.claim ?? defaultClaim())
  const [listings, setListings] = useState<MarketComp[]>(() => draft.current?.listings ?? [])
  // Stable lookup of every comp we've ever seen, so selected comps survive search replacements
  const compMapRef = useRef<Map<string, MarketComp>>(new Map())
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
  // On /claims/new any draft is content-only: never adopt a stale draft's row id.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reportsState, setReportsState] = useState<ReportsState>(
    () => draft.current?.reportsState ?? defaultReportsState(draft.current?.claim ?? defaultClaim())
  )
  const [mileageRate, setMileageRate] = useState(() => draft.current?.mileageRate ?? 0)
  const [sortBy, setSortBy] = useState<'default' | 'mileage-closest' | 'mileage-low' | 'mileage-high' | 'price-low' | 'price-high' | 'year-new' | 'year-old' | 'distance'>('default')
  const [activeFilters, setActiveFilters] = useState<{ trim: string[]; drivetrain: string[]; transmission: string[]; engine: string[]; fuelType: string[] }>({ trim: [], drivetrain: [], transmission: [], engine: [], fuelType: [] })
  // Which subject specs comps must match (toggleable chips above the results).
  const [matchSubject, setMatchSubject] = useState<Record<MatchKey, boolean>>(
    () => draft.current?.matchSubject ?? defaultMatchSubject()
  )
  const [compsPage, setCompsPage] = useState(1)
  const COMPS_PER_PAGE = 30
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Claim workspace additions: status, per-claim tool data, load state.
  const [status, setStatus] = useState<ClaimStatus>('open')
  // Role-based workflow state (Task 11). Writes go through /api/claims/[id]/*
  // routes — these setters only reflect what the API returned so the UI updates
  // without a full page reload.
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  // Hydrated for parity with the server row; not rendered yet. Future work will
  // surface "submitted by X" in the banner.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [submittedBy, setSubmittedBy] = useState<string | null>(null)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  // Insurance company names from the guidelines directory — fuels the
  // Insurance Company autocomplete so typed values match a guideline exactly.
  const [insuranceCompanyOptions, setInsuranceCompanyOptions] = useState<string[]>([])
  const { profile } = useCurrentProfile()
  const [allowCreateGlobal, setAllowCreateGlobal] = useState<boolean | null>(null)
  useEffect(() => {
    fetchSiteSetting<boolean>('allow_regular_create_claims').then(v => setAllowCreateGlobal(v ?? true))
  }, [])
  // Direct-URL guard: if a non-admin without the create grant lands on
  // /claims/new (e.g. bookmark, address-bar), silently bounce to the
  // dashboard. RLS blocks the insert anyway; this just prevents a
  // confusing dead-end form. Waits until profile + master flag are both
  // loaded to avoid a flash-redirect on slow connections.
  useEffect(() => {
    if (!isNew) return
    if (profile === null) return          // still loading
    if (allowCreateGlobal === null) return
    const canCreate =
      profile.role === 'admin' ||
      (allowCreateGlobal && profile.canCreateClaims === true)
    if (!canCreate) router.replace('/')
  }, [isNew, profile, allowCreateGlobal, router])
  const role = profile?.role
  const isAdmin = role === 'admin'
  const userId = profile?.id
  const isAssignee = !!userId && assignedTo === userId
  const isSubmitted = !!submittedAt
  const isClosed = status === 'closed'
  // NOTE: `!isNew` is critical — a brand-new claim has no assignee yet, so
  // without this an appraiser creating a claim would flunk the `isAssignee`
  // check and get a fully-disabled form (couldn't type, couldn't upload the
  // assignment PDF, couldn't do anything).
  const readOnly = !isAdmin && !isNew && (isSubmitted || isClosed || (!!userId && !isAssignee))
  const [auctionListings, setAuctionListings] = useState<LossListing[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [estimate, setEstimate] = useState<any>(undefined)
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [dv, setDv] = useState<DVState | null>(null)
  const [invoice, setInvoice] = useState<InvoiceReportState | null>(null)
  // Preserve a legacy row's mode ('auto-acv' / 'auction') on save so nothing churns.
  const modeRef = useRef<string>('comp-finder')
  const [loadingClaim, setLoadingClaim] = useState(!isNew)
  const [claimNotFound, setClaimNotFound] = useState(false)
  // Set when a /claims/new session is promoted to a real row: the URL swap to
  // /claims/{id} must not trigger a refetch that clobbers in-memory search results.
  const promotedIdRef = useRef<string | null>(null)

  // Keep comp map in sync with listings
  useEffect(() => {
    listings.forEach(comp => compMapRef.current.set(comp.id, comp))
  }, [listings])

  // Load the claim by id from Supabase (replaces the old sessionStorage handoff).
  useEffect(() => {
    if (claimId === 'new') return
    if (claimId === promotedIdRef.current) return
    promotedIdRef.current = null
    let cancelled = false
    setLoadingClaim(true)
    setClaimNotFound(false)
    fetchACVEntry(claimId).then(entry => {
      if (cancelled) return
      if (!entry) {
        setClaimNotFound(true)
        setLoadingClaim(false)
        return
      }
      localStorage.removeItem(COMP_FINDER_SESSION_KEY)
      // Fully replace any in-progress draft state — including comps. Leaving
      // the old draft's listings in place when the opened claim had no saved
      // comps showed a different vehicle's comps on this claim.
      compMapRef.current.clear()
      setClaim(entry.claim)
      // Restore saved Award / Closing Notes state; fall back to defaults for older entries.
      setReportsState(entry.reportsState ?? defaultReportsState(entry.claim))
      setMileageRate(entry.mileageRate ?? 0)
      setAdjustments(entry.adjustments)
      setEditingId(entry.id)
      setStatus(entry.status ?? 'open')
      setAssignedTo(entry.assignedTo ?? null)
      setSubmittedAt(entry.submittedAt ?? null)
      setSubmittedBy(entry.submittedBy ?? null)
      setAuctionListings((entry.auctionListings as LossListing[] | undefined) ?? [])
      setEstimate(entry.estimate)
      setDocuments((entry.documents as ClaimDocument[] | undefined) ?? [])
      setDv((entry.dv as DVState | undefined) ?? null)
      setInvoice((entry.invoice as InvoiceReportState | undefined) ?? null)
      modeRef.current = entry.mode || 'comp-finder'
      const comps = entry.comps ?? []
      setListings(comps)
      setSelectedIds(comps.map(c => c.id))
      const adjs = comps.map(c => ({
        mileageAdj: c.mileageAdjDollar ?? 0,
        yearAdj: c.yearAdjDollar ?? 0,
      }))
      while (adjs.length < 3) adjs.push({ mileageAdj: 0, yearAdj: 0 })
      setCompAdjs(adjs)
      setStep(stepForTab(initialTab.current) ?? (comps.length > 0 ? 4 : 1))
      initialTab.current = null
      setLoadingClaim(false)
    })
    return () => { cancelled = true }
  }, [claimId])

  // Persist form state to localStorage so it survives closing the tab/browser.
  // Only the selected + manual comps are stored (not the full search results):
  // a large listings array could blow the ~5MB localStorage quota and make the
  // save silently fail, losing everything.
  useEffect(() => {
    // Draft only exists for a brand-new claim; once a row exists (or an
    // existing claim is open) Supabase auto-save is the source of truth.
    if (!isNew || editingId) return
    try {
      const draftListings = listings.filter(
        (l) => selectedIds.includes(l.id) || l.id.startsWith('manual-')
      )
      localStorage.setItem(COMP_FINDER_SESSION_KEY, JSON.stringify({
        step, claim, listings: draftListings, selectedIds, compAdjs, adjustments, editingId, reportsState, mileageRate, matchSubject,
      }))
    } catch { /* ignore */ }
  }, [isNew, step, claim, listings, selectedIds, compAdjs, adjustments, editingId, reportsState, mileageRate, matchSubject])

  // NOTE: there used to be an effect here that reset reportsState whenever
  // claim.maNumber changed. It wiped the Opposing Appraiser / Award / Notes
  // data any time the MA number was typed or corrected after those fields were
  // filled. Reports state is now reset only by Start Over / opening a claim.

  // Track unsaved changes + debounced auto-save to Supabase, so Award /
  // Closing Notes / Summary edits survive leaving the claim without a manual
  // "Save Claim" click.
  const initialLoadDone = useRef(false)
  const editingIdRef = useRef(editingId)
  useEffect(() => { editingIdRef.current = editingId }, [editingId])
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      return
    }
    // Nothing identifiable to save yet — don't create junk history entries.
    if (!claim.maNumber && !claim.insuredName) return
    // Don't fire while a claim is still loading from Supabase.
    if (loadingClaim || claimNotFound) return
    // Read-only viewers (non-admin, and not the assignee, or claim is
    // submitted/closed) must not trigger writes — the server would reject.
    if (readOnly) return
    // For a BRAND-NEW claim (never saved), require an explicit "Create
    // Claim" click before auto-save kicks in. Prevents accidental creation
    // while the user is mid-typing / uploading the assignment PDF.
    // Once editingId is set (either loaded from URL or promoted after
    // Create Claim), auto-save runs normally.
    if (!editingIdRef.current) return
    setHasUnsavedChanges(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      // Assign the id synchronously so overlapping saves can't create duplicates.
      let id = editingIdRef.current
      if (!id) {
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        editingIdRef.current = id
        setEditingId(id)
      }
      saveToHistory(claim, builtComps, adjustments, result, modeRef.current, id, mileageRate, reportsState, { status, auctionListings, estimate, documents, dv, invoice })
        .then(() => {
          setHasUnsavedChanges(false)
          // Promote a /claims/new session to its real URL after the first save.
          if (isNew && id) {
            promotedIdRef.current = id
            localStorage.removeItem(COMP_FINDER_SESSION_KEY)
            router.replace(`/claims/${id}`, { scroll: false })
          }
        })
        .catch(() => { /* keep the unsaved badge if the save failed */ })
    }, 2000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, selectedIds, compAdjs, adjustments, reportsState, mileageRate, status, auctionListings, estimate, documents, dv, invoice])

  // Keep ?tab= in the URL in sync (survives refresh, deep-linkable) without
  // triggering a Next.js navigation.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabForStep(step))
    window.history.replaceState(null, '', url.toString())
  }, [step])

  // Live duplicate check on VIN + Claim # against every other claim in the
  // system (uses service-role backend so appraisers see cross-team dupes,
  // not just their own). Debounced 500ms. Excludes the current claim's own
  // id when editing an existing one so it doesn't self-match.
  const duplicates = useDuplicateCheck(claim.vin, claim.claimNumber, editingId)

  // Filter which tool tabs to show based on claim.claimTypes. Award / Notes /
  // Summary / Invoice are always visible (they finalize any claim type).
  // ACV / DV / Estimate Dispute are gated by type. Empty claimTypes = show
  // all tools (backward compat for pre-existing claims).
  const visibleToolTabs = useMemo(() => {
    const types = claim.claimTypes ?? []
    if (types.length === 0) return TOOL_TABS
    const other = types.includes('other')
    return TOOL_TABS.filter(t => {
      if (t.id === 'award' || t.id === 'notes' || t.id === 'summary' || t.id === 'reports') return true
      if (t.id === 'acv')      return other || types.includes('acv')
      if (t.id === 'dv')       return other || types.includes('dv')
      if (t.id === 'estimate') return other || types.includes('estimate')
      return true
    })
  }, [claim.claimTypes])

  const sortedListings = useMemo(() => {
    const filtered = listings.filter((comp) => {
      // Subject-spec matching (default on). Manual comps are always kept —
      // Henry entered them deliberately.
      if (!comp.id.startsWith('manual-')) {
        for (const key of Object.keys(MATCH_LABELS) as MatchKey[]) {
          const subjectVal = claim[key]
          if (matchSubject[key] && subjectVal && !matchesSubjectSpec(key, subjectVal, comp[key] || '')) {
            return false
          }
        }
      }
      if (activeFilters.trim.length > 0 && !activeFilters.trim.includes(comp.trim || '')) return false
      if (activeFilters.drivetrain.length > 0 && !activeFilters.drivetrain.includes(comp.drivetrain || '')) return false
      if (activeFilters.transmission.length > 0 && !activeFilters.transmission.includes(comp.transmission || '')) return false
      if (activeFilters.engine.length > 0 && !activeFilters.engine.includes(comp.engine || '')) return false
      if (activeFilters.fuelType.length > 0 && !activeFilters.fuelType.includes(comp.fuelType || '')) return false
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
  }, [listings, sortBy, claim, activeFilters, matchSubject])

  const selectedComps = selectedIds
    .map((id) => listings.find((l) => l.id === id) ?? compMapRef.current.get(id))
    .filter((c): c is MarketComp => !!c)

  // Search results excluding already-selected comps (those are pinned at the top).
  const unselectedListings = sortedListings.filter((l) => !selectedIds.includes(l.id))

  const builtComps: SelectedComp[] = selectedComps.map((comp, i) => {
    const adj = compAdjs[i] ?? { mileageAdj: 0, yearAdj: 0 }
    const price = Number(comp.price)
    const miles = Number(comp.miles)
    const year = Number(comp.year)
    return {
      ...comp,
      price,
      miles,
      year,
      mileageDiffRaw: miles - claim.mileage,
      mileageAdjDollar: adj.mileageAdj,
      yearDiffRaw: year - claim.year,
      yearAdjDollar: adj.yearAdj,
      compValue: calculateCompValue({
        price,
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
    setCompsPage(1)
    setListings([])
    setActiveFilters({ trim: [], drivetrain: [], transmission: [], engine: [], fuelType: [] })
    try {
      const isNationwide = claim.radius === 0
      const params = new URLSearchParams({
        year: String(claim.year),
        make: claim.make,
        model: claim.model,
        radius: String(claim.radius),
        ...(isNationwide ? { nationwide: 'true' } : { zip: claim.zip }),
        // Trim/engine/drivetrain are intentionally NOT sent to the API.
        // We fetch the full year/make/model result set once and match specs
        // client-side, so the "Match" toggles work without extra API calls.
      })
      const res = await fetch(`/api/acv/search-comps?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Search failed')
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const seen = new Set<string>()
      const accumulated: MarketComp[] = []
      let buffer = ''
      let streamError: string | null = null

      const flush = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        let msg: { type: string; listings?: MarketComp[]; error?: string }
        try {
          msg = JSON.parse(trimmed)
        } catch {
          return
        }
        if (msg.type === 'listings' && Array.isArray(msg.listings)) {
          let added = false
          for (const l of msg.listings) {
            if (!l.price || l.price <= 0) continue
            if (!l.vin || seen.has(l.vin)) continue
            seen.add(l.vin)
            accumulated.push(l)
            added = true
          }
          if (added) setListings([...accumulated])
        } else if (msg.type === 'error') {
          streamError = msg.error || 'Search failed'
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) flush(line)
      }
      if (buffer) flush(buffer)

      if (streamError) throw new Error(streamError)
      if (accumulated.length === 0) {
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
      if (prev.length >= 3) return prev // max 3 comps
      return [...prev, id]
    })
  }

  const [showManualComp, setShowManualComp] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)
  const emptyManualComp = { price: 0, mileage: '', year: '', make: '', model: '', trim: '', vin: '', dealerName: '', dealerPhone: '', link: '' }
  const [manualComp, setManualComp] = useState(emptyManualComp)

  const addManualComp = () => {
    const price = manualComp.price
    const miles = parseInt(manualComp.mileage) || 0
    const year = parseInt(manualComp.year) || claim.year
    if (price <= 0) return
    const id = editingManualId || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    const comp: MarketComp = {
      id,
      vin: manualComp.vin,
      price,
      miles,
      year,
      make: manualComp.make || claim.make,
      model: manualComp.model || claim.model,
      trim: manualComp.trim,
      engine: '',
      drivetrain: '',
      transmission: '',
      fuelType: '',
      dealerName: manualComp.dealerName,
      dealerPhone: manualComp.dealerPhone,
      dealerCity: '',
      dealerState: '',
      photoUrl: '',
      heading: '',
      distanceMi: 0,
      vdpUrl: manualComp.link,
    }
    if (editingManualId) {
      setListings((prev) => prev.map((l) => l.id === editingManualId ? comp : l))
    } else {
      setListings((prev) => [comp, ...prev])
      setSelectedIds((prev) => {
        if (prev.length >= 3) return prev
        return [...prev, id]
      })
    }
    setManualComp(emptyManualComp)
    setEditingManualId(null)
    setShowManualComp(false)
  }

  const editManualComp = (comp: MarketComp) => {
    setEditingManualId(comp.id)
    setManualComp({
      price: Number(comp.price),
      mileage: String(comp.miles),
      year: String(comp.year),
      make: comp.make,
      model: comp.model,
      trim: comp.trim,
      vin: comp.vin,
      dealerName: comp.dealerName,
      dealerPhone: comp.dealerPhone,
      link: comp.vdpUrl,
    })
    setShowManualComp(true)
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
    // Update notes with mileage rate line
    setAdjustments(prev => {
      const mileageLine = `Mileage adjustment based on ${rate.toFixed(2)} cents per mile.`
      const mileageRegex = /Mileage adjustment based on [\d.]+ cents per mile\./
      let notes = prev.notes
      if (mileageRegex.test(notes)) {
        notes = rate > 0 ? notes.replace(mileageRegex, mileageLine) : notes.replace(mileageRegex, '').trim()
      } else if (rate > 0) {
        notes = notes ? `${notes.trimEnd()} ${mileageLine}` : mileageLine
      }
      return { ...prev, notes }
    })
    if (rate === 0) return
    setCompAdjs((prev) => {
      const next = selectedComps.map((comp, i) => {
        // Guard against missing miles / short prev arrays (claims saved with
        // <3 comps) — either produced $NaN on the extra comp.
        const mileageDiff = (Number(comp.miles) || 0) - (Number(claim.mileage) || 0)
        // Comp has more miles → worth less → add to make comparable; less miles → subtract
        const mileageAdj = Math.round(mileageDiff * rate * 100) / 100
        return { ...(prev[i] ?? { mileageAdj: 0, yearAdj: 0 }), mileageAdj }
      })
      while (next.length < 3) next.push({ mileageAdj: 0, yearAdj: 0 })
      return next
    })
  }

  const claimVehicle = [claim.year || '', claim.make, claim.model].filter(Boolean).join(' ')

  const saveExtras = { status, auctionListings, estimate, documents, dv, invoice }

  // Auto-file a generated/printed report PDF into the claim's Documents tab.
  // Always numbers files of the same source per claim ("MA1234-award (1).pdf",
  // "MA1234-award (2).pdf", ...) so Henry can distinguish multiple saves of the
  // same report type (an updated award, a revised summary, etc).
  const addDocument = async (blob: Blob, name: string, source: ClaimDocument['source']) => {
    const id = editingIdRef.current
    if (!id) return
    const seq = documents.filter(d => d.source === source).length + 1
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    const numbered = `${stem} (${seq})${ext}`
    const doc = await uploadClaimDocument(id, blob, numbered, source)
    if (doc) setDocuments(prev => [...prev, doc])
  }

  const handleSaveClaim = async () => {
    if (builtComps.length < 1) return
    const savedId = await saveToHistory(claim, builtComps, adjustments, result, modeRef.current, editingId, mileageRate, reportsState, saveExtras)
    if (!editingId) setEditingId(savedId)
    editingIdRef.current = savedId
    setHasUnsavedChanges(false)
  }

  // Task 11 workflow: Submit / Approve / Send Back / Reopen. Writes go through
  // dedicated API routes so the column-guard trigger enforces role-based rules.
  // After each action we refetch the entry to sync the local UI with whatever
  // the server actually persisted.
  //
  // Confirmation is done via the in-app ConfirmDialog (see JSX below) rather
  // than the browser confirm() popup. `pendingWorkflow` holds the current
  // pending action; the dialog reads title/message from a lookup table.
  interface PendingWorkflow {
    path: 'submit' | 'approve' | 'send-back' | 'reopen'
    title: string
    message: string
    confirmLabel: string
    variant: 'primary' | 'danger'
  }
  const [pendingWorkflow, setPendingWorkflow] = useState<PendingWorkflow | null>(null)

  const runWorkflow = async () => {
    if (!pendingWorkflow) return
    if (!editingId) { setPendingWorkflow(null); return }
    const path = pendingWorkflow.path
    setWorkflowBusy(true)
    const res = await fetch(`/api/claims/${editingId}/${path}`, { method: 'POST' })
    setWorkflowBusy(false)
    setPendingWorkflow(null)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      alert((b as { error?: string }).error ?? 'Action failed')
      return
    }
    const fresh = await fetchACVEntry(editingId)
    if (fresh) {
      setStatus(fresh.status ?? 'open')
      setAssignedTo(fresh.assignedTo ?? null)
      setSubmittedAt(fresh.submittedAt ?? null)
      setSubmittedBy(fresh.submittedBy ?? null)
    }
  }

  const handleSubmit = () => setPendingWorkflow({
    path: 'submit',
    title: 'Submit this claim for admin review?',
    message: 'You will not be able to edit the claim after submitting. Only an admin can then approve it or send it back.',
    confirmLabel: 'Submit',
    variant: 'primary',
  })
  const handleApprove = () => setPendingWorkflow({
    path: 'approve',
    title: 'Approve and close this claim?',
    message: 'The claim will be marked closed and move to the All Claims list.',
    confirmLabel: 'Approve',
    variant: 'primary',
  })
  const handleSendBack = () => setPendingWorkflow({
    path: 'send-back',
    title: 'Send this claim back to the appraiser?',
    message: 'The appraiser will be able to edit the claim again and re-submit.',
    confirmLabel: 'Send Back',
    variant: 'primary',
  })
  const handleReopen = () => setPendingWorkflow({
    path: 'reopen',
    title: 'Reopen this closed claim?',
    message: 'The claim will return to the Open Claims list. Any prior submission history is cleared.',
    confirmLabel: 'Reopen',
    variant: 'primary',
  })

  // Admin needs the list of users for the Reassign popover; skip the fetch for
  // non-admins to avoid the extra roundtrip on every workspace load.
  useEffect(() => {
    // Fetch profiles regardless of role: admins use them for the Reassign
    // popover; everyone needs them to resolve the assignee's name for the
    // Assignment Sheet's "Handling (Us)" line.
    let cancelled = false
    fetchAllProfilesBrowser().then(list => { if (!cancelled) setAllProfiles(list) })
    fetchGuidelineNamesBrowser().then(names => { if (!cancelled) setInsuranceCompanyOptions(names) })
    return () => { cancelled = true }
  }, [])

  // Reassign flow (admin-only): the toolbar button opens a popover of
  // appraisers. Selecting one arms a ConfirmDialog. Confirming POSTs to the
  // assign API, refetches, and updates local state (no full page reload).
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignBusy, setReassignBusy] = useState(false)
  const [pendingReassign, setPendingReassign] = useState<{ id: string | null; label: string } | null>(null)
  const reassignRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!reassignOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (reassignRef.current && !reassignRef.current.contains(e.target as Node)) {
        setReassignOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [reassignOpen])

  const pickReassignee = (id: string | null, label: string) => {
    setReassignOpen(false)
    setPendingReassign({ id, label })
  }

  const runReassign = async () => {
    if (!pendingReassign || !editingId) { setPendingReassign(null); return }
    setReassignBusy(true)
    const res = await fetch(`/api/claims/${editingId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: pendingReassign.id }),
    })
    setReassignBusy(false)
    setPendingReassign(null)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      alert((b as { error?: string }).error ?? 'Reassign failed')
      return
    }
    const fresh = await fetchACVEntry(editingId)
    if (fresh) setAssignedTo(fresh.assignedTo ?? null)
  }

  const handleVinDecoded = async (updatedClaim: ClaimInfo) => {
    // Save with the CURRENT comps/result — previously this saved an empty
    // comps array, wiping the claim's saved comps whenever a VIN was re-decoded.
    const savedId = await saveToHistory(updatedClaim, builtComps, adjustments, result, modeRef.current, editingId, mileageRate, reportsState, saveExtras)
    if (!editingId) setEditingId(savedId)
    editingIdRef.current = savedId
  }

  // Explicit creation from /claims/new: save the claim row now and swap to its
  // real URL, which unlocks the tool tabs.
  const [creatingClaim, setCreatingClaim] = useState(false)
  const createClaim = async () => {
    if (!claim.maNumber && !claim.insuredName) return
    setCreatingClaim(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    let id = editingIdRef.current
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      editingIdRef.current = id
      setEditingId(id)
    }
    await saveToHistory(claim, builtComps, adjustments, result, modeRef.current, id, mileageRate, reportsState, saveExtras)
    setHasUnsavedChanges(false)
    promotedIdRef.current = id
    localStorage.removeItem(COMP_FINDER_SESSION_KEY)
    router.replace(`/claims/${id}?tab=info`, { scroll: false })
    setCreatingClaim(false)
  }

  const startOver = () => {
    // Cancel any pending auto-save so the cleared claim isn't resurrected.
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    localStorage.removeItem(COMP_FINDER_SESSION_KEY)
    // A full navigation remounts the workspace with a clean slate. The current
    // claim's data stays saved in Supabase.
    window.location.href = '/claims/new'
  }

  if (claimNotFound) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-16 text-center">
          <p className="text-gray-500 mb-4">Claim not found. It may have been deleted.</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm font-medium">Back to Dashboard</Link>
        </main>
      </div>
    )
  }

  if (loadingClaim) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-16 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading claim...
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          {!isNew && editingId && (
            <button
              type="button"
              onClick={() => triggerAssignmentSheetPrint(`${claim.maNumber || 'claim'}-assignment-sheet.pdf`)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              title="Print the assignment sheet"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
          {!readOnly && hasUnsavedChanges && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Unsaved changes</span>
              <Button
                onClick={handleSaveClaim}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Save Changes
              </Button>
            </div>
          )}
          {/* Task 11: role-aware workflow buttons. Anchored right when there
              are no unsaved-changes buttons already claiming ml-auto. */}
          {!isNew && editingId && (
            <div className={cn('flex items-center gap-2', !hasUnsavedChanges && 'ml-auto')}>
              {!isSubmitted && !isClosed && (isAssignee || isAdmin) && (
                <Button
                  onClick={handleSubmit}
                  disabled={workflowBusy}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Submit
                </Button>
              )}
              {isAdmin && isSubmitted && !isClosed && (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={workflowBusy}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={handleSendBack}
                    disabled={workflowBusy}
                    size="sm"
                    variant="outline"
                  >
                    Send Back
                  </Button>
                </>
              )}
              {isAdmin && isClosed && (
                <Button
                  onClick={handleReopen}
                  disabled={workflowBusy}
                  size="sm"
                  variant="outline"
                >
                  Reopen
                </Button>
              )}
              {(isAdmin || (profile?.canReassignClaims && isAssignee)) && (
                <div className="relative" ref={reassignRef}>
                  <Button
                    onClick={() => setReassignOpen(o => !o)}
                    disabled={workflowBusy || reassignBusy}
                    size="sm"
                    variant="outline"
                  >
                    Reassign
                  </Button>
                  {reassignOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-72 overflow-y-auto">
                      {allProfiles.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400 italic">
                          No appraisers available
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => pickReassignee(null, 'Unassigned')}
                            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 italic"
                          >
                            — Unassigned —
                          </button>
                          <div className="border-t border-gray-100" />
                          {allProfiles.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => pickReassignee(p.id, p.name || p.email)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{p.name || p.email}</span>
                              {p.id === assignedTo && (
                                <span className="text-xs text-gray-400 shrink-0">current</span>
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!pendingWorkflow}
          title={pendingWorkflow?.title ?? ''}
          message={pendingWorkflow?.message ?? ''}
          confirmLabel={pendingWorkflow?.confirmLabel ?? 'Confirm'}
          variant={pendingWorkflow?.variant ?? 'primary'}
          busy={workflowBusy}
          onConfirm={runWorkflow}
          onCancel={() => setPendingWorkflow(null)}
        />

        <ConfirmDialog
          open={!!pendingReassign}
          title="Reassign this claim?"
          message={
            pendingReassign ? (
              <>This claim will be assigned to <b>{pendingReassign.label}</b>.</>
            ) : ''
          }
          confirmLabel="Reassign"
          busy={reassignBusy}
          onConfirm={runReassign}
          onCancel={() => setPendingReassign(null)}
        />

        {isNew ? (
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-6">New Claim</h1>
        ) : (
          <div className="mb-6 bg-white rounded-xl shadow-sm px-6 py-4">
            {/* Responsive grid: 2 cols on small screens, 3 on medium, 5 on wide.
                Long values (Vehicle, Client, Owner) wrap within their cell
                instead of being truncated with an ellipsis. */}
            <div className="grid gap-x-8 gap-y-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {[
                { label: 'MA #', value: claim.maNumber },
                { label: 'CL #', value: claim.claimNumber },
                { label: 'Vehicle', value: claimVehicle },
                { label: 'Client', value: claim.clientName },
                { label: 'Owner', value: claim.insuredName },
              ].map((stat) => (
                <ClaimHeaderStat key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
          </div>
        )}

        {/* Task 11: submitted read-only banner for non-admins. Admins still see
            Approve / Send Back in the toolbar so they don't need this notice. */}
        {isSubmitted && !isAdmin && submittedAt && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            Submitted on {new Date(submittedAt).toLocaleString()}. Waiting on admin review.
            This claim is read-only until an admin sends it back or approves it.
          </div>
        )}

        {/* Duplicate banner — visible on any saved claim whose VIN or Claim #
            matches another claim in the system. */}
        {!isNew && (duplicates.vinMatches.length > 0 || duplicates.claimNumberMatches.length > 0) && (
          <DuplicateBanner duplicates={duplicates} />
        )}

        {/* Tabs — hidden until the claim exists. Two rows: claim information
            (Claim Info / Documents) on top, the tools below. */}
        {!isNew && (
        <div className="mb-6">
          <div className="flex items-center justify-center gap-12 mb-5 border-b border-gray-200">
            {CLAIM_TABS.map((tab) => {
              const active = tabForStep(step) === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.step)}
                  className={cn(
                    'pb-3 text-lg font-bold whitespace-nowrap border-b-2 -mb-px transition-colors',
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-center flex-wrap gap-x-8 gap-y-1 border-b border-gray-200">
            {visibleToolTabs.map((tab) => {
              const active = tabForStep(step) === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.step)}
                  className={cn(
                    'pb-3 text-base font-bold whitespace-nowrap border-b-2 -mb-px transition-colors',
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* ACV tab: Comp Finder vs Loss Search selector */}
        {tabForStep(step) === 'acv' && !isNew && (
          <div className="flex items-center gap-2 mb-5">
            <button
              type="button"
              onClick={() => setStep(6 === step ? 2 : step >= 2 && step <= 4 ? step : 2)}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                step !== 6 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              Comp Finder
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                step === 6 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              Loss Search
            </button>
          </div>
        )}

        {/* ACV Report internal stepper (Select Comps → Adjustments → Review) */}
        {step >= 2 && step <= 4 && (
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {['Select Comps', 'Adjustments', 'Review & Generate'].map((label, i) => {
              const n = i + 2
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
                    {done ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                    {label}
                  </button>
                  {i < 2 && (
                    <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Task 11: read-only for non-admins when claim is submitted, closed,
            or assigned to someone else. The tab bar above stays clickable so
            the user can still navigate around and view. */}
        <fieldset disabled={readOnly} className="border-0 p-0 m-0 min-w-0">
        {/* Step 1: Claim Info + Opposing Appraiser */}
        {step === 1 && (
          <div>
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Claim Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <ClaimInfoForm
                  claim={claim}
                  onChange={setClaim}
                  insuranceCompanyOptions={insuranceCompanyOptions}
                  duplicates={duplicates}
                  isNew={isNew}
                  canEdit={isAdmin || profile?.canEditClaimInfo === true}
                />
                <div className="border-t border-gray-100 pt-8">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">Opposing Appraiser</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Opposing Appraiser Name</label>
                      <input
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={reportsState.notesData.appraiserName}
                        onChange={(e) => {
                          const value = e.target.value
                          const parts = value.trim().split(/\s+/)
                          const lastName = parts.length > 1 ? parts[parts.length - 1] : value.trim()
                          setReportsState(prev => ({
                            ...prev,
                            notesData: { ...prev.notesData, appraiserName: value, appraiserLastName: lastName },
                            awardData: { ...prev.awardData, signatureBlock2: [value, prev.notesData.appraiserCompany].filter(Boolean).join('\n') },
                          }))
                        }}
                        placeholder="First Last"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Opposing Appraiser Company</label>
                      <input
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={reportsState.notesData.appraiserCompany}
                        onChange={(e) => {
                          const company = e.target.value
                          setReportsState(prev => ({
                            ...prev,
                            notesData: { ...prev.notesData, appraiserCompany: company },
                            awardData: { ...prev.awardData, signatureBlock2: [prev.notesData.appraiserName, company].filter(Boolean).join('\n') },
                          }))
                        }}
                        placeholder="Firm / appraisal company"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            {isNew && (
              <div className="flex justify-end mt-6">
                <Button
                  onClick={createClaim}
                  disabled={creatingClaim || (!claim.maNumber && !claim.insuredName)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  {creatingClaim ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Claim
                </Button>
              </div>
            )}
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
              duplicates={duplicates}
            />

            {/* Manual comp entry */}
            {!showManualComp && selectedIds.length < 3 && (
              <button
                onClick={() => { setEditingManualId(null); setManualComp(emptyManualComp); setShowManualComp(true) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Manual Comp
              </button>
            )}
            {showManualComp && (
              <Card className="bg-white border-blue-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-gray-900 text-sm">{editingManualId ? 'Edit Manual Comp' : 'Add Manual Comp'}</CardTitle>
                    <button onClick={() => { setShowManualComp(false); setEditingManualId(null); setManualComp(emptyManualComp) }} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Row 1: Price, Mileage, VIN */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Price *</label>
                        <CurrencyInput
                          placeholder="25000"
                          value={manualComp.price}
                          onChange={(val) => setManualComp(p => ({ ...p, price: val }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mileage</label>
                        <input
                          type="number"
                          placeholder="50000"
                          value={manualComp.mileage}
                          onChange={(e) => setManualComp(p => ({ ...p, mileage: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">VIN</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={manualComp.vin}
                          onChange={(e) => setManualComp(p => ({ ...p, vin: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {/* Row 2: Year, Make, Model, Trim */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Year</label>
                        <input
                          type="number"
                          placeholder={String(claim.year || new Date().getFullYear())}
                          value={manualComp.year}
                          onChange={(e) => setManualComp(p => ({ ...p, year: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Make</label>
                        <input
                          type="text"
                          placeholder={claim.make || 'Make'}
                          value={manualComp.make}
                          onChange={(e) => setManualComp(p => ({ ...p, make: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Model</label>
                        <input
                          type="text"
                          placeholder={claim.model || 'Model'}
                          value={manualComp.model}
                          onChange={(e) => setManualComp(p => ({ ...p, model: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Trim</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={manualComp.trim}
                          onChange={(e) => setManualComp(p => ({ ...p, trim: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {/* Row 3: Dealer Name, Dealer Phone, Listing URL */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dealer Name</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={manualComp.dealerName}
                          onChange={(e) => setManualComp(p => ({ ...p, dealerName: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dealer Phone</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={manualComp.dealerPhone}
                          onChange={(e) => setManualComp(p => ({ ...p, dealerPhone: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Listing URL</label>
                        <input
                          type="text"
                          placeholder="https://..."
                          value={manualComp.link}
                          onChange={(e) => setManualComp(p => ({ ...p, link: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {/* Add/Update button */}
                    <div className="flex justify-end">
                      <Button
                        onClick={addManualComp}
                        disabled={!manualComp.price || manualComp.price <= 0}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6"
                      >
                        {editingManualId ? <Check className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                        {editingManualId ? 'Update Comp' : 'Add Comp'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pinned selected comps — kept visible even after a new search replaces the results */}
            {selectedComps.length > 0 && (
              <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">
                    Selected Comps <span className="text-blue-600">{selectedComps.length}/3</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {selectedComps.map((comp, i) => (
                    <CompCard
                      key={comp.id}
                      comp={comp}
                      selected={true}
                      selectionIndex={i + 1}
                      onToggle={() => toggleComp(comp.id)}
                      disabled={false}
                      onEdit={comp.id.startsWith('manual-') ? () => editManualComp(comp) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Subject-spec match toggles — shown whenever we have results so
                filters can be relaxed even when they exclude everything */}
            {listings.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 shrink-0">
                  Match
                </span>
                {(Object.keys(MATCH_LABELS) as MatchKey[]).map((key) => {
                  const subjectVal = claim[key]
                  if (!subjectVal) return null
                  const active = matchSubject[key]
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setMatchSubject((prev) => ({ ...prev, [key]: !prev[key] }))
                        setCompsPage(1)
                      }}
                      title={active
                        ? `Only showing comps matching the subject's ${MATCH_LABELS[key].toLowerCase()} — click to include others`
                        : `Click to only show comps matching the subject's ${MATCH_LABELS[key].toLowerCase()}`}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all',
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 line-through decoration-gray-400'
                      )}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {MATCH_LABELS[key]}: {subjectVal}
                    </button>
                  )
                })}
                <span className="text-[11px] text-gray-400 ml-1">
                  {sortedListings.length} of {listings.length} listings match
                </span>
              </div>
            )}

            {/* Everything filtered out — tell Henry how to widen instead of showing a blank page */}
            {!loadingComps && unselectedListings.length === 0 && listings.some((l) => !selectedIds.includes(l.id)) && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                No unselected listings match the subject vehicle&apos;s specs. Click a Match chip above to
                include other {MATCH_LABELS.trim.toLowerCase()}s/options, or add a manual comp.
              </div>
            )}

            {/* Results header */}
            {unselectedListings.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-bold text-gray-900">{Math.min(COMPS_PER_PAGE, unselectedListings.length - (compsPage - 1) * COMPS_PER_PAGE)}</span> of {unselectedListings.length} listings
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
                      onClick={() => { setSortBy(value); setCompsPage(1) }}
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
                {(['trim', 'drivetrain', 'transmission', 'engine', 'fuelType'] as const).map((field) => {
                  const unique = [...new Set(listings.map((l) => l[field] || '').filter(Boolean))].sort()
                  if (unique.length < 2) return null
                  const labelMap: Record<string, string> = { drivetrain: 'Drive', fuelType: 'Fuel' }
                  return (
                    <div key={field} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20 shrink-0">
                        {labelMap[field] || (field.charAt(0).toUpperCase() + field.slice(1))}
                      </span>
                      {unique.map((val) => {
                        const active = activeFilters[field].includes(val)
                        return (
                          <button
                            key={val}
                            onClick={() => {
                              setActiveFilters((prev) => ({
                                ...prev,
                                [field]: active
                                  ? prev[field].filter((v) => v !== val)
                                  : [...prev[field], val],
                              }))
                              setCompsPage(1)
                            }}
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
                          onClick={() => { setActiveFilters((prev) => ({ ...prev, [field]: [] })); setCompsPage(1) }}
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

            {!loadingComps && unselectedListings.length > 0 && (() => {
              const totalPages = Math.ceil(unselectedListings.length / COMPS_PER_PAGE)
              const pageComps = unselectedListings.slice((compsPage - 1) * COMPS_PER_PAGE, compsPage * COMPS_PER_PAGE)
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {pageComps.map((comp) => (
                      <CompCard
                        key={comp.id}
                        comp={comp}
                        selected={false}
                        selectionIndex={0}
                        onToggle={() => toggleComp(comp.id)}
                        disabled={selectedIds.length >= 3}
                        onEdit={comp.id.startsWith('manual-') ? () => editManualComp(comp) : undefined}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={compsPage <= 1}
                        onClick={() => { setCompsPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                        className="border-gray-200 text-gray-600"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <span className="text-sm text-gray-500">
                        Page <span className="font-bold text-gray-900">{compsPage}</span> of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={compsPage >= totalPages}
                        onClick={() => { setCompsPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                        className="border-gray-200 text-gray-600"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )
            })()}

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
                disabled={selectedIds.length < 1}
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
              mileageRate={mileageRate}
              reportsState={reportsState}
              onDocumentSaved={(blob, name) => addDocument(blob, name, 'acv-report')}
            />
          </div>
        )}

        {/* Steps 5/8/9: Summary / Closing Notes / Award. One ReportsStep
            instance stays mounted behind all three tabs so its claim↔award↔notes
            sync effects keep running while switching between them. */}
        {(step === 5 || step === 8 || step === 9) && (
          <div>
            <ReportsStep
              claim={claim}
              result={result}
              reportsState={reportsState}
              onReportsStateChange={setReportsState}
              view={step === 5 ? 'summary-page' : step === 8 ? 'closing-notes' : 'award-agreement'}
              onDocumentSaved={(blob, name, source) => addDocument(blob, name, source)}
            />
          </div>
        )}

        {/* Step 6: Loss Search (inside the ACV tab) */}
        {step === 6 && (
          <LossSearchTab
            claim={claim}
            listings={auctionListings}
            onListingsChange={setAuctionListings}
          />
        )}

        {/* Step 7: Estimate Dispute */}
        {step === 7 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Estimate Dispute</h2>
            <EstimateTab
              claim={claim}
              estimate={estimate}
              onChange={setEstimate}
              onDocumentSaved={(blob, name, source) => addDocument(blob, name, source)}
            />
          </div>
        )}

        {/* Step 10: Documents */}
        {step === 10 && editingId && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
            <DocumentsTab
              claimId={editingId}
              documents={documents}
              onDocumentsChange={setDocuments}
            />
          </div>
        )}

        {/* Step 11: Diminished Value */}
        {step === 11 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Diminished Value</h2>
            <DVTab
              claim={claim}
              dv={dv}
              onChange={setDv}
              onGenerated={(blob, name) => addDocument(blob, name, 'dv-report')}
            />
          </div>
        )}

        {/* Step 12: Invoice (tab id/component stayed "reports" — more report
            types may land here later — only the visible label changed) */}
        {step === 12 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice</h2>
            <ReportsTab
              claim={claim}
              invoice={invoice}
              onChange={setInvoice}
              onGenerated={(blob, name) => addDocument(blob, name, 'invoice')}
            />
          </div>
        )}
        </fieldset>

        {/* Step 13: Messages — rendered OUTSIDE the fieldset so messaging
            stays active even on submitted/closed/read-only claims (spec §7.2:
            meta-conversation about the work is always allowed). */}
        {step === 13 && editingId && (
          <MessagesTab claimId={editingId} />
        )}

        {/* Step 14: Guidelines — reference material for the claim's insurance
            company. Always viewable (any state), fully read-only in the tab. */}
        {step === 14 && (
          <GuidelinesTab insuranceCompany={claim.insuranceCompany} />
        )}
      </main>

      {/* Assignment Sheet — hidden print portal. Only renders in print output
          when the Print button is clicked (triggerAssignmentSheetPrint adds a
          body class the sheet's CSS reads). Always mounted so the print flow
          has no async delay. */}
      {!isNew && editingId && (
        <AssignmentSheet
          data={{
            claim,
            status,
            submittedAt,
            assignedToName: allProfiles.find(p => p.id === assignedTo)?.name
              || allProfiles.find(p => p.id === assignedTo)?.email
              || '',
            notesType: reportsState.notesType,
            opposingAppraiserName: reportsState.notesData.appraiserName,
            opposingAppraiserCompany: reportsState.notesData.appraiserCompany,
            opposingAppraiserValue: reportsState.notesData.appraiserValueNum,
            agreementAmount: reportsState.notesData.agreementAmountNum,
            umpireAmount: reportsState.notesData.umpireAmountNum,
            ourAcv: result.acv,
            dv: dv ?? null,
          }}
        />
      )}
    </div>
  )
}

export function ClaimWorkspace({ claimId }: { claimId: string }) {
  return <ClaimWorkspaceInner claimId={claimId} />
}
