"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  AlertCircle,
  Car,
  X,
  Plus,
  ArrowUpDown,
  Upload,
  CheckCircle2,
  FileText,
  ClipboardList,
  Printer,
  Lock,
  Pencil,
  Trash2,
  Info,
  ExternalLink,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { alertDialog, confirmDialog } from '@/components/ui/dialog-service'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ClaimInfo, ClaimType, MarketComp, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import { BODY_TYPE_OPTIONS, normalizeBodyType } from '@/lib/acv/decode-vin'
import { parseClaimPDF } from '@/lib/parse-claim-pdf'
import {
  calculateACV,
  calculateCompValue,
  defaultAdjustments,
  formatCurrency,
  needsDolAdjustment,
  needsDolAdjustmentLenient,
} from '@/lib/acv/calculations'
import { saveACVHistory, fetchACVEntry, deleteACVHistory, type ClaimStatus } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, isPickerVisible, userHandlesClaimTypes, type Profile } from '@/lib/supabase/profiles'
import { fetchStatusPhaseConfigs, phaseColorClasses, formatPhaseAge, type StatusPhaseConfig } from '@/lib/supabase/status-phase-configs'
import { useActiveCompany } from '@/hooks/use-active-company'
import { useCurrentCompanyMembers } from '@/hooks/use-current-company-members'
import { fileNumberLabel, fileNumberLongLabel } from '@/lib/company-labels'
import { LossSearchTab, type LossListing } from '@/components/claim/loss-search-tab'
import { ClaimLabelPills } from '@/components/claim/ClaimLabelPills'
import { ClientPicker } from '@/components/claim/client-picker'
import { EstimateTab } from '@/components/claim/estimate-tab'
import { DocumentsTab } from '@/components/claim/documents-tab'
import { FormsTab } from '@/components/claim/forms-tab'
import { ActivityTab } from '@/components/claim/activity-tab'
import { MessagesTab } from '@/components/claim/messages-tab'
import { GuidelinesTab } from '@/components/claim/guidelines-tab'
import { ReportsHubTab } from '@/components/claim/reports-hub-tab'
import { ContractClient } from '@/app/claims/[id]/contract/contract-client'
import { CoverLetterTab } from '@/components/claim/cover-letter-tab'
import { fetchGuidelineNamesBrowser } from '@/lib/supabase/insurance-guidelines'
import { useDuplicateCheck, type DuplicateResult } from '@/lib/supabase/claim-duplicates'
import { triggerAssignmentSheetPrint } from '@/components/claim/assignment-sheet'
import { DVTab, finalDvFor, type DVState } from '@/components/claim/dv-tab'
import { LOUTab } from '@/components/claim/lou-tab'
import type { LOUState } from '@/lib/acv/types'
import { ReportsTab, type InvoiceReportState } from '@/components/claim/reports-tab'
import { StorageTab, defaultStorageState, computeStorageTotals } from '@/components/claim/storage-tab'
import type { StorageState } from '@/lib/acv/types'
import { uploadClaimDocument, type ClaimDocument, ARCHIVABLE_REPORT_SOURCES } from '@/lib/supabase/documents'
import { createClient } from '@/lib/supabase/client'
import { savePdfWithPicker, savePdfPickerFirst } from '@/lib/save-pdf'
import { safeHref } from '@/lib/safe-href'
import { captureSummaryPdf } from '@/lib/summary-pdf'
import { getSummary, genId, newEmptyForm, type SavedSummary } from '@/app/summary-page/lib'
import { SummaryFields } from '@/app/summary-page/SummaryFields'
import { SummaryPrintDoc } from '@/app/summary-page/SummaryPrintDoc'
import { AppHeader } from '@/components/app-header'
import { StateLicensingTopBadge } from '@/components/claim/state-licensing-top-badge'
import { NegotiatingAppraiserLicenseSummary } from '@/components/claim/negotiating-appraiser-license-summary'
import { OpposingAppraiserPicker } from '@/components/claim/opposing-appraiser-picker'
import { unionOpposingAppraiserClaimTypes } from '@/lib/supabase/opposing-appraisers'

async function saveToHistory(
  claim: ClaimInfo,
  comps: SelectedComp[],
  adjustments: ACVAdjustments,
  result: ACVResult,
  mode: string,
  editId?: string | null,
  mileageRate?: number,
  reportsState?: ReportsState,
  extras?: { status?: ClaimStatus; auctionListings?: LossListing[]; estimate?: unknown; documents?: ClaimDocument[]; dv?: DVState | null; lou?: LOUState | null; invoice?: InvoiceReportState | null; storage?: StorageState | null; clientId?: string | null; needsRoughNumbers?: boolean },
  activeCompanyId?: string | null,
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
    lou: extras?.lou ?? undefined,
    invoice: extras?.invoice ?? undefined,
    storage: extras?.storage ?? undefined,
    clientId: extras?.clientId,
    needsRoughNumbers: extras?.needsRoughNumbers,
  }
  const res = await saveACVHistory(entry, editId, activeCompanyId)
  if (!res.ok) {
    // Surface the real failure to callers that care (addDocument wraps this
    // in an alertDialog so document-save failures are no longer silent).
    throw new Error(res.error)
  }
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

// ── Duplicate warning (inline under VIN / Claim # / MA # fields) ─────────────
// `count` is authoritative for the header text; `matches` is the per-row
// detail, which the API only returns for admins (non-admins get an empty
// array + the true count so the warning still fires but doesn't leak
// unrelated claim details).
//
// Duplicates are strictly informational — Modern Appraisers can legitimately
// be hired on a different loss for the same vehicle, or share a claim/MA
// number by clerical coincidence. Nothing is locked; the chip is just so the
// user knows another claim exists.
function DuplicateWarning({
  matches,
  count,
  field,
  tone = 'slate',
}: {
  matches: Array<{ id: string; maNumber: string; claimNumber: string; insuredName: string; vehicle: string; date: string }>
  count: number
  field: string
  // VIN duplicates are the strongest signal (unique per vehicle) so they
  // render red. MA# / claim# duplicates stay neutral slate — those are often
  // clerical coincidences.
  tone?: 'slate' | 'red'
}) {
  if (count === 0) return null
  const t = tone === 'red'
    ? {
        wrap: 'text-red-700',
        header: 'text-red-700',
        sep: 'text-red-400',
        chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100 text-red-800 hover:text-red-900 font-medium transition-colors',
        chipMuted: 'text-red-500',
        more: 'text-red-600',
        empty: 'text-red-500 italic',
      }
    : {
        wrap: 'text-slate-600',
        header: 'text-slate-500',
        sep: 'text-slate-400',
        chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium transition-colors',
        chipMuted: 'text-slate-400',
        more: 'text-slate-500',
        empty: 'text-slate-400 italic',
      }
  return (
    <div className={cn('mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', t.wrap)}>
      <span className={cn('inline-flex items-center gap-1 shrink-0', t.header)}>
        <Info className="w-3.5 h-3.5" />
        Also on {count} other claim{count === 1 ? '' : 's'}
        <span className={t.sep}>·</span>
      </span>
      {matches.length > 0 ? (
        <>
          {matches.slice(0, 5).map(m => (
            <a
              key={m.id}
              href={`/claims/${m.id}`}
              target="_blank"
              rel="noreferrer"
              title={[m.insuredName, m.vehicle].filter(Boolean).join(' · ') || undefined}
              className={t.chip}
            >
              <span>MA {m.maNumber || m.id.slice(0, 6)}</span>
              {m.claimNumber && <span className={t.chipMuted}>· CL {m.claimNumber}</span>}
              <ExternalLink className={cn('w-3 h-3', t.chipMuted)} />
            </a>
          ))}
          {matches.length > 5 && <span className={t.more}>+{matches.length - 5} more</span>}
        </>
      ) : (
        <span className={t.empty}>Ask an admin for details</span>
      )}
      <span className="sr-only">
        {field} matches on other claim{count === 1 ? '' : 's'} — informational, not a block.
      </span>
    </div>
  )
}

// ── Persistent duplicate banner at top of saved-claim workspace ──────────────
// Rendered on any saved claim whose VIN, CL#, or MA# matches another claim.
// Same "informational only" framing — clean neutral card, not an alarming
// amber warning.
function DuplicateBanner({ duplicates }: { duplicates: DuplicateResult }) {
  const { vinMatches, claimNumberMatches, maNumberMatches } = duplicates
  type Group = { label: string; list: DuplicateResult['vinMatches']; tone: 'slate' | 'red' }
  const groups: Group[] = []
  if (vinMatches.length > 0)         groups.push({ label: 'VIN',    list: vinMatches,         tone: 'red' })
  if (claimNumberMatches.length > 0) groups.push({ label: 'CL #',   list: claimNumberMatches, tone: 'slate' })
  if (maNumberMatches.length > 0)    groups.push({ label: 'MA #',   list: maNumberMatches,    tone: 'slate' })
  if (groups.length === 0) return null

  const hasVin = vinMatches.length > 0
  // Promote the whole banner to red when a VIN duplicate is present — VIN is
  // the strongest signal (unique per vehicle). CL# / MA# only → neutral slate.
  const outer = hasVin
    ? 'mb-4 rounded-lg border border-red-300 bg-white shadow-sm overflow-hidden'
    : 'mb-4 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden'
  const header = hasVin
    ? 'flex items-center gap-2 px-4 py-2 border-b border-red-200 bg-red-50'
    : 'flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50'
  const headerIcon = hasVin ? 'w-4 h-4 text-red-600' : 'w-4 h-4 text-slate-500'
  const headerTitle = hasVin ? 'text-sm font-semibold text-red-800' : 'text-sm font-semibold text-slate-800'
  const headerSub = hasVin ? 'text-xs text-red-600' : 'text-xs text-slate-500'
  const divide = hasVin ? 'divide-y divide-red-100' : 'divide-y divide-slate-100'

  return (
    <div className={outer}>
      <div className={header}>
        <Info className={headerIcon} />
        <span className={headerTitle}>Matching claim{groups.reduce((n, g) => n + g.list.length, 0) === 1 ? '' : 's'} on file</span>
        <span className={headerSub}>— informational, this claim is not blocked</span>
      </div>
      <div className={divide}>
        {groups.map(g => {
          const isRed = g.tone === 'red'
          const labelCls = isRed ? 'text-red-700' : 'text-slate-500'
          const chipCls = isRed
            ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100 text-red-800 hover:text-red-900 font-medium transition-colors'
            : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium transition-colors'
          const chipMuted = isRed ? 'text-red-500' : 'text-slate-400'
          const more = isRed ? 'text-red-600' : 'text-slate-500'
          return (
            <div key={g.label} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                <span className="inline-flex items-center gap-1 shrink-0">
                  <span className={labelCls}>Same {g.label}:</span>
                </span>
                {g.list.slice(0, 6).map(m => (
                  <a
                    key={m.id}
                    href={`/claims/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={[m.insuredName, m.vehicle].filter(Boolean).join(' · ') || undefined}
                    className={chipCls}
                  >
                    <span>MA {m.maNumber || m.id.slice(0, 6)}</span>
                    {m.claimNumber && <span className={chipMuted}>· CL {m.claimNumber}</span>}
                    {m.insuredName && <span className={cn('truncate max-w-[140px]', chipMuted)}>· {m.insuredName}</span>}
                    <ExternalLink className={cn('w-3 h-3', chipMuted)} />
                  </a>
                ))}
                {g.list.length > 6 && (
                  <span className={more}>+{g.list.length - 6} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Claim type chips (multi-select toggle) ───────────────────────────────────
const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  rta:       'RTA',
  acv:       'ACV',
  dv:        'DV',
  estimate:  'Est Dispute',
  storage:   'Storage',
  other:     'Other',
  desk:      'Desk',
  lou:       'LOU',
  full:      'FULL',
  salvage:   'Salvage',
  specialty: 'Specialty',
  umpire:    'Umpire',
}
// RTA (Right To Appraisal) leads the primary row — Henry treats it as
// first-class because it toggles the "we're negotiating" semantics on an
// ACV/DV/Est claim (Opposing Appraiser becomes required at creation).
const CLAIM_TYPE_PRIMARY: ClaimType[] = ['rta', 'acv', 'dv', 'estimate', 'storage']
// Specialty + Umpire lead the modifier row — Henry treats them as
// first-class descriptors even though neither has a tool-visibility effect.
const CLAIM_TYPE_EXTRA:   ClaimType[] = ['specialty', 'umpire', 'desk', 'lou', 'full', 'salvage', 'other']

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
  const chipCls = (active: boolean) => cn(
    'px-4 py-2 rounded-full text-sm font-semibold border transition-colors',
    active
      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500'
      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
  )
  // All 9 claim types rendered in a flex-wrap row so they balance naturally
  // when a chip is added or removed. No expand/collapse — everything is
  // visible. Primary chips (ACV/DV/Est/Storage) come first, descriptive
  // modifiers (Desk/LOU/FULL/Salvage/Other) follow.
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {[...CLAIM_TYPE_PRIMARY, ...CLAIM_TYPE_EXTRA].map(t => {
        const active = selected.includes(t)
        return (
          <button key={t} type="button" onClick={() => toggle(t)} className={chipCls(active)}>
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
  clientId,
  onClientIdChange,
  insuranceCompanyOptions,
  duplicates,
  isNew,
  canEdit,
  isAdmin,
  onParsedNotes,
  onAssignmentSheetUploaded,
  allProfiles,
  opposingAppraiserSection,
  valuationsSection,
  editMode,
  onEditModeChange,
  needsRoughNumbers,
  onNeedsRoughNumbersChange,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  clientId: string | null
  onClientIdChange: (id: string | null) => void
  insuranceCompanyOptions: string[]
  duplicates: DuplicateResult
  isNew: boolean
  canEdit: boolean
  // Negotiating Appraiser is admin-only editable (workflow-sensitive — picking it
  // routes notifications + the submit handoff). Client Name used to be gated
  // the same way, but Henry opened it to anyone with the general edit grant
  // (2026-10-10) so appraisers can fix client-naming mistakes on their own.
  isAdmin: boolean
  onParsedNotes?: (notes: string) => void
  // Fires with the raw PDF File after a successful parse. Parent stashes it
  // and auto-attaches to the claim's Documents tab (labeled MA#-
  // uploadedassignsheet.pdf) once the claim has an id + MA#. Fire-and-forget.
  onAssignmentSheetUploaded?: (file: File) => void
  allProfiles: Profile[]
  // Rendered inside the 2-column grid at Row 4. The parent owns the state
  // for both (reportsState lives on ClaimWorkspace) — these slots just drop
  // the JSX into the right grid cell.
  opposingAppraiserSection?: React.ReactNode
  valuationsSection?: React.ReactNode
  // Edit-lock state is owned by the parent (so the Edit toggle button can
  // live in the Card header next to the "Claim Information" title). isNew
  // claims are always unlocked.
  editMode: boolean
  // Setter so the "Edit" button inside the first SectionCard's navy bar
  // can flip into edit mode without round-tripping through the parent.
  onEditModeChange?: (next: boolean) => void
  // Rough-numbers toggle (2026-10-13). Only mutable on new claims — the
  // flag is immutable after creation.
  needsRoughNumbers: boolean
  onNeedsRoughNumbersChange: (next: boolean) => void
}) {
  // Edit lock state is owned by the parent now (Edit button lives in the
  // Card header). Existing claims lock by default; new claims always unlock.
  const locked = !editMode && !isNew
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfSuccess, setPdfSuccess] = useState(false)
  const [pdfDragOver, setPdfDragOver] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // VIN decode — mirror of SearchParametersPanel.decodeVin so DV-only / Storage
  // claims (which never visit the ACV Comp Search tab) can still fill vehicle
  // specs from Claim Info.
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
        vin: data.vin ?? claim.vin,
        year: data.year ?? claim.year,
        make: data.make ?? claim.make,
        model: data.model ?? claim.model,
        trim: data.trim ?? claim.trim,
        engine: data.engine ?? claim.engine,
        drivetrain: data.drivetrain ?? claim.drivetrain,
        transmission: data.transmission ?? claim.transmission,
        fuelType: data.fuelType ?? claim.fuelType,
        bodyType: normalizeBodyType(data.bodyStyle) || claim.bodyType,
      })
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'VIN decode failed')
    } finally {
      setDecoding(false)
    }
  }

  // Company-aware file-number label + auto-generation. Both EV (222001+) and
  // MA (555001+) now auto-fill from a server sequence; the API dispatches to
  // the right one based on the active company. Pre-migration or unknown
  // companies return `supported: false` and the field stays manually editable.
  const { activeCompany } = useActiveCompany()
  const companySlug = activeCompany?.slug ?? null
  const isEV = companySlug === 'eagleview'
  const fileLabel = fileNumberLongLabel(companySlug)
  // MA# is hidden from the new-claim form entirely — the DB trigger
  // assigns on insert and the user sees the number after save. No
  // client-side peek, no placeholder, no sequence pre-reservation.
  // Only appraisers with access to the current company should appear in the
  // Negotiating Appraiser dropdown (memberIds=null means show all — pre-migration).
  const { memberIds: infoMemberIds } = useCurrentCompanyMembers()

  const set = (field: keyof ClaimInfo, value: string | number) =>
    onChange({ ...claim, [field]: value })

  // claimRef still used by handlePdfUpload to avoid stale closure when a
  // parsed PDF spread races with other state updates.
  const claimRef = useRef(claim)
  useEffect(() => { claimRef.current = claim }, [claim])

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true)
    setPdfError(null)
    setPdfSuccess(false)
    try {
      const data = await parseClaimPDF(file)
      onChange({
        ...claim,
        // MA# is owned 100% by the DB auto-generation sequence (555001+).
        // NEVER populate it from the parser — the DB trigger assigns on save.
        // We deliberately do NOT include maNumber in this spread so the
        // field value survives any PDF upload untouched.
        claimNumber: data.claimNumber || claim.claimNumber,
        dateOfLoss: data.dateOfLoss || claim.dateOfLoss,
        dateReceived: data.dateReceived || claim.dateReceived,
        clientType: data.clientType || claim.clientType,
        clientName: data.clientName || claim.clientName,
        insuredName: data.insuredName || claim.insuredName,
        ownerName: data.ownerName || claim.ownerName || '',
        ownerPhone: data.ownerPhone || claim.ownerPhone,
        ownerEmail: data.ownerEmail || claim.ownerEmail,
        ownerAddress: data.ownerAddress || claim.ownerAddress,
        claimantName: data.claimantName || claim.claimantName || '',
        claimantPhone: data.claimantPhone || claim.claimantPhone || '',
        claimantEmail: data.claimantEmail || claim.claimantEmail || '',
        claimantAddress: data.claimantAddress || claim.claimantAddress || '',
        insuranceCompany: data.insuranceCompany || claim.insuranceCompany,
        adjuster: data.adjuster || claim.adjuster,
        adjusterPhone: data.adjusterPhone || claim.adjusterPhone,
        adjusterEmail: data.adjusterEmail || claim.adjusterEmail,
        deductible: data.deductible !== undefined ? data.deductible : claim.deductible,
        vin: data.vin || claim.vin,
        year: data.year || claim.year,
        make: data.make || claim.make,
        model: data.model || claim.model,
        mileage: data.mileage || claim.mileage,
        zip: data.zip || claim.zip,
        // Parsed Notes section (currently populated by the Eagle View parser —
        // other parsers return empty) lands in the appraiser-facing
        // Handling Instructions field at the bottom of Claim Info. Uses the
        // same "parsed-wins-over-blank, user-edit-wins-over-parsed" rule as
        // every other field above.
        appraiserNotes: data.notes || claim.appraiserNotes || '',
      })
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3000)
      // Stash parsed Notes (Eagle View format only — Modern Appraisers
      // parser returns empty). Parent workspace fires the auto-message
      // once the claim has an id.
      onParsedNotes?.(data.notes || '')
      // Hand the raw PDF to the parent — it'll auto-attach to the claim's
      // Documents tab labeled MA#-uploadedassignsheet.pdf after save.
      onAssignmentSheetUploaded?.(file)
      // Resolve the parsed client name to a real client row so clientId
      // gets set — that's what triggers the rtaDefault / roughNumbersDefault
      // auto-apply useEffect further down. Without this step the free-text
      // clientName shows but nothing links to the clients table, so a
      // Sedgwick assignment sheet upload wouldn't auto-add 'rta' (Henry
      // 2026-10-18). Exact-normalized match only — if multiple Sedgwick-ish
      // rows exist (e.g. "Sedgwick CMS" vs plain "Sedgwick") and none
      // normalizes to the parsed name, we leave clientId alone and the
      // user picks manually.
      if (data.clientName && data.clientName.trim()) {
        try {
          const { searchClientsByName } = await import('@/lib/supabase/clients')
          const { normalizeCompanyKey } = await import('@/lib/company-match')
          const targetKey = normalizeCompanyKey(data.clientName)
          if (targetKey) {
            const candidates = await searchClientsByName(data.clientName, 10)
            const exact = candidates.filter(c => normalizeCompanyKey(c.name) === targetKey)
            if (exact.length === 1) {
              onClientIdChange(exact[0].id)
            }
          }
        } catch (err) {
          // Non-fatal — parsed name is still in the free-text field, user
          // can resolve manually via the ClientPicker.
          console.warn('client auto-link lookup failed:', err)
        }
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF parse failed')
    } finally {
      setPdfUploading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  // Compact inputs — py-1.5 and rounded-md keep the field just tall enough
  // for the text without the big-bubble look the earlier py-2.5 produced.
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-[12px] font-medium text-slate-500 tracking-tight mb-1'
  // "Claim Information" sits at the Card title (text-lg). Everything inside
  // (Owner / Vehicle / Claimant / Owner Insurance / etc.) uses this smaller
  // sub-header so there's a clear visual hierarchy.
  const sectionHeaderCls = 'text-[15px] font-bold text-black tracking-tight mb-2'

  const textareaCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[120px] leading-relaxed'

  // Edit lock applies to every section EXCEPT Negotiating Appraiser (always
  // editable so late reassignments still flow into Award/Notes signature
  // blocks). We wrap each locked block in its own small fieldset so the
  // non-locked Negotiating Appraiser can share a grid row with a locked
  // sibling (fieldset[disabled] cascades to every descendant input).
  // No opacity on the fieldset — would dim section headers inside and
  // make them look lighter than Negotiating Appraiser (which is outside).
  // The browser's native disabled-input styling is sufficient lock cue.
  const lockedCn = 'm-0 p-0 border-0'

  // Compact label/value pair for the read-only view. Replaces label+input
  // with a tight one-liner so the whole claim fits on screen without
  // scrolling. Clicking Edit swaps back to the full input form.
  const ReadField = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline gap-2 py-1 min-w-0">
      <span className="text-[11.5px] font-medium text-slate-500 shrink-0 min-w-[88px]">{label}</span>
      <span className="text-[13.5px] text-slate-900 truncate flex-1">
        {value !== null && value !== undefined && value !== '' ? value : <span className="text-slate-400">—</span>}
      </span>
    </div>
  )

  // READ MODE — dense single-screen view of everything on the claim. Only
  // renders inputs where live interactions remain useful (Negotiating Appraiser
  // dropdown stays interactive so admins can reassign without clicking Edit).
  if (locked) {
    const dolFormatted = claim.dateOfLoss
      ? new Date(claim.dateOfLoss + 'T00:00').toLocaleDateString()
      : ''
    const claimTypesStr = (claim.claimTypes ?? [])
      .map(t => CLAIM_TYPE_LABELS[t])
      .filter(Boolean)
      .join(', ')
    const vehicleStr = [claim.year || '', claim.make, claim.model, claim.trim].filter(Boolean).join(' ')
    const deductibleStr = claim.deductible ? `$${claim.deductible.toLocaleString()}` : ''
    const editAction = canEdit && onEditModeChange ? (
      <button
        type="button"
        onClick={() => onEditModeChange(true)}
        className="h-6 px-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded border border-white/20 transition-colors"
        title="Edit claim info"
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>
    ) : null
    return (
      <div className="space-y-3">
        {/* Claim Information — identification (MA/CL/DOL). Edit button lives
            in the navy header bar on the right. */}
        <SectionCard title="Claim Information" action={editAction}>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <SectionRow label={fileLabel} value={claim.maNumber} />
            <SectionRow label="Insurance Claim #" value={claim.claimNumber} />
            <SectionRow label="Date of Loss" value={dolFormatted} />
          </div>
        </SectionCard>

        {/* Row 1 — Claim Type (full width). Specialty is one of the chips
            inside this type array (added 2026-10-12), so claimTypesStr
            renders it alongside ACV/DV/etc. */}
        <SectionCard title="Claim Type">
          <div className="px-3 py-2 text-[13px] text-slate-900">
            {claimTypesStr || <span className="text-slate-400">—</span>}
          </div>
        </SectionCard>

        {/* Row 2 — Owner | Owner Insurance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="Owner">
            <div className="divide-y divide-slate-100">
              <SectionRow label="Client Type" value={claim.clientType} />
              {/* Inside the claim we show "Company - Person" when a specific
                  contact at the client company was attributed. Dashboard
                  stays company-only (reads claim.clientName directly). */}
              <SectionRow
                label="Client Name"
                value={
                  claim.clientContactName
                    ? `${claim.clientName} - ${claim.clientContactName}`
                    : claim.clientName
                }
              />
              {/* Owner row falls back to insuredName for pre-split claims so
                  the field never reads blank on legacy data. */}
              <SectionRow label="Owner" value={claim.ownerName || claim.insuredName} />
              <SectionRow label="Insured" value={claim.insuredName} />
              <SectionRow label="Phone" value={claim.ownerPhone} />
              <SectionRow label="Email" value={claim.ownerEmail} />
              <SectionRow label="Address" value={claim.ownerAddress} />
            </div>
          </SectionCard>
          <SectionCard title="Owner Insurance">
            <div className="divide-y divide-slate-100">
              <SectionRow label="Insurance Co" value={claim.insuranceCompany} />
              <SectionRow label="Adjuster" value={claim.adjuster} />
              <SectionRow label="Adjuster Phone" value={claim.adjusterPhone} />
              <SectionRow label="Adjuster Email" value={claim.adjusterEmail} />
              <SectionRow label="Deductible" value={deductibleStr} />
            </div>
          </SectionCard>
        </div>

        {/* Row 3 — Claimant | Vehicle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="Claimant">
            <div className="divide-y divide-slate-100">
              <SectionRow label="Claimant Name" value={claim.claimantName} />
              <SectionRow label="Phone" value={claim.claimantPhone} />
              <SectionRow label="Email" value={claim.claimantEmail} />
              <SectionRow label="Address" value={claim.claimantAddress} />
            </div>
          </SectionCard>
          <SectionCard title="Vehicle">
            <div className="divide-y divide-slate-100">
              <SectionRow label="VIN" value={<span className="font-mono">{claim.vin}</span>} />
              <SectionRow label="Vehicle" value={vehicleStr} />
              <SectionRow label="Mileage" value={claim.mileage ? claim.mileage.toLocaleString() : ''} />
              <SectionRow label="Location" value={claim.vehicleLocationName || claim.vehicleLocation} />
              <SectionRow label="Location Address" value={claim.vehicleLocationAddress} />
              <SectionRow label="Location Contact" value={claim.vehicleLocationContact} />
            </div>
          </SectionCard>
        </div>

        {/* Row 4 — Opposing Appraiser + Valuations (parent-injected) */}
        {opposingAppraiserSection && (
          <SectionCard title="Opposing Appraiser">
            <div className="px-3 py-2">{opposingAppraiserSection}</div>
          </SectionCard>
        )}
        {valuationsSection && (
          <SectionCard title="Valuations">
            <div className="px-3 py-2">{valuationsSection}</div>
          </SectionCard>
        )}

        {/* Row 5 — Handling Instructions + Fact of Loss */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="Handling Instructions">
            <div className="px-3 py-2 text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[48px]">
              {claim.appraiserNotes || <span className="text-slate-400">—</span>}
            </div>
          </SectionCard>
          <SectionCard title="Fact of Loss">
            <div className="px-3 py-2 text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[48px]">
              {claim.factOfLoss || <span className="text-slate-400">—</span>}
            </div>
          </SectionCard>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* PDF Upload — only surfaced during initial claim creation. Once
          the claim exists there's nothing to auto-fill into. Accepts click
          OR drag-and-drop onto the button (native drag events; no visual
          state change). */}
      {isNew && (
        <div
          className={`flex items-center gap-3 rounded-lg transition-colors ${
            pdfDragOver ? 'ring-2 ring-blue-500 bg-blue-50 ring-offset-2' : ''
          }`}
          onDragEnter={(e) => {
            if (e.dataTransfer.types.includes('Files')) setPdfDragOver(true)
          }}
          onDragOver={(e) => { e.preventDefault() }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPdfDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setPdfDragOver(false)
            const file = Array.from(e.dataTransfer.files).find(f => /\.pdf$/i.test(f.name))
            if (file) handlePdfUpload(file)
          }}
        >
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
            <p className="text-xs text-red-500">
              {pdfError}
            </p>
          )}
        </div>
      )}

      {/* Edit mode — same SectionCard shell as read mode, but each card body
          holds the live inputs instead of static text. Keeps the two modes
          visually aligned so toggling Edit / Done doesn't rearrange the page. */}

      {/* Claim Information — MA / CL / DOL.
          For NEW claims, the MA# field is hidden entirely — the DB trigger
          assigns the number when the claim is created and the user sees it
          after save on the claim workspace. Shown read-only for existing
          claims so admins/appraisers can see the assigned number. */}
      <SectionCard title="Claim Information">
        <div className={`grid grid-cols-1 ${isNew ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3 px-4 py-3`}>
          {!isNew && (
            <div>
              <label className={labelCls}>{fileLabel}</label>
              <input
                className={inputCls}
                value={claim.maNumber}
                readOnly
                title="Auto-generated — not editable"
              />
              <DuplicateWarning matches={duplicates.maNumberMatches} count={duplicates.maNumberCount} field={fileNumberLabel(companySlug)} />
            </div>
          )}
          <div>
            <label className={labelCls}>Insurance Claim #</label>
            <input className={inputCls} placeholder="CLM-00001" value={claim.claimNumber} onChange={(e) => set('claimNumber', e.target.value)} />
            <DuplicateWarning matches={duplicates.claimNumberMatches} count={duplicates.claimNumberCount} field="claim #" />
          </div>
          <div>
            <label className={labelCls}>Date of Loss</label>
            <input type="date" className={inputCls} value={claim.dateOfLoss} onChange={(e) => set('dateOfLoss', e.target.value)} />
          </div>
        </div>
        {/* Rough-numbers workflow toggle. Editable only on new claims — the
            flag is immutable after creation (first Submit either consumes it
            or skips it). Pre-existing claims see a read-only indicator when
            the flag is on, nothing otherwise. */}
        {(isNew || needsRoughNumbers) && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-700">Needs rough numbers?</div>
              <div className="text-xs text-gray-500 mt-0.5 max-w-md">
                When on, the first Submit hands this claim to the Rough Numbers inbox and pauses cycle time until it's reassigned. Default comes from the picked client.
              </div>
            </div>
            {isNew ? (
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={needsRoughNumbers}
                  onChange={(e) => onNeedsRoughNumbersChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-checked:bg-blue-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500/40 transition-colors"></div>
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
              </label>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700 shrink-0">
                Rough Numbers
              </span>
            )}
          </div>
        )}
      </SectionCard>

      {/* Claim Type (chips) — includes Specialty as a modifier chip (added
          2026-10-12). Specialty has no tool-visibility effect; it's a
          descriptive tag like Desk / Full / Salvage. */}
      <SectionCard title="Claim Type">
        <div className="px-4 py-3">
          <ClaimTypeChips
            selected={claim.claimTypes ?? []}
            onChange={(next) => onChange({ ...claim, claimTypes: next })}
          />
        </div>
      </SectionCard>

      {/* Row 2 — Owner | Owner Insurance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Owner">
          <div className="px-4 py-3 space-y-3">
            <div>
              <label className={labelCls}>Client Type</label>
              <select className={inputCls} value={claim.clientType} onChange={(e) => set('clientType', e.target.value as 'Insured' | 'Claimant')}>
                <option value="Insured">Insured</option>
                <option value="Claimant">Claimant</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Client Name</label>
              {canEdit ? (
                <ClientPicker
                  value={clientId}
                  valueName={claim.clientName}
                  contactId={claim.clientContactId ?? null}
                  onChange={(id, name, cId, cName) => {
                    onClientIdChange(id)
                    // Multi-field update in a single onChange so clientName,
                    // clientContactId AND clientContactName land in the same
                    // React batch and the auto-save sees a consistent snapshot.
                    onChange({
                      ...claim,
                      clientName: name,
                      clientContactId: cId,
                      clientContactName: cName,
                    })
                  }}
                  placeholder="Sedgwick"
                  inputClassName={inputCls}
                />
              ) : (
                <input className={inputCls} value={claim.clientName || '—'} disabled readOnly />
              )}
            </div>
            <div>
              {/* Owner name — the person who actually owns the vehicle. Shows
                  in the claim's top header and the dashboard "Owner" column.
                  Falls back to insuredName on legacy claims that only tracked
                  the insured, so nothing goes blank. */}
              <label className={labelCls}>Owner Name</label>
              <input
                className={inputCls}
                placeholder="John Smith"
                value={claim.ownerName ?? ''}
                onChange={(e) => set('ownerName', e.target.value)}
              />
            </div>
            <div>
              {/* Insured name — the policy holder. May differ from the owner
                  (parent's policy on child's car, business-owned vehicle on
                  the employee's claim, etc.). The downstream Reports still
                  pull Vehicle Owner from this field for backward compat
                  until parsers are updated to populate ownerName too. */}
              <label className={labelCls}>Insured Name</label>
              <input
                className={inputCls}
                placeholder="John Smith"
                value={claim.insuredName}
                onChange={(e) => set('insuredName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Owner Phone</label>
              <input className={inputCls} placeholder="(555) 000-0000" value={claim.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Owner Email</label>
              <input className={inputCls} placeholder="owner@email.com" value={claim.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Owner Address</label>
              <input className={inputCls} placeholder="123 Main St, City, ST 00000" value={claim.ownerAddress} onChange={(e) => set('ownerAddress', e.target.value)} />
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Owner Insurance">
          <div className="px-4 py-3 space-y-3">
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
            <div>
              <label className={labelCls}>Deductible</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className={inputCls + ' pl-7'}
                  placeholder="500"
                  value={claim.deductible ? String(claim.deductible) : ''}
                  onChange={(e) => set('deductible', e.target.value === '' ? 0 : Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Row 3 — Claimant | Vehicle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Claimant">
          <div className="px-4 py-3 space-y-3">
            <div>
              <label className={labelCls}>Claimant Name</label>
              <input className={inputCls} placeholder="Full name" value={claim.claimantName ?? ''} onChange={(e) => set('claimantName', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Claimant Phone</label>
              <input className={inputCls} placeholder="(555) 000-0000" value={claim.claimantPhone ?? ''} onChange={(e) => set('claimantPhone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Claimant Email</label>
              <input className={inputCls} placeholder="claimant@email.com" value={claim.claimantEmail ?? ''} onChange={(e) => set('claimantEmail', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Claimant Address</label>
              <input className={inputCls} placeholder="123 Main St, City, ST 00000" value={claim.claimantAddress ?? ''} onChange={(e) => set('claimantAddress', e.target.value)} />
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Vehicle">
          <div className="px-4 py-3 space-y-3">
            <div>
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
                  type="button"
                  onClick={decodeVin}
                  disabled={decoding || claim.vin.length !== 17}
                  className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white"
                  size="sm"
                >
                  {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decode'}
                </Button>
              </div>
              {decodeError && (
                <p className="text-xs text-red-500 mt-1">{decodeError}</p>
              )}
              <DuplicateWarning matches={duplicates.vinMatches} count={duplicates.vinCount} field="VIN" tone="red" />
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <input type="number" className={inputCls} placeholder="2020" value={claim.year || ''} onChange={(e) => set('year', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Make</label>
              <input className={inputCls} placeholder="Toyota" value={claim.make} onChange={(e) => set('make', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
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
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className={labelCls}>Vehicle Location</label>
                {/* Shortcut: copy the owner's address into the Vehicle fields
                    for the common case where the car's parked at the insured's
                    home. Only renders when there's an owner address to copy. */}
                {(claim.ownerAddress ?? '').trim() && (
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...claim,
                      vehicleLocationName: claim.vehicleLocationName?.trim() ? claim.vehicleLocationName : "Owner's Residence",
                      vehicleLocationAddress: claim.ownerAddress ?? '',
                    })}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Same as owner
                  </button>
                )}
              </div>
              <input
                className={inputCls}
                placeholder="Caliber Collision, Owner's Residence, Copart Yard, etc."
                value={claim.vehicleLocationName ?? claim.vehicleLocation ?? ''}
                onChange={(e) => set('vehicleLocationName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Vehicle Address</label>
              <input
                className={inputCls}
                placeholder="123 Main St, City, ST 00000"
                value={claim.vehicleLocationAddress ?? ''}
                onChange={(e) => set('vehicleLocationAddress', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Location Contact</label>
              <input
                className={inputCls}
                placeholder="John Smith · (555) 123-4567"
                value={claim.vehicleLocationContact ?? ''}
                onChange={(e) => set('vehicleLocationContact', e.target.value)}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Row 4 — Opposing Appraiser + Valuations (parent-injected) */}
      {opposingAppraiserSection && (
        <SectionCard title="Opposing Appraiser">
          <div className="px-4 py-3">{opposingAppraiserSection}</div>
        </SectionCard>
      )}
      {valuationsSection && (
        <SectionCard title="Valuations">
          <div className="px-4 py-3">{valuationsSection}</div>
        </SectionCard>
      )}

      {/* Row 5 — Handling Instructions + Fact of Loss */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Handling Instructions">
          <div className="px-4 py-3">
            <textarea
              className={textareaCls}
              placeholder="Instructions for the handling appraiser — scope, access notes, scheduling constraints…"
              rows={4}
              value={claim.appraiserNotes ?? ''}
              onChange={(e) => set('appraiserNotes', e.target.value)}
            />
          </div>
        </SectionCard>
        <SectionCard title="Fact of Loss">
          <div className="px-4 py-3">
            <textarea
              className={textareaCls}
              placeholder="Narrative of how the loss happened…"
              rows={4}
              value={claim.factOfLoss ?? ''}
              onChange={(e) => set('factOfLoss', e.target.value)}
            />
          </div>
        </SectionCard>
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
        bodyType: normalizeBodyType(data.bodyStyle) || claim.bodyType,
      }
      onChange(updated)
      onVinDecoded?.(updated)
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'VIN decode failed')
    } finally {
      setDecoding(false)
    }
  }

  // Match the compact style used in Award / Closing Notes forms — smaller
  // padding, less uppercase label noise, tighter grid.
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-[12px] font-medium text-slate-500 tracking-tight mb-1'

  const canSearch = claim.year > 0 && claim.make && claim.model && (claim.radius === 0 || claim.zip.length === 5)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {/* Tab title lives in the SAME bubble as the first content (Closing
          Notes / Award pattern). "Search Parameters" is reduced to a small
          uppercase section divider underneath. */}
      <div className="mb-4">
        <h2 className="text-black text-lg font-bold tracking-tight">ACV Report</h2>
      </div>
      <div className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Search Parameters</div>

      {/* VIN row */}
      <div className="mb-3">
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
          <p className="text-xs text-red-500 mt-1">
            {decodeError}
          </p>
        )}
        <DuplicateWarning matches={duplicates.vinMatches} count={duplicates.vinCount} field="VIN" tone="red" />
      </div>

      {/* Vehicle fields grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
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
          <label className={labelCls}>Body Type</label>
          <select
            className={inputCls}
            value={claim.bodyType ?? ''}
            onChange={(e) => set('bodyType', e.target.value)}
          >
            <option value="">Any</option>
            {BODY_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
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
        <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow-md">
          {selectionIndex}
        </div>
      )}

      {/* Image with price overlay */}
      <div className="relative h-28 bg-gray-100">
        {comp.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={comp.photoUrl} alt={vehicle} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-8 h-8 text-gray-300" />
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent pt-6 pb-2 px-2.5">
          <p className="text-[15px] font-extrabold text-white drop-shadow-sm leading-none">
            {formatCurrency(comp.price)}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-[12.5px] font-bold text-gray-900 leading-tight tracking-tight truncate">
          {comp.year && comp.make ? `${comp.year} ${comp.make} ${comp.model}` : comp.heading || 'Unknown Vehicle'}
        </p>
        {comp.trim && (
          <p className="text-[11px] font-semibold text-gray-500 mt-0.5 truncate">{comp.trim}</p>
        )}
        {specs && (
          <p className="text-[10.5px] text-gray-400 mt-0.5 truncate">{specs}</p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-500">
          <span className="tabular-nums">
            {(comp.miles ?? 0).toLocaleString()} mi
          </span>
          {(comp.distanceMi > 0 || comp.dealerCity) && (
            <span className="truncate">
              {[
                comp.dealerCity ? `${comp.dealerCity}, ${comp.dealerState}` : '',
                comp.distanceMi > 0 ? `${comp.distanceMi} mi` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 px-3 pb-3">
        <button
          onClick={onToggle}
          disabled={disabled && !selected}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1.5 text-[11.5px] font-bold rounded-md transition-all',
            selected
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {selected ? (
            <>
              <Check className="w-3 h-3" />
              Selected
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" />
              Select
            </>
          )}
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="px-2.5 py-1.5 text-[11.5px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-all"
          >
            Edit
          </button>
        )}
        <a
          href={safeHref(comp.vdpUrl || `https://www.google.com/search?q=${encodeURIComponent(comp.vin as string)}`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-3 py-1.5 text-[11.5px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-all"
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
  maValueOverride,
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
  // When the user has typed an explicit MA Value in Closing Notes that
  // disagrees with the calculator's ACV, the parent passes { manualValue,
  // onReset } and we render an amber warning banner above the Live ACV
  // Preview. Null when there's no override or when override matches calc.
  maValueOverride?: { manualValue: number; onReset: () => void } | null
}) {
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-[12px] font-medium text-slate-500 tracking-tight mb-1'

  const [pctMode, setPctMode] = useState<Record<string, boolean>>({})
  const [pctInputs, setPctInputs] = useState<Record<string, { base: number; pct: number }>>({})
  // Use the lenient variant here — claims without a captured dateReceived
  // still get the alert so the appraiser isn't silently missing it. The
  // row-level badge in claims-table uses the strict variant to avoid noise.
  const dolFlag = needsDolAdjustmentLenient(claim.dateOfLoss, claim.dateReceived)

  return (
    <div className="space-y-6">
      {maValueOverride && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 text-amber-900">
            <div className="font-semibold">MA Value has been manually overridden.</div>
            <div className="mt-0.5 text-amber-800">
              Closing Notes and Settlement Analytics will use{' '}
              <span className="font-mono tabular-nums font-semibold">{formatCurrency(maValueOverride.manualValue)}</span>.
              The calculated ACV below is{' '}
              <span className="font-mono tabular-nums font-semibold">{formatCurrency(result.acv)}</span>.
            </div>
          </div>
          <button
            type="button"
            onClick={maValueOverride.onReset}
            className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
          >
            Reset
          </button>
        </div>
      )}
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
          {/* Mileage Adjustment row — DOL warning anchored to the LEFT right
              beside the label (not stretched across the middle), and the
              input + ¢/mi label kept tight on the RIGHT so there's a clean
              empty-middle gap instead of a floating red text block. The
              invisible spacer div absorbs the remaining width. */}
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs font-medium text-gray-500">Mileage Adjustment</span>
            {dolFlag && claim.dateOfLoss && (
              <span className="shrink-0 text-sm font-bold text-red-600 whitespace-nowrap">
                {(() => {
                  const m = claim.dateOfLoss.match(/^(\d{4})-(\d{2})-(\d{2})/)
                  const formatted = m ? `${m[2]}/${m[3]}/${m[1]}` : claim.dateOfLoss
                  return `DOL was on ${formatted}`
                })()}
              </span>
            )}
            <div className="flex-1" aria-hidden />
            <div className="w-36 shrink-0">
              <MileageRateInput
                className={`${inputCls} text-right`}
                value={mileageRate}
                onChange={(val) => onMileageRateChange(val)}
              />
            </div>
            <span className="shrink-0 w-10 text-xs text-gray-500 whitespace-nowrap">¢/mi</span>
          </div>
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

// Review & Generate step removed 2026-10-03 — Print now lives on the Adjustments step.

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

type NotesType = 'acv' | 'dv' | 'acv-umpire' | 'dv-umpire' | 'estimate' | 'estimate-umpire'

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
  repairShopAmount: string,
): string {
  let text = ''

  if (type === 'estimate' || type === 'estimate-umpire') {
    // Estimate Dispute (Cost of Repair) — matches the Modern Appraisers
    // sample notes verbiage (CCCone software, final repair cost, repair
    // shop estimate line).
    text += `We established a final cost of repairs using CCCone estimating software for all damages related to this loss along with all items that are considered not included in the CCCone database. We came to a final repair cost of ${maValue} to address the amount of loss.\n\n`
    text += `The insured's hired appraiser, ${appraiserName} with ${appraiserCompany} prepared an estimate in the amount of ${appraiserValue} to address the final cost of repair. The repair shop had an estimate in the amount of ${repairShopAmount}\n\n`
    if (type === 'estimate') {
      text += `Our negotiations with ${appraiserTitle} ${appraiserLastName} led to an award amount of ${agreementAmount}.\n\n`
      text += 'Mutually signed award letter attached.\n\n'
    } else {
      text += `Our negotiations with ${appraiserTitle} ${appraiserLastName} were not successful, we therefore elected to move forward with ${umpireName} as the umpire to rule on this claim. ${umpireName.split(/\s+/).slice(-1)[0] ? `Mr. ${umpireName.split(/\s+/).slice(-1)[0]}` : 'The umpire'} came back with an umpire award in the amount of ${umpireAmount} .\n\n`
      text += 'Mutually signed award letter attached.\n\n'
    }
    text += 'If you have any questions pertaining to this assignment, please feel free to contact me directly.'
    const sigNameE = signatureBlock1.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
    text += `\n\nSincerely,\n${sigNameE}\nModern Appraisers\n702-321-5930`
    return text
  }

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

// Label that gets drawn over the (now-blanked) Dropdown9 field position by
// the notes filler. Free-form: no longer constrained to the template's option
// list. Henry standardized on "Right To Appraisal - X" across all variants
// (2026-09-17).
function getDropdownValue(type: NotesType): string {
  if (type === 'acv' || type === 'acv-umpire') return 'Right To Appraisal - ACV'
  if (type === 'estimate' || type === 'estimate-umpire') return 'Right To Appraisal - Cost of Repair'
  return 'Right To Appraisal - DV'
}

type AwardType = 'acv' | 'dv' | 'estimate'

interface ReportsState {
  // Award variant. 'acv' preserves the original letterhead; 'dv' hides
  // the ACV-specific exclusion clause and relabels the value line as
  // "Diminished Value (DV)". Auto-synced from claim.claimTypes but the
  // user can override in the Award tab.
  awardType?: AwardType
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
    // Estimate Dispute — repair shop's own estimate amount, referenced in
    // the "The repair shop had an estimate in the amount of $X" sentence.
    // Optional so pre-existing claims (which never had this field) don't
    // fail deserialization; treat undefined as 0 at read time.
    repairShopAmountNum?: number
    // Insurance company's initial offer — shown in Claim Info Valuations
    // section + printed assignment sheet. Optional for legacy row compat.
    insuranceOfferNum?: number
    // Per-element MA Value overrides. Each one is only used when the matching
    // tool tab has no computed result yet (ACV before comps are picked, DV
    // before KBB values are entered, Storage before lines are added). Optional
    // for legacy row compat.
    dvValueNum?: number
    storageValueNum?: number
    estValueNum?: number
    // Optional manual override for the Closing Notes narrative text. When set
    // (non-empty string), the printed PDF and the editable preview use this
    // verbatim and the auto-build is ignored. When null/undefined/empty, the
    // preview falls back to buildNotesComments(). Henry wanted a way to tweak
    // the narrative on a per-claim basis without having to edit the template.
    commentsOverride?: string
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
  // Kept for backward-compat with existing claims that already have a
  // separate summaries-table row linked here; new claims store the whole
  // summary payload inline in `summaryData` below so it auto-saves with
  // the rest of the claim (same mechanism as Award / Notes).
  summaryId?: string
  // Full Summary Page payload stored directly on the claim's reports_state.
  // Primary source of truth now — the standalone /summary-page editor is
  // being deprecated for in-workspace use. Auto-saves to acv_history on
  // every change, exactly like awardData / notesData.
  summaryData?: SavedSummary | null
}

function defaultReportsState(claim: ClaimInfo): ReportsState {
  // Seed the report variants from the claim's type. Estimate wins over DV
  // wins over ACV when picking a single default (the user can still swap
  // on the tab). Umpire variants are not defaulted — they're an explicit
  // user choice after the negotiation fails.
  const types = claim.claimTypes ?? []
  const initialType: AwardType =
    types.includes('estimate') && !types.includes('acv') && !types.includes('dv') ? 'estimate' :
    types.includes('dv') && !types.includes('acv') && !types.includes('estimate') ? 'dv' :
    'acv'
  return {
    awardType: initialType,
    notesType: initialType,
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
      repairShopAmountNum: 0,
      insuranceOfferNum: 0,
      estValueNum: 0,
      commentsOverride: '',
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
  dv,
  storage,
  viewerId,
  viewerName,
  viewerIsAdmin,
  summaryDraft,
  onSummaryDraftChange,
  editingId,
  isClosed,
  proceededToUmpire = false,
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
  // Returns a promise so the caller can await the upload before firing a
  // follow-up action like window.print() (the print dialog is modal and can
  // orphan an in-flight upload if we fire-and-forget).
  onDocumentSaved?: (blob: Blob, name: string, source: 'award' | 'closing-notes' | 'summary') => Promise<void> | void
  // Live DV and Storage state so the Award + Closing Notes auto-populate
  // their value fields from whatever the respective element-of-loss tabs
  // computed. Pre-element-sync they were only wired up in the Claim Info
  // Valuations block; now Award/Notes consume them too (Henry 2026-10-09).
  dv?: DVState | null
  storage?: StorageState | null
  // Current viewer identity — plumbed to the Summary tab so status-entry
  // ownership (per-row delete gating) works. Admin flag opens delete to all
  // statuses regardless of authorId.
  viewerId?: string
  viewerName?: string
  viewerIsAdmin?: boolean
  // Summary draft is held by the parent (ClaimWorkspace) so switching away
  // from the Summary tab doesn't unmount-and-lose the in-progress edit. The
  // debounced save-to-DB also lives in the parent for the same reason.
  summaryDraft: SavedSummary | null
  onSummaryDraftChange: (next: SavedSummary | null) => void
  // Current claim's DB id — needed for the server-side Summary PDF endpoint.
  // Null when the claim hasn't been saved yet (brand-new); print is blocked.
  editingId: string | null
  // Is the claim closed? Gates the MA Value (ACV) override: while the claim
  // is OPEN the live ACV always wins (so changing the calculator auto-
  // updates Closing Notes). Once CLOSED, the manual override is honored and
  // a Reset button lets the user wipe it back to the current live value.
  isClosed: boolean
  // When true, "Award Amount" labels swap to "Umpire Ruling Award" (Henry
  // 2026-10-15). Only affects wording; the underlying field is still
  // notesData.agreementAmountNum so analytics / PDFs keep working.
  proceededToUmpire?: boolean
}) {
  const [selectedReport, setSelectedReport] = useState<string | null>(view ?? null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingSummary, setCreatingSummary] = useState(false)
  // Transient printing-in-progress flag so the Print button can show a
  // spinner and disable itself for the duration of the server PDF build.
  const [summaryPrinting, setSummaryPrinting] = useState(false)

  // Convenience accessors
  const notesType = reportsState.notesType
  const notesData = reportsState.notesData
  const awardData = reportsState.awardData
  const awardType: AwardType = reportsState.awardType ?? 'acv'

  const setNotesType = (t: NotesType) =>
    onReportsStateChange(prev => ({ ...prev, notesType: t }))

  const setAwardType = (t: AwardType) =>
    onReportsStateChange(prev => ({ ...prev, awardType: t }))

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

  // Live element-of-loss amounts from the DV + Storage tool tabs. Each
  // helper returns 0 when the input is null/empty, which naturally lets the
  // manually-entered fallbacks (dvValueNum / storageValueNum) take over.
  // Henry 2026-10-09: Award + Closing Notes must sync from these the same
  // way Claim Info's Valuations block does.
  const liveDvAmount = dv ? finalDvFor(dv, claim.mileage) : 0
  // storage not surfaced in Closing Notes/Award value fields today; the
  // state is still accepted as a prop so when a storage report variant is
  // added later we don't have to re-plumb.
  void storage

  // Pick the right "MA value" for Closing Notes based on notesType:
  //   acv / acv-umpire → live ACV while open; manual override wins once closed
  //   dv / dv-umpire   → live DV amount → manual dvValueNum fallback → maValueNum
  //   estimate(-umpire) → manual estValueNum → maValueNum (no live estimate calc)
  //
  // ACV behavior (Henry 2026-10-12): while the claim is OPEN, changing the
  // ACV calculator must auto-propagate to Closing Notes with no override —
  // typing in the MA Value (ACV) field doesn't take effect. Once the claim
  // is CLOSED, the override takes over so the final notes value doesn't
  // silently drift if someone edits the calculator afterwards. The user
  // gets a Reset button on closed claims to clear the override and re-sync
  // to the current live value.
  const maValueForNotes = (notesType === 'acv' || notesType === 'acv-umpire')
    ? (!isClosed && result.acv > 0
        // Open claim with a live ACV result → live wins, no override.
        ? result.acv
        // Closed claim, OR open claim with no live ACV yet → honor the
        // manual override; fall through to live (which may be 0) if none.
        : (notesData.maValueNum > 0 ? notesData.maValueNum : result.acv))
    : (notesType === 'dv' || notesType === 'dv-umpire')
      ? (liveDvAmount || notesData.dvValueNum || notesData.maValueNum)
      : (notesData.estValueNum || notesData.maValueNum)

  // Award value field reads ONLY what the user has typed into Award. We
  // previously fell back to the live ACV / DV / Estimate value when the
  // field was empty, which looked like the field was auto-filled — Henry
  // hit this 2026-10-12 and the pre-fill was confusing (looked like saved
  // state when it was actually a display-only mirror). PDF generation
  // already uses the stored value (see downloadAwardPdf → acvAmount), so
  // the on-screen field now matches what will actually print. User fills
  // the amount explicitly; blank means blank.
  const awardValueDisplay = awardData.acvAmountNum

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
    notesData.repairShopAmountNum ? formatCurrency(notesData.repairShopAmountNum) : '$0.00',
  )

  const downloadNotesPdf = async () => {
    setDownloading(true)
    setError(null)
    const name = `${claim.maNumber || 'report'}-closingnotes.pdf`
    try {
      // Picker-first — opens the folder dialog on the live click gesture,
      // then runs the fetch + Documents attach after the user has chosen
      // where to save. See save-pdf.ts and docs/BUGS.md 2026-10-13.
      await savePdfPickerFirst(
        name,
        async () => {
          const maValue = maValueForNotes ? formatCurrency(maValueForNotes) : '$0.00'
          const autoComments = buildNotesComments(
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
            notesData.repairShopAmountNum ? formatCurrency(notesData.repairShopAmountNum) : '$0.00',
          )
          // If the user manually edited the Preview textarea, print their
          // text verbatim; otherwise fall through to the auto-built narrative.
          const comments = (notesData.commentsOverride ?? '').trim().length > 0
            ? (notesData.commentsOverride ?? '')
            : autoComments
          const today = new Date().toISOString().split('T')[0]
          const res = await fetch('/api/acv/generate-notes-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
          return res.blob()
        },
        async (blob, filename) => {
          await onDocumentSaved?.(blob, filename, 'closing-notes')
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const setAward = (field: string, value: string) =>
    setAwardData(prev => ({ ...prev, [field]: value }))

  // Auto-sync the Award + Closing Notes variant from the claim's type +
  // umpire state. If exactly one of {acv, dv, estimate} is checked on
  // Claim Info, both report variants switch to match that work type;
  // when `proceededToUmpire` is true, Notes additionally promotes to the
  // umpire variant for that family (acv→acv-umpire etc.) so Henry doesn't
  // have to flip the Closing Notes selector every time a claim is phased
  // to Umpire. If multiple (or zero) work types are checked we don't
  // touch anything — user picks in the tab.
  useEffect(() => {
    const types = claim.claimTypes ?? []
    const workTypes = ['acv', 'dv', 'estimate'].filter(t => types.includes(t as ClaimType))
    if (workTypes.length !== 1) return
    const target = workTypes[0] as AwardType
    const notesTarget: NotesType =
      target === 'estimate' ? (proceededToUmpire ? 'estimate-umpire' : 'estimate')
      : target === 'dv'    ? (proceededToUmpire ? 'dv-umpire'       : 'dv')
      :                       (proceededToUmpire ? 'acv-umpire'      : 'acv')
    onReportsStateChange(prev => {
      if (prev.awardType === target && prev.notesType === notesTarget) return prev
      return { ...prev, awardType: target, notesType: notesTarget }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on claimTypes + proceededToUmpire; notesType is derived
  }, [claim.claimTypes, proceededToUmpire])

  // Keep award fields in sync with claim data. The Negotiating Appraiser (when set)
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
      signatureBlock1: claim.negotiatingAppraiser
        ? `${claim.negotiatingAppraiser}\nModern Appraisers`
        : prev.signatureBlock1,
    }))
  }, [claim.insuranceCompany, claim.insuredName, claim.year, claim.make, claim.model, claim.dateOfLoss, claim.claimNumber, claim.negotiatingAppraiser])

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
    const name = `${claim.maNumber || 'report'}-award.pdf`
    try {
      // Picker-first (see downloadNotesPdf for the pattern + rationale).
      await savePdfPickerFirst(
        name,
        async () => {
          const payload = {
            ...awardData,
            signatureBlock1: withRoleLabel(awardData.signatureBlock1, 'For the Insurer'),
            signatureBlock2: withRoleLabel(awardData.signatureBlock2, 'For the Insured'),
            acvAmount: awardData.acvAmountNum ? formatCurrency(awardData.acvAmountNum) : '',
            variant: awardType,
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
          return res.blob()
        },
        async (blob, filename) => {
          await onDocumentSaved?.(blob, filename, 'award')
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-[12px] font-medium text-slate-500 tracking-tight mb-1'

  // Open the claim's Summary Page inline (like the Award / Closing Notes views).
  //
  // SOURCE OF TRUTH: reportsState.summaryData — stored inline on the claim's
  // acv_history.reports_state jsonb and auto-saved by the parent's 2s claim
  // debounce. Same mechanism as awardData / notesData — if Award persists,
  // Summary persists.
  //
  // LEGACY FALLBACK: reportsState.summaryId → separate summaries table. Any
  // claim that was edited before 2026-10-12 will have one of these; we read
  // it once, hoist into summaryData, and never touch the summaries table
  // again for that claim.
  const openSummaryPage = async () => {
    setSelectedReport('summary-page')
    // Fast path: inline payload is already on the claim.
    if (reportsState.summaryData) {
      // Mirror into parent-held draft so SummaryFields renders it; downstream
      // writes go through handleSummaryChange, which updates both.
      if (!summaryDraft || summaryDraft.id !== reportsState.summaryData.id) {
        onSummaryDraftChange(reportsState.summaryData)
      }
      return
    }
    setCreatingSummary(true)
    setError(null)
    try {
      // Legacy fallback: fetch from summaries table via summaryId, then hoist
      // into reportsState.summaryData so future reads skip the DB roundtrip.
      if (reportsState.summaryId) {
        const existing = await getSummary(reportsState.summaryId)
        if (existing) {
          const opposingAppraiser = notesData.appraiserName || existing.opposingAppraiser
          const oaCompany = notesData.appraiserCompany || existing.oaCompany
          // Date Received Claim: user-edited value on the existing summary >
          // claim's parsed dateReceived > blank. NO synthetic fallback — if
          // the assignment sheet didn't carry a Date Created / Date Assigned
          // field, the appraiser enters it manually (Henry 2026-10-20).
          const dateReceivedClaim = existing.dateReceivedClaim || claim.dateReceived || ''
          const synced: SavedSummary = {
            ...existing,
            opposingAppraiser,
            oaCompany,
            dateReceivedClaim,
            updatedAt: new Date().toISOString(),
          }
          onReportsStateChange(prev => ({ ...prev, summaryData: synced }))
          onSummaryDraftChange(synced)
          return
        }
      }
      // Fresh summary — generate client-side id, store inline immediately.
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
        dateReceivedClaim: claim.dateReceived || '',
        opposingAppraiser: notesData.appraiserName || '',
        oaCompany: notesData.appraiserCompany || '',
      }
      onReportsStateChange(prev => ({ ...prev, summaryId: id, summaryData: summary }))
      onSummaryDraftChange(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open summary page')
      setSelectedReport(null)
    } finally {
      setCreatingSummary(false)
    }
  }

  // Writes go into BOTH the parent-held draft (for the active editor view)
  // AND reportsState.summaryData (for the claim's 2s auto-save loop). No
  // separate debounce / summaries-table write — that was the fragile path.
  const handleSummaryChange = (next: SavedSummary) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    onSummaryDraftChange(stamped)
    onReportsStateChange(prev => ({ ...prev, summaryData: stamped }))
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
    const handlePrintSummary = async () => {
      if (!summaryDraft) {
        await alertDialog({
          title: 'Summary not ready',
          message: 'The summary draft hasn\'t loaded yet. Wait a moment and try again.',
          variant: 'danger',
        })
        return
      }
      if (!editingId) {
        await alertDialog({
          title: 'Save the claim first',
          message: 'This claim hasn\'t been saved yet, so the printed Summary can\'t be filed into Documents. Go to Claim Info and click Create Claim first.',
          variant: 'danger',
        })
        return
      }
      // Generate PDF server-side (bulletproof — no html2canvas quirks), file
      // a copy into Documents, then prompt the user to pick a save location.
      // Picker-first (see save-pdf.ts and docs/BUGS.md 2026-10-13).
      setSummaryPrinting(true)
      const name = `${claim.maNumber || 'claim'}-summary.pdf`
      try {
        await savePdfPickerFirst(
          name,
          async () => {
            const res = await fetch(`/api/claims/${editingId}/summary/generate-pdf`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ summaryId: summaryDraft.id, summary: summaryDraft }),
            })
            if (!res.ok) {
              const errText = await res.text().catch(() => '')
              throw new Error(errText || `generate-pdf failed with ${res.status}`)
            }
            return res.blob()
          },
          async (blob, filename) => {
            await onDocumentSaved?.(blob, filename, 'summary')
          },
        )
      } catch (err) {
        console.error('[summary-print] failed:', err)
        await alertDialog({
          title: 'Print failed',
          message: err instanceof Error ? err.message : String(err),
          variant: 'danger',
        })
      } finally {
        setSummaryPrinting(false)
      }
    }
    return (
      <div className="space-y-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-black text-lg font-bold tracking-tight">Summary Page</CardTitle>
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
          <CardContent className="space-y-4 pt-0 flat-cards">
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
                <SummaryFields
                  summary={summaryDraft}
                  onChange={handleSummaryChange}
                  viewerId={viewerId}
                  viewerName={viewerName}
                  isAdmin={viewerIsAdmin}
                />
                <SummaryPrintDoc summary={summaryDraft} />
              </>
            ) : null}
          </CardContent>
        </Card>
        {/* Primary action — bottom-right, outside the Card (matches Closing
            Notes / Award). */}
        <div className="flex justify-end">
          <Button
            onClick={handlePrintSummary}
            disabled={!summaryDraft || summaryPrinting}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            {summaryPrinting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Printer className="w-4 h-4 mr-2" />
            )}
            Print Report
          </Button>
        </div>
      </div>
    )
  }

  // Award Agreement form
  if (selectedReport === 'award-agreement') {
    return (
      <div className="space-y-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-black text-lg font-bold tracking-tight">Award Agreement</CardTitle>
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
          <CardContent className="space-y-3 pt-0">
            {/* Variant toggle — controls the value-line label and whether the
                ACV-specific exclusion clause prints. Auto-defaulted from
                claim.claimTypes; user can still override here. */}
            <div>
              <label className={labelCls}>Award Type</label>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {([
                  ['acv', 'ACV'],
                  ['dv', 'DV'],
                  ['estimate', 'Estimate Dispute'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAwardType(value)}
                    className={cn(
                      'px-3 py-2 text-sm font-semibold rounded-lg border transition-all',
                      awardType === value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Insurance Company</label>
                <InlineEditText
                  value={awardData.insuranceCompany}
                  onChange={(v) => setAward('insuranceCompany', v)}
                />
              </div>
              <div>
                <label className={labelCls}>Vehicle Owner</label>
                <InlineEditText
                  value={awardData.vehicleOwner}
                  onChange={(v) => setAward('vehicleOwner', v)}
                />
              </div>
              <div>
                <label className={labelCls}>Vehicle</label>
                <InlineEditText
                  value={awardData.vehicle}
                  onChange={(v) => setAward('vehicle', v)}
                />
              </div>
              <div>
                <label className={labelCls}>Claim Number</label>
                <InlineEditText
                  value={awardData.claimNumber}
                  onChange={(v) => setAward('claimNumber', v)}
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
                <label className={labelCls}>
                  {awardType === 'dv' ? 'Diminished Value (DV)'
                    : awardType === 'estimate' ? 'Amount of Loss (Final Cost of Repair)'
                    : 'Actual Cash Value (ACV)'}
                </label>
                <InlineEditCurrency
                  placeholder="$0.00"
                  value={awardValueDisplay}
                  onChange={(val) => onReportsStateChange(prev => ({
                    ...prev,
                    awardData: { ...prev.awardData, acvAmountNum: val },
                    notesData: {
                      ...prev.notesData,
                      agreementAmountNum: val,
                      // When the claim proceeded to umpire, Closing Notes'
                      // umpire-variant "Umpire Ruling Amount" field is the
                      // same conceptual value as the Award / Agreement
                      // amount. Mirror so a single edit in any surface
                      // fills all three.
                      ...(proceededToUmpire ? { umpireAmountNum: val } : {}),
                    },
                  }))}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-2">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Appraisers</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Appraiser 1</label>
                  <InlineEditTextarea
                    rows={2}
                    placeholder="Name / Company"
                    value={awardData.signatureBlock1}
                    onChange={(v) => setAward('signatureBlock1', v)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Appraiser 2</label>
                  <InlineEditTextarea
                    rows={2}
                    placeholder="Name / Company"
                    value={awardData.signatureBlock2}
                    onChange={(v) => setAward('signatureBlock2', v)}
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

        <div className="flex justify-end">
          <Button onClick={downloadAwardPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Print Report
          </Button>
        </div>
      </div>
    )
  }

  // Closing Notes form
  if (selectedReport === 'closing-notes') {
    const isUmpire = notesType === 'acv-umpire' || notesType === 'dv-umpire' || notesType === 'estimate-umpire'
    const isEstimate = notesType === 'estimate' || notesType === 'estimate-umpire'

    return (
      <div className="space-y-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-black text-lg font-bold tracking-tight">Closing Notes</CardTitle>
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
          <CardContent className="space-y-3 pt-0">
            {/* Top row — Date + Our Value side-by-side (both narrow fields),
                followed by Assignment Type picker on a single row below. */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-40">
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={notesData.date}
                  onChange={(e) => setNotes('date', e.target.value)}
                />
              </div>
              <div className="w-[180px]">
                <label className={labelCls}>
                  {notesType === 'acv' || notesType === 'acv-umpire' ? 'Our Appraised Value (ACV)'
                    : notesType === 'dv' || notesType === 'dv-umpire' ? 'Our Appraised DV'
                    : 'Our Appraised Value'}
                </label>
                {(notesType === 'acv' || notesType === 'acv-umpire') && result.acv > 0 ? (
                  <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 font-medium tabular-nums">
                    {formatCurrency(result.acv)}
                  </div>
                ) : (notesType === 'dv' || notesType === 'dv-umpire') && liveDvAmount > 0 ? (
                  // Live DV amount from the DV tab — readonly, same pattern as
                  // the ACV live-value chip above. User can still override via
                  // the dvValueNum fallback by zeroing the DV tab inputs.
                  <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 font-medium tabular-nums">
                    {formatCurrency(liveDvAmount)}
                  </div>
                ) : (
                  // Editable fallback — binds to the per-notesType value field
                  // so edits here mirror Claim Info's "MA Value (ACV / DV / Est)"
                  // row for the same type. Without this, estimate disputes
                  // showed a blank Our Appraised Value here even when the user
                  // had entered MA Value (Est) on Claim Info (which stores to
                  // notesData.estValueNum, not maValueNum). Henry 2026-10-14.
                  //
                  // Display falls back to maValueNum for legacy claims that
                  // stored their value there before the typed-specific fields
                  // existed, so pre-2026-10-14 DV / Est claims still render
                  // the right amount here. New writes always go to the typed
                  // field for forward compat.
                  <InlineEditCurrency
                    value={
                      notesType === 'estimate' || notesType === 'estimate-umpire'
                        ? ((notesData.estValueNum ?? 0) || notesData.maValueNum)
                      : notesType === 'dv' || notesType === 'dv-umpire'
                        ? ((notesData.dvValueNum ?? 0) || notesData.maValueNum)
                      : notesData.maValueNum
                    }
                    onChange={(val) => setNotes(
                      notesType === 'estimate' || notesType === 'estimate-umpire' ? 'estValueNum'
                      : notesType === 'dv' || notesType === 'dv-umpire' ? 'dvValueNum'
                      : 'maValueNum',
                      val,
                    )}
                  />
                )}
              </div>
            </div>

            {/* Type selector — single row of 6 chips, compact */}
            <div>
              <label className={labelCls}>Assignment Type</label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
                {([
                  ['acv', 'ACV'],
                  ['dv', 'DV'],
                  ['estimate', 'Est Dispute'],
                  ['acv-umpire', 'ACV→Umpire'],
                  ['dv-umpire', 'DV→Umpire'],
                  ['estimate-umpire', 'Est→Umpire'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setNotesType(value)}
                    className={cn(
                      'px-2.5 py-1.5 text-[12.5px] font-semibold rounded-md border transition-all',
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

            <div className="border-t border-gray-100 pt-2">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Opposing Appraiser</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
                <div className="max-w-xs">
                  <label className={labelCls}>Full Name</label>
                  <InlineEditText
                    placeholder="John Smith"
                    value={notesData.appraiserName}
                    onChange={(v) => setNotes('appraiserName', v)}
                  />
                </div>
                <div className="max-w-xs">
                  <label className={labelCls}>Company</label>
                  <InlineEditText
                    placeholder="National Appraisers"
                    value={notesData.appraiserCompany}
                    onChange={(v) => setNotes('appraiserCompany', v)}
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
                <div className="max-w-[180px]">
                  <label className={labelCls}>Their Appraised Value</label>
                  <InlineEditCurrency
                    value={notesData.appraiserValueNum}
                    onChange={(val) => setNotes('appraiserValueNum', val)}
                  />
                </div>
              </div>
            </div>

            {/* Repair Shop Estimate (Estimate Dispute only) */}
            {isEstimate && (
              <div className="border-t border-gray-100 pt-2">
                <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Repair Shop</h4>
                <div className="max-w-[180px]">
                  <label className={labelCls}>Repair Shop Estimate</label>
                  <InlineEditCurrency
                    value={notesData.repairShopAmountNum ?? 0}
                    onChange={(val) => setNotes('repairShopAmountNum', val)}
                  />
                </div>
              </div>
            )}

            {/* Agreement or Umpire fields.
                Agreement amount, Award amount of loss, and (when umpire)
                Umpire Ruling Amount are a single conceptual value — the
                final dollar award on the claim. Keep them mirrored across
                Claim Info / Award / Closing Notes so editing in any one
                surface populates the others. */}
            <div className="border-t border-gray-100 pt-2">
              {!isUmpire ? (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Agreement</h4>
                  <div className="max-w-[180px]">
                    <label className={labelCls}>{proceededToUmpire ? 'Umpire Ruling Award' : 'Award Amount'}</label>
                    <InlineEditCurrency
                      value={notesData.agreementAmountNum}
                      onChange={(val) => onReportsStateChange(prev => ({
                        ...prev,
                        awardData: { ...prev.awardData, acvAmountNum: val },
                        notesData: {
                          ...prev.notesData,
                          agreementAmountNum: val,
                          ...(proceededToUmpire ? { umpireAmountNum: val } : {}),
                        },
                      }))}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Umpire</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md">
                    <div>
                      <label className={labelCls}>Umpire Name</label>
                      <InlineEditText
                        placeholder="Darren DiMaria"
                        value={notesData.umpireName}
                        onChange={(v) => setNotes('umpireName', v)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Umpire Ruling Amount</label>
                      <InlineEditCurrency
                        value={notesData.umpireAmountNum}
                        onChange={(val) => onReportsStateChange(prev => ({
                          ...prev,
                          awardData: { ...prev.awardData, acvAmountNum: val },
                          notesData: {
                            ...prev.notesData,
                            agreementAmountNum: val,
                            umpireAmountNum: val,
                          },
                        }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview — editable. By default the textarea shows the auto-
                built narrative (notesPreview). If the user types in it we
                stash their text in notesData.commentsOverride and from then
                on the preview AND the printed PDF both use the override. The
                "Reset to auto" button clears the override so future field
                edits (Our Value / OA Value / etc.) start propagating back
                into the narrative. */}
            <div className="border-t border-gray-100 pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</h4>
                {(notesData.commentsOverride ?? '').trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNotes('commentsOverride', '')}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-wide"
                    title="Discard your edits and rebuild from the fields above"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-md p-3 text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-y min-h-[220px]"
                value={notesData.commentsOverride && notesData.commentsOverride.length > 0 ? notesData.commentsOverride : notesPreview}
                onChange={(e) => setNotes('commentsOverride', e.target.value)}
                spellCheck
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={downloadNotesPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Print Report
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
    negotiatingAppraiser: '',
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
    deductible: 0,
    vin: '',
    year: 0,
    make: '',
    model: '',
    trim: '',
    engine: '',
    drivetrain: '',
    transmission: '',
    fuelType: '',
    bodyType: '',
    vehicleLocationContact: '',
    mileage: 0,
    zip: '',
    radius: 200,
    vehicleLocationName: '',
    vehicleLocationAddress: '',
    claimTypes: [],
  }
}

// ── Subject-spec matching ────────────────────────────────────────────────────
// Comps must match the subject vehicle's specs by default. Matching is done
// client-side on the fetched listings (not via API params) so toggling a spec
// on/off is instant and never costs extra MarketCheck/Auto.dev calls.

type MatchKey = 'trim' | 'engine' | 'drivetrain' | 'transmission' | 'fuelType' | 'bodyType'

const MATCH_LABELS: Record<MatchKey, string> = {
  trim: 'Trim',
  engine: 'Engine',
  drivetrain: 'Drive',
  transmission: 'Trans',
  fuelType: 'Fuel',
  bodyType: 'Body',
}

// Transmission off by default: listing data is too noisy ("8-Speed Automatic"
// vs "Automatic") to be a useful default gate. Body on by default — the
// API-edge normalisation collapses MarketCheck's "Hatchback" and NHTSA's
// "Sport Utility Vehicle [SUV]" into the same canonical BODY_TYPE_OPTIONS
// value, so a cross-source comparison is stable.
function defaultMatchSubject(): Record<MatchKey, boolean> {
  return { trim: true, engine: true, drivetrain: true, transmission: false, fuelType: true, bodyType: true }
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

// Body-type match. Both sides have already been passed through the shared
// normalizeBodyType collapse at the API edge (comps) and VIN decode (subject),
// but we re-normalise here so manual user edits (typing "sedan" into the
// Body Type dropdown's "Other" freeform entry, etc.) still compare cleanly.
// Empty subject OR empty comp side is treated as "unknown → let it pass"
// rather than failing the match — avoids filtering out listings where the
// upstream feed just didn't populate body_type.
function normBodyType(s: string): string {
  const canonical = normalizeBodyType(s)
  if (canonical) return canonical.toLowerCase()
  return (s || '').toLowerCase().trim()
}

function matchesSubjectSpec(key: MatchKey, subjectVal: string, compVal: string): boolean {
  switch (key) {
    case 'trim': return matchesTrim(subjectVal, compVal)
    case 'engine': return matchesEngine(subjectVal, compVal)
    case 'drivetrain': return normDrivetrain(compVal) === normDrivetrain(subjectVal)
    case 'transmission': return normTransmission(compVal) === normTransmission(subjectVal)
    case 'fuelType': return normFuel(compVal) === normFuel(subjectVal)
    case 'bodyType': {
      const s = normBodyType(subjectVal)
      const c = normBodyType(compVal)
      if (!s || !c) return true
      return s === c
    }
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
  { id: 'forms', label: 'Forms', step: 17 },
  { id: 'reports-hub', label: 'Reports', step: 15 },
  { id: 'activity', label: 'Activity', step: 18 },
] as const

const TOOL_TABS = [
  { id: 'acv', label: 'ACV Report', step: 2 },
  { id: 'dv', label: 'Diminished Value', step: 11 },
  { id: 'lou', label: 'LOU', step: 19 },
  { id: 'estimate', label: 'Estimate Dispute', step: 7 },
  { id: 'storage', label: 'Storage Charges', step: 16 },
  { id: 'award', label: 'Award', step: 9 },
  { id: 'notes', label: 'Closing Notes', step: 8 },
  { id: 'summary', label: 'Summary', step: 5 },
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
  if (step === 16) return 'storage'
  if (step === 19) return 'lou'
  if (step === 13) return 'messages'
  if (step === 14) return 'guidelines'
  if (step === 15) return 'reports-hub'
  if (step === 17) return 'forms'
  if (step === 18) return 'activity'
  return 'acv' // 2-4 stepper + 6 (Loss Search lives inside the ACV tab)
}

function stepForTab(tab: string | null): number | null {
  const all = [...CLAIM_TABS, ...TOOL_TABS]
  const t = all.find((x) => x.id === tab)
  if (t) return t.step
  if (tab === 'loss') return 6 // old deep links
  return null
}

// Section card with a navy title bar + white content area. Used across the
// Claim Info read-mode layout to give each group (Owner / Vehicle / etc.) a
// clear visual boundary without inflating height. Content body passes through
// as children so callers can render rows, grids, or free-form content.
function SectionCard({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md overflow-hidden', className)}>
      <div className="bg-slate-700 text-white px-3 py-1.5 text-[13px] font-bold tracking-tight flex items-center justify-between">
        <span>{title}</span>
        {action}
      </div>
      <div className="bg-white">{children}</div>
    </div>
  )
}

// Label/value row for use inside a SectionCard. Thin dividers between
// sibling rows (via parent divide-y). Narrow label column, value flexes.
function SectionRow({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '' || value === 0
  return (
    <div className="flex items-baseline gap-3 px-3 py-1.5">
      <span className="text-[11.5px] font-medium text-slate-500 w-28 shrink-0">{label}</span>
      <span className="text-[13px] text-slate-900 flex-1 min-w-0 break-words">
        {empty ? <span className="text-slate-400">—</span> : value}
      </span>
    </div>
  )
}

// Claim workspace header — MA #/CL #/Vehicle/Client/Owner shown as equally-
// weighted stats rather than one big title + small subtitle.
function ClaimHeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-0.5">{label}</div>
      <div className="text-[15px] font-semibold text-slate-900 leading-snug break-words">{value || '—'}</div>
    </div>
  )
}

// Click-to-edit text field. Displays as a persistent subtle box (same visual
// as a normal input, no hover-only reveal). Clicking swaps in a focused edit
// input with a blue border. Blur / Enter commits back to the display box.
function InlineEditText({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Focus only — don't auto-select the whole value. Matches the behavior
    // of regular inputs on ACV / Valuations so clicking a field drops the
    // cursor where you clicked instead of highlighting everything.
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])
  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        placeholder={placeholder}
        className="w-full bg-white border border-blue-500 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      // Entering via keyboard (Tab) should drop you into the editable input
      // without a second keystroke — matches the behavior of plain inputs on
      // every other claim form. Mouse click triggers onFocus too, which is
      // fine — the resulting setEditing(true) call is idempotent.
      onFocus={() => setEditing(true)}
      className="w-full text-left bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 cursor-text"
    >
      {value || <span className="text-slate-400">{placeholder || '—'}</span>}
    </button>
  )
}

// Click-to-edit multi-line text. Same persistent-box visual as the other
// InlineEdit components; line breaks preserved when displayed.
function InlineEditTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
}) {
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])
  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        placeholder={placeholder}
        className="w-full bg-white border border-blue-500 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
      className="w-full text-left bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 cursor-text whitespace-pre-wrap"
      style={{ minHeight: `${rows * 20 + 12}px` }}
    >
      {value || <span className="text-slate-400">{placeholder || '—'}</span>}
    </button>
  )
}

// Click-to-edit currency field. Same visual pattern as InlineEditText —
// persistent box, click to edit, displays formatted currency when idle.
function InlineEditCurrency({
  value,
  onChange,
  placeholder = '$0',
}: {
  value: number
  onChange: (val: number) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing && inputRef.current) {
      setRaw(value ? String(value) : '')
      inputRef.current.focus()
    }
  }, [editing, value])
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onChange(parseFloat(raw) || 0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setEditing(false)
            onChange(parseFloat(raw) || 0)
          } else if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
        className="w-full bg-white border border-blue-500 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
      className="w-full text-left bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 cursor-text tabular-nums"
    >
      {value ? formatCurrency(value) : <span className="text-slate-400">{placeholder}</span>}
    </button>
  )
}

function ClaimWorkspaceInner({ claimId, isLockedForMe }: { claimId: string; isLockedForMe: boolean }) {
  const router = useRouter()
  const isNew = claimId === 'new'
  // The localStorage draft only applies to a brand-new claim. Hydrating it for
  // an existing id would show a different claim's in-progress work.
  const draft = useRef(isNew ? getCompFinderDraft() : null)
  // Opening a claim ALWAYS lands on Claim Info unless the URL explicitly
  // targets the Messages tab (the only honored deep link, used by the
  // Messages button on the /messages queue dashboard). Previously honored
  // every ?tab= value, which meant external deep links / stale bookmarks /
  // whatever last tab the user had could override — Henry wants a stable
  // "open = Claim Info" rule (2026-10-10).
  const initialTab = useRef<string | null>(
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('tab') === 'messages' ? 'messages' : null)
      : null
  )
  // A brand-new claim shows ONLY Claim Info; the tool tabs unlock once the
  // claim exists (auto-save promotion or the Create Claim button).
  const [step, setStep] = useState(() => (isNew ? 1 : stepForTab(initialTab.current) ?? 1))
  const [acvPrinting, setAcvPrinting] = useState(false)
  const [acvPrintError, setAcvPrintError] = useState<string | null>(null)
  // Cover-page toggle for ACV print. Starts on; unchecking strips page 1
  // server-side (see /api/acv/generate-pdf). State is per-session, not
  // persisted on the claim — matches the "transient print option" intent.
  const [acvIncludeCover, setAcvIncludeCover] = useState(true)
  const [claim, setClaim] = useState<ClaimInfo>(() => {
    // Session-storage handoff drain — see createClaim's set and docs/BUGS.md.
    // When ClaimWorkspace mounts on /claims/{id} right after createClaim fired,
    // check for a handoff keyed by this id. If present, hydrate state directly
    // from the just-typed values so a remount can't blank the form.
    if (!isNew && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`claim-handoff-${claimId}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.claim) return parsed.claim as ClaimInfo
        }
      } catch { /* malformed — fall through to default/draft */ }
    }
    return draft.current?.claim ?? defaultClaim()
  })
  // Rough-numbers workflow (2026-10-13). Immutable after creation (editing
  // mid-claim doesn't make sense — the first Submit already consumed it or
  // skipped it). Default comes from the picked client's rough_numbers_default.
  // Hydrates from the createClaim handoff when this is a just-promoted claim.
  const [needsRoughNumbers, setNeedsRoughNumbers] = useState<boolean>(() => {
    if (!isNew && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`claim-handoff-${claimId}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && 'needsRoughNumbers' in parsed) return parsed.needsRoughNumbers === true
        }
      } catch { /* ignore */ }
    }
    return false
  })
  // Rough-numbers handoff timestamp. Null until the first Submit on a
  // needs_rough_numbers claim lands — then stamped by the submit route.
  // Used to decide whether the Complete Report handoff is available: when
  // rough numbers is pending (true + null here), the appraiser's "finish"
  // action must route to the Rough Numbers inbox owner first, regardless
  // of the Negotiating Appraiser on the file.
  const [roughNumbersHandoffAt, setRoughNumbersHandoffAt] = useState<string | null>(null)
  // Umpire tracking (2026-10-15). Hydrated from the fetched entry below.
  const [proceededToUmpire, setProceededToUmpire] = useState<boolean>(false)
  const [umpireAgreement, setUmpireAgreement] = useState<boolean>(true)
  const onUmpireChange = useCallback(async (next: { proceededToUmpire: boolean; umpireAgreement: boolean }) => {
    if (!claimId || isNew) return
    // Optimistic local update so the toggle feels instant.
    const prevProceeded = proceededToUmpire
    const prevAgreement = umpireAgreement
    setProceededToUmpire(next.proceededToUmpire)
    setUmpireAgreement(next.umpireAgreement)
    try {
      const res = await fetch(`/api/claims/${claimId}/umpire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Revert on failure so the UI matches server state.
        setProceededToUmpire(prevProceeded)
        setUmpireAgreement(prevAgreement)
        alertDialog({
          title: 'Could not update umpire status',
          message: body.error ?? `Request failed (${res.status})`,
          variant: 'danger',
        })
        return
      }
      const body: { phase?: string | null } = await res.json().catch(() => ({}))
      // Keep local phase state in sync so the phase chip in the header
      // updates without waiting for a refetch.
      if (body.phase !== undefined) {
        setStatusPhase(body.phase)
        setStatusPhaseSetAt(body.phase === null ? null : new Date().toISOString())
      }
    } catch (err) {
      setProceededToUmpire(prevProceeded)
      setUmpireAgreement(prevAgreement)
      alertDialog({
        title: 'Could not update umpire status',
        message: err instanceof Error ? err.message : String(err),
        variant: 'danger',
      })
    }
  }, [claimId, isNew, proceededToUmpire, umpireAgreement])
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
  // On an existing-claim mount (and on just-promoted mounts where the handoff
  // skipped the DB fetch), initialize editingId from the URL so saves/addDocs
  // route to the right row. The load effect still calls setEditingId(entry.id)
  // which is a no-op when the values match.
  const [editingId, setEditingId] = useState<string | null>(() => (isNew ? null : claimId))
  // Linked canonical client (see Marketing migration). Null on claims created
  // before the Marketing rollout; will backfill in a later session. Hydrates
  // from the createClaim handoff when this is a just-promoted claim (see
  // docs/BUGS.md 2026-10-13).
  const [clientId, setClientId] = useState<string | null>(() => {
    if (!isNew && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`claim-handoff-${claimId}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && 'clientId' in parsed) return (parsed.clientId as string | null) ?? null
        }
      } catch { /* ignore */ }
    }
    return null
  })
  // Seed the "Needs rough numbers?" toggle AND the RTA claim-type chip
  // from the picked client's defaults when creating a new claim. User
  // can still flip either after. No-op on existing claims (both are
  // immutable-ish after creation; RTA can still be toggled from the chip
  // picker but we don't auto-add on client change for a saved claim).
  useEffect(() => {
    if (!isNew) return
    if (!clientId) { setNeedsRoughNumbers(false); return }
    let cancelled = false
    void (async () => {
      const { fetchClient } = await import('@/lib/supabase/clients')
      const c = await fetchClient(clientId)
      if (cancelled) return
      setNeedsRoughNumbers(c?.roughNumbersDefault === true)
      // Auto-add 'rta' when the client is RTA-default (Henry 2026-10-18:
      // every Sedgwick claim). Only ADD — never remove — so switching to a
      // non-RTA client doesn't silently drop the chip after the user may
      // have toggled it on explicitly.
      if (c?.rtaDefault === true) {
        setClaim(prev => {
          const types = prev.claimTypes ?? []
          if (types.includes('rta')) return prev
          return { ...prev, claimTypes: ['rta', ...types] }
        })
      }
    })()
    return () => { cancelled = true }
  }, [clientId, isNew])
  const [reportsState, setReportsState] = useState<ReportsState>(() => {
    // Session-storage handoff drain — mirrors the `claim` initializer at the
    // top of this component. When ClaimWorkspace mounts on /claims/{id} right
    // after createClaim fired, prefer the just-typed reportsState (which
    // carries Opposing Appraiser + Ins. Co. Offer from the Create form) over
    // defaultReportsState so a remount OR the handoff path's load-skip can't
    // blank them. The load effect drains the whole handoff on its own.
    if (!isNew && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`claim-handoff-${claimId}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.reportsState) return parsed.reportsState as ReportsState
        }
      } catch { /* malformed — fall through to default/draft */ }
    }
    return draft.current?.reportsState ?? defaultReportsState(draft.current?.claim ?? defaultClaim())
  })
  const [mileageRate, setMileageRate] = useState(() => draft.current?.mileageRate ?? 0)
  const [sortBy, setSortBy] = useState<'default' | 'mileage-closest' | 'mileage-low' | 'mileage-high' | 'price-low' | 'price-high' | 'year-new' | 'year-old' | 'distance'>('default')
  const [activeFilters, setActiveFilters] = useState<{ trim: string[]; drivetrain: string[]; transmission: string[]; engine: string[]; fuelType: string[]; bodyType: string[] }>({ trim: [], drivetrain: [], transmission: [], engine: [], fuelType: [], bodyType: [] })
  // Which subject specs comps must match (toggleable chips above the results).
  const [matchSubject, setMatchSubject] = useState<Record<MatchKey, boolean>>(
    () => draft.current?.matchSubject ?? defaultMatchSubject()
  )
  const [compsPage, setCompsPage] = useState(1)
  const COMPS_PER_PAGE = 30
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Claim workspace additions: status, per-claim tool data, load state.
  const [status, setStatus] = useState<ClaimStatus>('open')
  // Why the claim is closed: 'completed' | 'cancelled' | null (legacy or
  // open). Flipped by the admin "Change to Cancelled / Change to Completed"
  // button in the closed-claim action row — see /api/claims/[id]/change-close-reason.
  const [closeReason, setCloseReason] = useState<'completed' | 'cancelled' | null>(null)
  // Role-based workflow state (Task 11). Writes go through /api/claims/[id]/*
  // routes — these setters only reflect what the API returned so the UI updates
  // without a full page reload.
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  // Workflow stage — one of main/qc/billing_delivery/payment. Drives the
  // "Advance to [next stage]" button on the workspace header.
  const [workflowStage, setWorkflowStage] = useState<'main'|'qc'|'billing_delivery'|'payment'>('main')
  // Hydrated for parity with the server row; not rendered yet. Future work will
  // surface "submitted by X" in the banner.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [submittedBy, setSubmittedBy] = useState<string | null>(null)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [statusPhase, setStatusPhase] = useState<string | null>(null)
  const [statusPhaseSetAt, setStatusPhaseSetAt] = useState<string | null>(null)
  // Row-level descriptors (not phases, not claim-types). See
  // supabase/migration-claim-labels.sql. supplementCount and isRevision
  // are server-owned (only /api/claims/[id]/reopen writes them); the
  // workspace just reads them from the loaded entry and reflects any
  // reopen-API response. Specialty is a chip inside claim.claimTypes
  // (not a dedicated column) and rides the normal autosave.
  const [supplementCount, setSupplementCount] = useState<number>(0)
  const [isRevision, setIsRevision] = useState<boolean>(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  // Insurance company names from the guidelines directory — fuels the
  // Insurance Company autocomplete so typed values match a guideline exactly.
  const [insuranceCompanyOptions, setInsuranceCompanyOptions] = useState<string[]>([])
  const { profile } = useCurrentProfile()
  const { activeCompanyId, activeCompany } = useActiveCompany()
  const wsFileLabel = fileNumberLabel(activeCompany?.slug ?? null)
  const { memberIds: wsMemberIds } = useCurrentCompanyMembers()
  // Direct-URL guard: if a non-admin without the create grant lands on
  // /claims/new (e.g. bookmark, address-bar), silently bounce to the
  // dashboard. RLS blocks the insert anyway; this just prevents a
  // confusing dead-end form.
  useEffect(() => {
    if (!isNew) return
    if (profile === null) return          // still loading
    const canCreate =
      profile.role === 'admin' ||
      profile.canCreateClaims === true
    if (!canCreate) router.replace('/')
  }, [isNew, profile, router])
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
  //
  // Non-admin lock: only if the claim is closed OR we're not the assignee.
  // We used to also lock after Submit, but Henry wants appraisers to keep
  // editing after they hit Submit (they may need to attach a late doc or
  // fix a typo). Admins are never locked out; they can still edit closed
  // claims via the workspace and re-close afterward.
  // Lockout extends read-only: on a claim where the user is locked out for
  // silence, everything in the workspace is disabled except the Messages tab
  // (which lives outside the fieldset wrapper below). Posting a non-auto
  // message on this claim clears status_lockout_at via DB trigger — next
  // navigation sees the lockout gone.
  const readOnly = !isAdmin && !isNew && (isClosed || (!!userId && !isAssignee) || isLockedForMe)

  // Mark this claim as viewed by the current user (fires on mount + when
  // the editingId changes). Fire-and-forget; failures are silent (a missed
  // mark just leaves the row gray on the dashboard until the next open).
  // Skipped for admins — they don't see the unread highlight anyway.
  useEffect(() => {
    if (!editingId || isAdmin) return
    fetch(`/api/claims/${editingId}/mark-viewed`, { method: 'POST' }).catch(() => {})
  }, [editingId, isAdmin])

  const [auctionListings, setAuctionListings] = useState<LossListing[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [estimate, setEstimate] = useState<any>(undefined)
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [dv, setDv] = useState<DVState | null>(null)
  const [lou, setLou] = useState<LOUState | null>(null)
  const [invoice, setInvoice] = useState<InvoiceReportState | null>(null)
  const [storage, setStorage] = useState<StorageState | null>(null)
  // Summary draft is held here so switching between the Summary / Award /
  // Notes tabs (which unmount+remount ReportsStep) doesn't lose unsaved edits.
  const [summaryDraft, setSummaryDraft] = useState<SavedSummary | null>(null)
  // Preserve a legacy row's mode ('auto-acv' / 'auction') on save so nothing churns.
  const modeRef = useRef<string>('comp-finder')
  const [loadingClaim, setLoadingClaim] = useState(!isNew)
  // Edit lock state for Claim Info — lifted here so the toggle button can
  // live in the Card header next to the title. New claims always start
  // unlocked (nothing to protect yet).
  const [claimInfoEditMode, setClaimInfoEditMode] = useState<boolean>(isNew)
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
    // Session-storage handoff from createClaim — if present, state was already
    // hydrated from it by the useState initializers above. Drain it (so a
    // subsequent manual refresh re-fetches from DB) and skip the fetch so we
    // don't clobber the just-typed values with potentially-stale DB data.
    if (typeof window !== 'undefined') {
      const handoffKey = `claim-handoff-${claimId}`
      if (sessionStorage.getItem(handoffKey)) {
        sessionStorage.removeItem(handoffKey)
        setLoadingClaim(false)
        return
      }
    }
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
      setCloseReason(entry.closeReason ?? null)
      setAssignedTo(entry.assignedTo ?? null)
      setSubmittedAt(entry.submittedAt ?? null)
      setSubmittedBy(entry.submittedBy ?? null)
      setWorkflowStage(entry.workflowStage ?? 'main')
      setStatusPhase(entry.statusPhase ?? null)
      setStatusPhaseSetAt(entry.statusPhaseSetAt ?? null)
      setSupplementCount(entry.supplementCount ?? 0)
      setIsRevision(entry.isRevision ?? false)
      setNeedsRoughNumbers(entry.needsRoughNumbers === true)
      setRoughNumbersHandoffAt(entry.roughNumbersHandoffAt ?? null)
      setProceededToUmpire(entry.proceededToUmpire === true)
      setUmpireAgreement(entry.umpireAgreement !== false)
      setAuctionListings((entry.auctionListings as LossListing[] | undefined) ?? [])
      setEstimate(entry.estimate)
      setDocuments((entry.documents as ClaimDocument[] | undefined) ?? [])
      setDv((entry.dv as DVState | undefined) ?? null)
      setLou((entry.lou as LOUState | undefined) ?? null)
      setInvoice((entry.invoice as InvoiceReportState | undefined) ?? null)
      setStorage((entry.storage as StorageState | undefined) ?? null)
      // Clear any in-memory summary draft from a prior claim; the Summary tab
      // will refetch via summaryId when the user opens it.
      setSummaryDraft(null)
      setClientId(entry.clientId ?? null)
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
      // Henry 2026-10-10: always land on Claim Info unless the URL asked for
      // Messages. Previously fell through to ACV step 3 when comps existed,
      // which surprised users who opened a mid-work claim and landed on
      // the ACV stepper instead of the summary.
      setStep(stepForTab(initialTab.current) ?? 1)
      initialTab.current = null
      // Reset the auto-save gate — the batched state updates below will fire
      // the auto-save effect, and we want it to skip that first run so a
      // freshly-loaded claim doesn't flash "Unsaved changes". Also stamp a
      // 3-second grace window to also skip any downstream sync effects
      // (Award ↔ Notes mirrors, variant auto-pick) that fire after the load.
      initialLoadDone.current = false
      autoSaveGraceUntilRef.current = Date.now() + 3000
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
  // Grace window after any load during which auto-save firings are ignored.
  // Several sync effects (Award ↔ Notes field mirrors, award-type auto-pick,
  // etc.) run AFTER the loader completes and mutate reportsState, which would
  // otherwise flash "Unsaved changes" on every claim open / refresh even
  // though no user edit happened. The loader stamps this ref to now()+3s so
  // the auto-save effect skips those sync-driven state updates and only
  // fires on real post-load user edits.
  const autoSaveGraceUntilRef = useRef(0)
  const editingIdRef = useRef(editingId)
  useEffect(() => { editingIdRef.current = editingId }, [editingId])
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Captures the Notes text parsed from an Eagle View assignment PDF, so
  // we can post it as an auto-message the moment the claim has an id.
  const pendingAutoNoteRef = useRef<string>('')
  // Captures the raw assignment-sheet PDF File so we can auto-attach it to
  // the claim's Documents tab labeled {MA#}-uploadedassignsheet.pdf after
  // the first save gives us an id + the DB trigger assigns a real MA#.
  const pendingAssignmentSheetRef = useRef<File | null>(null)
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      return
    }
    // Within the post-load grace window → ignore. Sync effects after loader
    // completes are not user edits and shouldn't trigger "Unsaved changes".
    if (Date.now() < autoSaveGraceUntilRef.current) return
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
      saveToHistory(claim, builtComps, adjustments, result, modeRef.current, id, mileageRate, reportsState, { status, auctionListings, estimate, documents, dv, lou, invoice, storage, clientId, needsRoughNumbers }, activeCompanyId)
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
  }, [claim, selectedIds, compAdjs, adjustments, reportsState, mileageRate, status, auctionListings, estimate, documents, dv, lou, invoice, storage, clientId, needsRoughNumbers])

  // Keep ?tab= in the URL in sync (survives refresh, deep-linkable) without
  // triggering a Next.js navigation.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tabForStep(step))
    window.history.replaceState(null, '', url.toString())
  }, [step])

  // Live duplicate check on VIN + Claim # + MA # against every other claim
  // in the system (uses service-role backend so appraisers see cross-team
  // dupes, not just their own). Debounced 500ms. Excludes the current claim's
  // own id when editing an existing one so it doesn't self-match. Duplicates
  // don't lock anything — they're informational (Modern Appraisers can be
  // legitimately hired on a different loss for the same vehicle).
  const duplicates = useDuplicateCheck(claim.vin, claim.claimNumber, claim.maNumber, editingId)

  // Filter which tool tabs to show based on claim.claimTypes AND the current
  // user's per-profile disabledTools list. Award / Notes / Summary / Invoice
  // are always visible by claim-type (they finalize any claim type) but STILL
  // honor disabledTools so an admin can hide them per user. Empty claimTypes
  // = show all tools by type (backward compat for pre-existing claims).
  const disabledToolSet = useMemo(() => new Set(profile?.disabledTools ?? []), [profile?.disabledTools])
  const visibleToolTabs = useMemo(() => {
    const types = claim.claimTypes ?? []
    const other = types.includes('other')
    const byType = (id: string): boolean => {
      if (types.length === 0) return true
      if (id === 'award' || id === 'notes' || id === 'summary') return true
      if (id === 'acv')      return other || types.includes('acv')
      if (id === 'dv')       return other || types.includes('dv')
      if (id === 'lou')      return other || types.includes('lou')
      if (id === 'estimate') return other || types.includes('estimate')
      if (id === 'storage')  return other || types.includes('storage')
      return true
    }
    return TOOL_TABS.filter(t => byType(t.id) && !disabledToolSet.has(t.id))
  }, [claim.claimTypes, disabledToolSet])

  const { sortedListings, bodyTypeAutoWidened } = useMemo(() => {
    // VIN decoders occasionally misclassify body type (classic case: Kia Soul
    // → "SUV" from MarketCheck when real listings are Hatchback/Wagon). When
    // strict matching eliminates every comp, we auto-drop the bodyType gate
    // (and surface a banner) so the user doesn't stare at an empty results
    // table and assume the search is broken. Any other spec match stays
    // strict — bodyType is the only known-flaky one.
    const applyFilters = (includeBodyType: boolean) => listings.filter((comp) => {
      if (!comp.id.startsWith('manual-')) {
        for (const key of Object.keys(MATCH_LABELS) as MatchKey[]) {
          if (key === 'bodyType' && !includeBodyType) continue
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
      if (activeFilters.bodyType.length > 0 && !activeFilters.bodyType.includes(comp.bodyType || '')) return false
      return true
    })

    const strict = applyFilters(true)
    let filtered = strict
    let widened = false
    // Auto-widen conditions: strict returned nothing, body-match was on, a
    // subject bodyType is actually present (nothing to widen if there's no
    // bodyType to begin with), and widening produces results. If widening
    // STILL yields zero, use strict (empty) so no misleading banner shows.
    if (strict.length === 0 && matchSubject.bodyType && (claim.bodyType || '').trim()) {
      const widenedList = applyFilters(false)
      if (widenedList.length > 0) {
        filtered = widenedList
        widened = true
      }
    }

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
    return { sortedListings: sorted, bodyTypeAutoWidened: widened }
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
    setActiveFilters({ trim: [], drivetrain: [], transmission: [], engine: [], fuelType: [], bodyType: [] })
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
      bodyType: '',
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

  const saveExtras = { status, auctionListings, estimate, documents, dv, lou, invoice, storage, clientId, needsRoughNumbers }

  // Auto-file a generated/printed report PDF into the claim's Documents tab.
  // Always numbers files of the same source per claim ("MA1234-award (1).pdf",
  // "MA1234-award (2).pdf", ...) so Henry can distinguish multiple saves of the
  // same report type (an updated award, a revised summary, etc).
  const addDocument = async (blob: Blob, name: string, source: ClaimDocument['source']) => {
    const id = editingIdRef.current
    if (!id) {
      console.warn(`[addDocument] skipped — no claim id yet (source=${source}, name=${name})`)
      return
    }
    const seq = documents.filter(d => d.source === source).length + 1
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    const numbered = `${stem} (${seq})${ext}`
    const doc = await uploadClaimDocument(id, blob, numbered, source)
    if (!doc) {
      // uploadClaimDocument already console.errors the reason (size, mime,
      // ext mismatch, storage API error) — this line marks WHICH caller lost
      // its upload so it's easier to correlate in dev tools.
      console.error(`[addDocument] uploadClaimDocument returned null for source=${source}, name=${numbered}, size=${blob.size}, type=${blob.type}`)
      return
    }
    // Invoices generated from Reports are internal billing artifacts —
    // insureds / claimants / opposing parties shouldn't ever see them.
    // Default to admin-only visibility when auto-filing; an admin can
    // toggle it back public from the Documents tab if ever needed.
    const next = source === 'invoice' ? { ...doc, adminOnly: true } : doc
    // Report-type sources: auto-archive any older same-source docs so only
    // the newest ACV / Award / etc. shows in the active Documents view. The
    // archived copies are still on disk + still downloadable from the
    // "Show archived" toggle; nothing is deleted.
    const willArchive = ARCHIVABLE_REPORT_SOURCES.has(source)
    const updatedExisting = willArchive
      ? documents.map(d => (d.source === source && !d.archived ? { ...d, archived: true } : d))
      : documents
    const newDocuments = [...updatedExisting, next]
    setDocuments(newDocuments)

    // IMMEDIATE SAVE — bypass the 2s debounced auto-save for document
    // uploads. The storage object is already in Supabase; if the user
    // refreshes before the debounce fires, the acv_history row's documents
    // array won't include the new doc and it looks "lost" even though the
    // bytes are on disk. Henry hit this with invoices 2026-10-12.
    //
    // Also clear the pending debounce timer so it doesn't fire again
    // redundantly with the same payload.
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    try {
      await saveToHistory(
        claim,
        builtComps,
        adjustments,
        result,
        modeRef.current,
        id,
        mileageRate,
        reportsState,
        { status, auctionListings, estimate, documents: newDocuments, dv, lou, invoice, storage, clientId, needsRoughNumbers },
        activeCompanyId,
      )
      setHasUnsavedChanges(false)
      console.log(`[addDocument] ✓ ${source} filed to Documents: ${numbered}`)
    } catch (err) {
      // Save failed — the storage blob is already on disk but the acv_history
      // row doesn't reference it. Surface a visible dialog so the user knows
      // what happened; previously this failed silently and the user thought
      // the whole thing worked, then the doc "disappeared" on refresh.
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[addDocument] immediate save FAILED for ${source}:`, msg)
      setHasUnsavedChanges(true)
      await alertDialog({
        title: `Could not file ${source} to Documents`,
        message: `The PDF uploaded to storage but the claim's documents list could not be updated. Reason: ${msg}\n\nTry refreshing and printing again. If this keeps happening, send Henry this error.`,
        variant: 'danger',
      })
    }
  }

  // Attach the stashed assignment-sheet PDF to this claim's Documents tab.
  // Called after createClaim and after save completes — needs both an id
  // and an MA# to produce the "{MA#}-uploadedassignsheet.pdf" filename.
  // If the MA# isn't in local state yet (new claim just inserted; trigger
  // just assigned it), fetches it directly from acv_history. Clears the
  // ref before uploading so a double-fire (e.g. race between createClaim
  // and auto-save) never produces a duplicate attachment.
  const uploadPendingAssignmentSheet = useCallback(async () => {
    const file = pendingAssignmentSheetRef.current
    if (!file) return
    const id = editingIdRef.current
    if (!id) return
    pendingAssignmentSheetRef.current = null

    let ma = claim.maNumber?.trim() || ''
    if (!ma) {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('acv_history')
          .select('ma_number')
          .eq('id', id)
          .maybeSingle()
        ma = ((data as { ma_number: string | null } | null)?.ma_number ?? '').trim()
      } catch { /* fall through — upload with no MA# prefix */ }
    }

    const stem = ma ? `${ma}-uploadedassignsheet` : 'uploadedassignsheet'
    await addDocument(file, `${stem}.pdf`, 'document')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addDocument + claim.maNumber are the only reads
  }, [claim.maNumber])

  const handleSaveClaim = async () => {
    if (builtComps.length < 1) return
    const savedId = await saveToHistory(claim, builtComps, adjustments, result, modeRef.current, editingId, mileageRate, reportsState, saveExtras, activeCompanyId)
    if (!editingId) setEditingId(savedId)
    editingIdRef.current = savedId
    setHasUnsavedChanges(false)
  }

  // Task 11 workflow: Submit / Approve (Close) / Reopen. Writes go through
  // dedicated API routes so the column-guard trigger enforces role-based rules.
  // Send Back was removed 2026-08-30 — Reassign now un-submits via /assign.
  // After each action we refetch the entry to sync the local UI with whatever
  // the server actually persisted.
  //
  // Confirmation is done via the in-app ConfirmDialog (see JSX below) rather
  // than the browser confirm() popup. `pendingWorkflow` holds the current
  // pending action; the dialog reads title/message from a lookup table.
  interface PendingWorkflow {
    path: 'submit' | 'approve' | 'send-back'
    title: string
    message: string
    confirmLabel: string
    variant: 'primary' | 'danger'
    // For 'approve': which close reason to POST. Ignored on other paths.
    reason?: 'completed' | 'cancelled'
  }
  const [pendingWorkflow, setPendingWorkflow] = useState<PendingWorkflow | null>(null)

  const runWorkflow = async () => {
    if (!pendingWorkflow) return
    if (!editingId) { setPendingWorkflow(null); return }
    const { path, reason } = pendingWorkflow
    // Capture stage before the request so the post-success redirect lands
    // on the dashboard tab the user was working from (Henry 2026-10-15).
    const previousStage = workflowStage
    setWorkflowBusy(true)
    const res = await fetch(`/api/claims/${editingId}/${path}`, {
      method: 'POST',
      headers: reason ? { 'Content-Type': 'application/json' } : undefined,
      body: reason ? JSON.stringify({ reason }) : undefined,
    })
    setWorkflowBusy(false)
    setPendingWorkflow(null)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Action failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    // After a successful submit or close (Complete / Cancelled), kick back
    // to the dashboard tab the user was in — the workspace step is done.
    // Reopen keeps the user in place because they typically want to keep editing.
    if (path === 'submit' || path === 'approve') {
      router.push(`/?tab=${previousStage}`)
      return
    }
    const fresh = await fetchACVEntry(editingId)
    if (fresh) {
      setStatus(fresh.status ?? 'open')
      setCloseReason(fresh.closeReason ?? null)
      setAssignedTo(fresh.assignedTo ?? null)
      setSubmittedAt(fresh.submittedAt ?? null)
      setSubmittedBy(fresh.submittedBy ?? null)
    }
  }

  // Non-admins only. Admins skip the submit step and close directly via the
  // Finalize dropdown (Complete / Cancel).
  const handleSubmit = () => {
    const isRoughNumbersSubmit = needsRoughNumbers && !roughNumbersHandoffAt
    setPendingWorkflow({
      path: 'submit',
      title: isRoughNumbersSubmit
        ? 'Submit rough numbers for admin review?'
        : 'Submit this claim for QC?',
      message: isRoughNumbersSubmit
        ? 'The claim goes to the Rough Numbers inbox for admin review. Cycle time pauses until the admin reassigns it back for the full workup.'
        : 'The claim moves to QC. You can still edit or attach documents afterward.',
      confirmLabel: 'Submit',
      variant: 'primary',
    })
  }

  // Report-complete handoff — appraiser doing the report work (comps/
  // adjustments/DV) hands the claim to the Negotiating Appraiser on the file,
  // who negotiates and then submits for QC. Only shown when the current
  // assignee is NOT the negotiating appraiser; otherwise Submit does both.
  const negotiatingAppraiserName = (claim.negotiatingAppraiser ?? '').trim()
  const negotiatingAppraiserProfile = negotiatingAppraiserName
    ? allProfiles.find(p => {
        const n = (p.name ?? '').trim().toLowerCase()
        const e = (p.email ?? '').trim().toLowerCase()
        const needle = negotiatingAppraiserName.toLowerCase()
        return n === needle || e === needle
      })
    : null
  const needsReportHandoff = Boolean(
    workflowStage === 'main' &&
    !isSubmitted &&
    !isClosed &&
    negotiatingAppraiserProfile &&
    assignedTo &&
    negotiatingAppraiserProfile.id !== assignedTo &&
    // Appraisers with can_submit_without_handoff bypass the handoff and
    // submit straight to QC (Henry Aleksanyan + George Aleksanyan today).
    profile?.canSubmitWithoutHandoff !== true &&
    // Rough-numbers claims always route to the admin FIRST, bypassing any
    // Negotiating Appraiser handoff. Once the Rough Numbers inbox owner
    // processes it and reassigns, roughNumbersHandoffAt is stamped and
    // this gate reopens for subsequent submits.
    (!needsRoughNumbers || !!roughNumbersHandoffAt) &&
    // Report-only claims (no 'rta' in claim types) skip the handoff —
    // we were hired to write the report, not to negotiate. The Negotiating
    // Appraiser field may still be set for licensing/signature display,
    // but no routing follows. 'rta' (Right To Appraisal) is the explicit
    // "we're also doing the negotiation" marker.
    (claim.claimTypes ?? []).includes('rta')
  )
  const completeReportTo = async (toAssignee: string | null, label: string) => {
    if (!editingId) return
    if (!(await confirmDialog({
      title: 'Complete report?',
      message: `Complete the report and hand this claim to ${label}?`,
      confirmLabel: 'Complete',
    }))) return
    const previousStage = workflowStage
    setWorkflowBusy(true)
    const res = await fetch(`/api/claims/${editingId}/complete-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // toAssignee omitted → server falls back to Negotiating Appraiser
      // name resolution. The picker (ACV-only) always passes an explicit id.
      body: JSON.stringify(toAssignee ? { toAssignee } : {}),
    })
    setWorkflowBusy(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Complete-report failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    router.push(`/?tab=${previousStage}`)
  }
  const handleComplete = () => setPendingWorkflow({
    path: 'approve',
    title: 'Mark this claim as Complete?',
    message: 'Closes the claim as Completed (ran its normal course). It moves to Closed Claims and can be reopened later if needed.',
    confirmLabel: 'Complete Claim',
    variant: 'primary',
    reason: 'completed',
  })
  const handleCancel = () => setPendingWorkflow({
    path: 'approve',
    title: 'Mark this claim as Cancelled?',
    message: 'Closes the claim as Cancelled (client withdrew, wrong assignment, duplicate, etc). It moves to Closed Claims and can be reopened later if needed.',
    confirmLabel: 'Cancel Claim',
    variant: 'danger',
    reason: 'cancelled',
  })
  // The old single-button Reopen flow has been replaced by the Actions ▾
  // dropdown on closed claims (further below). Reopen is now a two-step
  // flow: pick Supplement or Revision, then pick an appraiser to route
  // the reopened claim to. See `handleReopenKindPicked` and
  // `runReopenWithAssignment` below.

  // Flip an already-closed claim's close_reason without reopening it. Used
  // when a claim was closed as Completed but should have been Cancelled (or
  // vice versa). Also pulls it in/out of Settlement Analytics, which skips
  // cancelled rows. Treats a null close_reason (legacy rows) as 'completed'.
  const effectiveCloseReason: 'completed' | 'cancelled' = closeReason ?? 'completed'
  const changeCloseReason = async (next: 'completed' | 'cancelled') => {
    if (!editingId) return
    const label = next === 'cancelled' ? 'Cancelled' : 'Completed'
    const ok = await confirmDialog({
      title: `Change to ${label}?`,
      message: next === 'cancelled'
        ? "Marks this closed claim as Cancelled. It will be excluded from Settlement Analytics and show a red Cancelled badge on the Closed Claims list."
        : "Marks this closed claim as Completed. It will show as Submitted on the Closed Claims list and count in Settlement Analytics.",
      confirmLabel: `Change to ${label}`,
      variant: next === 'cancelled' ? 'danger' : 'primary',
    })
    if (!ok) return
    setWorkflowBusy(true)
    const res = await fetch(`/api/claims/${editingId}/change-close-reason`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: next }),
    })
    setWorkflowBusy(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Change failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    setCloseReason(next)
  }

  // Workflow stage advancement — admin triggers "advance" from QC onward.
  // The route handles permission checks + computes the next stage server-side.
  const STAGE_LABELS: Record<string, string> = { main: 'Appraiser', qc: 'QC', billing_delivery: 'Billing/Delivery', payment: 'Payment' }
  const NEXT_LABEL: Record<string, string> = {
    main: 'Submit for QC',
    qc: 'Pass QC → Billing/Delivery',
    billing_delivery: 'Mark Billed & Delivered → Payment',
    payment: 'Mark Paid & Close',
  }
  const handleAdvance = async () => {
    if (!editingId) return
    const label = NEXT_LABEL[workflowStage] ?? 'Advance'
    if (!(await confirmDialog({ title: `${label}?`, confirmLabel: 'Advance' }))) return
    // Capture the stage the claim is leaving so we can return the admin to
    // that dashboard tab after the advance. Henry 2026-10-15: "if im in QC
    // and i submit a claim to go to delivery, i go back into the QC dashboard".
    const previousStage = workflowStage
    setWorkflowBusy(true)
    const res = await fetch(`/api/claims/${editingId}/advance-workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance' }),
    })
    setWorkflowBusy(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Advance failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    router.push(`/?tab=${previousStage}`)
  }

  // Admin sends a claim back to Main. Default recipient is submitted_by
  // (whoever sent it to QC); admin can override via the Send Back dropdown.
  // Clears submission so the appraiser has to Submit again after fixing.
  const sendBackTo = async (toAssignee: string | null, label: string) => {
    if (!editingId) return
    if (!(await confirmDialog({
      title: 'Send back to appraiser?',
      message: `The claim will return to Appraiser, assigned to ${label}.`,
      confirmLabel: 'Send back',
    }))) return
    const previousStage = workflowStage
    setWorkflowBusy(true)
    const body: Record<string, unknown> = { action: 'send_back', toStage: 'main' }
    if (toAssignee) body.toAssignee = toAssignee
    const res = await fetch(`/api/claims/${editingId}/advance-workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setWorkflowBusy(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Send-back failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    router.push(`/?tab=${previousStage}`)
  }

  // Send Back dropdown state — mirrors the Reassign popover pattern.
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const sendBackRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sendBackOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (sendBackRef.current && !sendBackRef.current.contains(e.target as Node)) {
        setSendBackOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [sendBackOpen])

  // Complete Report dropdown state — same pattern as Send Back.
  const [completeReportOpen, setCompleteReportOpen] = useState(false)
  const completeReportRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!completeReportOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (completeReportRef.current && !completeReportRef.current.contains(e.target as Node)) {
        setCompleteReportOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [completeReportOpen])

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
  //
  // dropPhase: when the current claim has a non-'completed' status phase, the
  // dialog surfaces a Keep/Drop toggle so the admin can decide whether the
  // phase carries forward. Default = Keep (false). 'completed' is always
  // cleared on reassign regardless of this flag (enforced server-side) — the
  // UI hides the toggle in that case. Resets to false whenever the dialog
  // closes so the next reassign starts fresh.
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignBusy, setReassignBusy] = useState(false)
  const [pendingReassign, setPendingReassign] = useState<{ id: string | null; label: string } | null>(null)
  const [dropPhase, setDropPhase] = useState(false)
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
    setDropPhase(false) // next dialog always opens on "Keep"
    setPendingReassign({ id, label })
  }

  // Actions dropdown for closed claims (admin-only). Mirrors the Finalize
  // dropdown pattern below (two-view state machine, click-outside to close).
  // Replaces the old loose "Mark Completed/Cancelled + Reopen + Reassign"
  // button row. The main view offers Reopen as Supplement / Reopen as
  // Revision (each slides into the appraiser submenu), Mark Completed/
  // Cancelled, and Delete. Reassign is deliberately absent — closed claims
  // can only be reassigned by reopening (which forces the user to pick an
  // appraiser as part of the dialog).
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsView, setActionsView] = useState<'main' | 'appraiser'>('main')
  const [pendingReopenKind, setPendingReopenKind] = useState<'supplement' | 'revision' | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!actionsOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
        setActionsView('main')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [actionsOpen])

  // Confirm-dialog state for the two-step reopen flow. Populated by the
  // appraiser submenu once the user picks a target; cleared when the
  // dialog is confirmed or dismissed.
  const [pendingReopen, setPendingReopen] = useState<{
    kind: 'supplement' | 'revision'
    assignTo: string | null
    assignToLabel: string
  } | null>(null)
  const [reopenBusy, setReopenBusy] = useState(false)

  const openReopenSubmenu = (kind: 'supplement' | 'revision') => {
    setPendingReopenKind(kind)
    setActionsView('appraiser')
  }

  const pickReopenAssignee = (id: string | null, label: string) => {
    if (!pendingReopenKind) return
    setActionsOpen(false)
    setActionsView('main')
    setPendingReopen({ kind: pendingReopenKind, assignTo: id, assignToLabel: label })
    setPendingReopenKind(null)
  }

  const runReopenWithAssignment = async () => {
    if (!pendingReopen || !editingId) { setPendingReopen(null); return }
    const { kind, assignTo } = pendingReopen
    setReopenBusy(true)
    const res = await fetch(`/api/claims/${editingId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ as: kind, assignTo }),
    })
    setReopenBusy(false)
    setPendingReopen(null)
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({
        title: 'Reopen failed',
        message: (b as { error?: string }).error ?? 'The request did not complete.',
        variant: 'danger',
      })
      return
    }
    const body = await res.json().catch(() => ({} as {
      supplementCount?: number
      isRevision?: boolean
      assignedTo?: string | null
    }))
    // Apply the returned state directly so the UI updates without a
    // full refetch. The response reflects the DB after the update,
    // including the 42703 fallback case (counter unchanged if the
    // migration hasn't run).
    setStatus('open')
    setCloseReason(null)
    setSubmittedAt(null)
    setSubmittedBy(null)
    if (statusPhase === 'completed') {
      setStatusPhase(null)
      setStatusPhaseSetAt(null)
    }
    if (typeof body.supplementCount === 'number') setSupplementCount(body.supplementCount)
    if (typeof body.isRevision === 'boolean') setIsRevision(body.isRevision)
    if ('assignedTo' in body) setAssignedTo(body.assignedTo ?? null)
  }

  // Finalize dropdown (admin-only): one button that opens a menu with
  // Complete Claim / Cancel Claim. Picking either arms the ConfirmDialog via
  // the existing handleComplete/handleCancel handlers. Mirrors the Reassign
  // popover's click-outside-to-close pattern.
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  // 'main' = Cancel/Delete/Change Phase entries; 'phases' = sub-menu listing
  // every available phase. Resets to main when the dropdown closes.
  const [finalizeView, setFinalizeView] = useState<'main' | 'phases'>('main')
  const [finalizePhaseConfigs, setFinalizePhaseConfigs] = useState<StatusPhaseConfig[]>([])
  const [finalizePhaseBusy, setFinalizePhaseBusy] = useState(false)
  const finalizeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!finalizeOpen) return
    // Lazy-load phase configs when the dropdown first opens — otherwise every
    // mounted ClaimWorkspace would hit the configs table on page load.
    if (finalizePhaseConfigs.length === 0) {
      fetchStatusPhaseConfigs().then(setFinalizePhaseConfigs)
    }
    const onDocClick = (e: MouseEvent) => {
      if (finalizeRef.current && !finalizeRef.current.contains(e.target as Node)) {
        setFinalizeOpen(false)
        setFinalizeView('main')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [finalizeOpen, finalizePhaseConfigs.length])

  // Lazy-load phase configs when the reassign dialog opens so the Keep/Drop
  // phase toggle can render the human label (e.g. "Pending Information")
  // instead of the raw code. Shares state with the Finalize dropdown — same
  // 60s-cached fetcher, no extra network cost if that dropdown opened first.
  // If the fetch hasn't landed yet when the dialog paints, the toggle falls
  // back to the raw code for one render.
  useEffect(() => {
    if (!pendingReassign) return
    if (finalizePhaseConfigs.length > 0) return
    fetchStatusPhaseConfigs().then(setFinalizePhaseConfigs)
  }, [pendingReassign, finalizePhaseConfigs.length])

  // Also lazy-load the configs whenever this claim has an active phase, so the
  // compact phase chip rendered above the claim header grid can show the human
  // label + color without waiting for the user to open a dropdown. Guarded by
  // configs.length so a claim view with no phase doesn't fetch, and by the
  // phase presence so the fetcher only fires for claims that actually need it.
  // Fetcher's module-level 60s cache + in-flight dedup covers the common
  // "flip between phased claims rapidly" case.
  useEffect(() => {
    if (!statusPhase) return
    if (finalizePhaseConfigs.length > 0) return
    fetchStatusPhaseConfigs().then(setFinalizePhaseConfigs)
  }, [statusPhase, finalizePhaseConfigs.length])

  const pickFinalizePhase = async (code: string | null) => {
    if (!editingId) return
    if (code === statusPhase) {
      setFinalizeOpen(false)
      setFinalizeView('main')
      return
    }
    setFinalizePhaseBusy(true)
    try {
      const res = await fetch(`/api/claims/${editingId}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: code }),
      })
      if (res.ok) {
        setStatusPhase(code)
        setStatusPhaseSetAt(code === null ? null : new Date().toISOString())
      } else {
        const body = await res.json().catch(() => ({}))
        await alertDialog({
          title: 'Phase change failed',
          message: (body as { error?: string }).error ?? 'The request did not complete.',
          variant: 'danger',
        })
      }
    } finally {
      setFinalizePhaseBusy(false)
      setFinalizeOpen(false)
      setFinalizeView('main')
    }
  }

  const runReassign = async () => {
    if (!pendingReassign || !editingId) { setPendingReassign(null); return }
    setReassignBusy(true)
    // keepPhase is only sent when the current claim actually has a
    // non-'completed' phase — 'completed' is always cleared server-side and
    // sending the flag for a null phase would be a no-op. Reading
    // statusPhase at request-build time (not at dialog-open time) means we
    // use the latest local value — the backend still re-reads the DB value
    // when it decides, so a stale local would at worst cause one extra
    // boolean to ride in the payload with no effect.
    const payload: { assignedTo: string | null; keepPhase?: boolean } = {
      assignedTo: pendingReassign.id,
    }
    if (statusPhase && statusPhase !== 'completed') {
      payload.keepPhase = !dropPhase
    }
    const res = await fetch(`/api/claims/${editingId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setReassignBusy(false)
    setPendingReassign(null)
    setDropPhase(false) // reset for the next reassign — always default to Keep
    if (!res.ok) {
      const b = await res.json().catch(() => ({} as { error?: string }))
      await alertDialog({ title: 'Reassign failed', message: (b as { error?: string }).error ?? 'The request did not complete.', variant: 'danger' })
      return
    }
    // Re-hydrate from the server. The 2s autosave would otherwise overwrite
    // any server-side mutations with the stale local state. Also sync
    // statusPhase + statusPhaseSetAt so the Keep/Drop choice reflects
    // immediately in the UI (phase chip in the header, Change Phase submenu
    // tick mark) — previously these were only refreshed on next page load.
    const fresh = await fetchACVEntry(editingId)
    if (fresh) {
      setAssignedTo(fresh.assignedTo ?? null)
      setClaim(fresh.claim)
      setStatusPhase(fresh.statusPhase ?? null)
      setStatusPhaseSetAt(fresh.statusPhaseSetAt ?? null)
    }
  }

  const handleVinDecoded = async (updatedClaim: ClaimInfo) => {
    // Save with the CURRENT comps/result — previously this saved an empty
    // comps array, wiping the claim's saved comps whenever a VIN was re-decoded.
    const savedId = await saveToHistory(updatedClaim, builtComps, adjustments, result, modeRef.current, editingId, mileageRate, reportsState, saveExtras, activeCompanyId)
    if (!editingId) setEditingId(savedId)
    editingIdRef.current = savedId
  }

  // Explicit creation from /claims/new: save the claim row now and swap to its
  // real URL, which unlocks the tool tabs.
  const [creatingClaim, setCreatingClaim] = useState(false)
  // Human-readable list of fields that must be filled before Create Claim is
  // allowed to fire. If this returns [], the claim is good to create. If it
  // returns anything, the UI surfaces each missing label so the user knows
  // what to add. Claim-type-sensitive adds (Henry 2026-10-15):
  //   - ACV claims require Ins. Co. Offer (there's always one at this point).
  //   - Any value-dispute claim (ACV / DV / Estimate) requires the Opposing
  //     Appraiser name — those are the only types with an OA counterpart.
  const missingRequiredFields = (): string[] => {
    const missing: string[] = []
    if (!(claim.ownerName ?? '').trim()) missing.push('Owner Name')
    // Specialty vehicles (classics, exotics, custom builds) often don't carry
    // a standard 17-char VIN — skip the VIN requirement entirely for them.
    const types = claim.claimTypes ?? []
    const isSpecialty = types.includes('specialty')
    if (!isSpecialty) {
      const vin = (claim.vin ?? '').trim()
      if (!vin) missing.push('VIN')
      else if (vin.length !== 17) missing.push('VIN (must be 17 characters)')
    }
    if (!(claim.insuranceCompany ?? '').trim()) missing.push('Insurance Company')
    // ACV / DV / Est Dispute are the three value-dispute types: each has an
    // Ins. Co. Offer and an Opposing Appraiser counterpart. Require both —
    // unless this is a rough-numbers claim, where the whole point is that
    // those numbers aren't known yet. Henry 2026-10-15.
    //
    // Opposing Appraiser is additionally gated on 'rta' (Right To Appraisal)
    // being on the claim (Henry 2026-10-18). RTA is the "we're going to
    // negotiate this" flag — report-only ACV/DV/Est claims (no RTA) don't
    // have an OA to name at creation and should be creatable without it.
    // Ins. Co. Offer is NOT RTA-gated: every value-dispute claim has an
    // insurer offer on file at the start, even report-only ones.
    const isValueDispute = types.includes('acv') || types.includes('dv') || types.includes('estimate')
    const isRta = types.includes('rta')
    if (isValueDispute && !needsRoughNumbers) {
      if (!(reportsState.notesData.insuranceOfferNum ?? 0)) missing.push('Ins. Co. Offer')
      if (isRta && !(reportsState.notesData.appraiserName ?? '').trim()) missing.push('Opposing Appraiser')
    }
    return missing
  }
  const [createClaimError, setCreateClaimError] = useState<string | null>(null)
  const createClaim = async () => {
    const missing = missingRequiredFields()
    if (missing.length > 0) {
      setCreateClaimError(
        missing.length === 1
          ? `${missing[0]} is required to create a claim.`
          : `Fill in these required fields before creating the claim: ${missing.join(', ')}.`,
      )
      return
    }
    setCreateClaimError(null)
    setCreatingClaim(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    let id = editingIdRef.current
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      editingIdRef.current = id
      setEditingId(id)
    }
    await saveToHistory(claim, builtComps, adjustments, result, modeRef.current, id, mileageRate, reportsState, saveExtras, activeCompanyId)
    setHasUnsavedChanges(false)
    promotedIdRef.current = id
    // Session-storage handoff — belt-and-suspenders against the "blank fields
    // after create" regression (see docs/BUGS.md 2026-10-13). If anything
    // between here and the post-navigation render causes ClaimWorkspace to
    // remount, promotedIdRef resets to null and we lose the typed state. The
    // handoff survives remount: the new component's useState initializer
    // reads it and the load effect drains it before any DB fetch can clobber.
    //
    // reportsState MUST be in this payload (Henry 2026-10-20). Opposing
    // Appraiser (notesData.appraiserName) and Ins. Co. Offer
    // (notesData.insuranceOfferNum) are both edited on the Create form and
    // live inside reportsState — if the handoff path skips the DB fetch
    // (which it does — see the load effect's early-return) AND reportsState
    // isn't in the handoff, the new instance initializes from
    // defaultReportsState and both fields vanish. The next autosave then
    // overwrites the DB value with the empty default. BUGS.md originally
    // noted this as "doesn't bite real workflows" — it does now.
    try {
      sessionStorage.setItem(`claim-handoff-${id}`, JSON.stringify({
        claim, clientId, needsRoughNumbers, reportsState,
      }))
    } catch { /* storage full / disabled — fall back to DB load path */ }
    localStorage.removeItem(COMP_FINDER_SESSION_KEY)
    router.replace(`/claims/${id}?tab=info`, { scroll: false })
    // Fire-and-forget auto-message for parser-captured Notes (Eagle View
    // format only — modern-appraisers parser returns empty notes).
    if (pendingAutoNoteRef.current) {
      const noteBody = pendingAutoNoteRef.current
      pendingAutoNoteRef.current = ''
      fetch(`/api/claims/${encodeURIComponent(id)}/auto-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody, senderName: 'HamsPortal' }),
      }).catch((e) => console.warn('auto-message post failed:', e))
    }
    // Auto-attach the parsed assignment-sheet PDF to the Documents tab.
    // The DB trigger assigned the MA# during saveToHistory above; the helper
    // fetches it if it's not already in local state.
    void uploadPendingAssignmentSheet()
    setCreatingClaim(false)
  }

  const runDeleteClaim = async () => {
    if (!editingId) return
    setDeleteBusy(true)
    const ok = await deleteACVHistory(editingId)
    setDeleteBusy(false)
    setDeleteConfirmOpen(false)
    if (!ok) {
      await alertDialog({ title: 'Delete failed', message: 'You may not have permission, or the claim may be referenced elsewhere. Refresh and try again.', variant: 'danger' })
      return
    }
    router.push('/')
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
        <main className="max-w-[1920px] mx-auto px-6 py-16 text-center">
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
        <main className="max-w-[1920px] mx-auto px-6 py-16 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading claim...
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-[1400px] mx-auto px-6 pt-4 pb-6">
        {isLockedForMe && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md px-4 py-3 flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              <div className="font-semibold text-red-900">This claim is locked.</div>
              <div className="text-red-800">
                You&apos;ve gone 5+ business days without a status on this file. Everything is view-only until you post a status in the <b>Messages</b> tab. Posting any non-auto message here unlocks the claim.
              </div>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-2 mb-3">
          <Link
            href="/"
            className="hp-btn hp-btn-sm hp-btn-ghost"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          {!isNew && editingId && (
            <button
              type="button"
              onClick={() => triggerAssignmentSheetPrint(
                `${claim.maNumber || 'claim'}-assignment-sheet.pdf`,
                {
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
                  insuranceOfferValue: reportsState.notesData.insuranceOfferNum ?? 0,
                  agreementAmount: reportsState.notesData.agreementAmountNum,
                  umpireAmount: reportsState.notesData.umpireAmountNum,
                  ourAcv: result.acv,
                  dv: dv ?? null,
                  claimTypes: claim.claimTypes ?? [],
                  maEstValue: reportsState.notesData.estValueNum ?? 0,
                  maStorageValue: reportsState.notesData.storageValueNum ?? 0,
                  proceededToUmpire,
                },
              )}
              className="hp-btn hp-btn-sm hp-btn-ghost"
              title="Print the assignment sheet"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          )}
          {/* Descriptive claim labels (Supp N / Revision / Specialty).
              Supp and Revision come from the reopen flow; Specialty is a
              user toggle in Claim Info > Labels. Renders nothing when all
              three are at their defaults. */}
          {!isNew && editingId && (
            <ClaimLabelPills
              supplementCount={supplementCount}
              isRevision={isRevision}
              isSpecialty={(claim.claimTypes ?? []).includes('specialty')}
              needsRoughNumbers={needsRoughNumbers}
              claimStatus={status}
            />
          )}
          {/* Pushes the right group to the far right; the licensing badge is
              absolute-positioned below so it sits in the true page center
              regardless of how wide the left/right button groups are. */}
          <div className="flex-1" />
          {!isNew && editingId && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="pointer-events-auto">
                <StateLicensingTopBadge
                  claim={claim}
                  assignedTo={assignedTo}
                  profile={profile ?? null}
                  allProfiles={allProfiles}
                />
              </div>
            </div>
          )}
          {/* "Save Changes" / "Unsaved changes" chip removed per user
              instruction — auto-save handles persistence silently. */}
          {/* Task 11: role-aware workflow buttons. The flex-1 badge slot
              above already pushes these to the far right; no ml-auto needed. */}
          {!isNew && editingId && (
            <div className="flex items-center gap-2">
              {!isAdmin && !isSubmitted && !isClosed && isAssignee && (
                needsReportHandoff ? (
                  // Override picker is ACV-only (Henry 2026-10-20). Non-ACV
                  // claims keep the pre-Option-A single-click behavior:
                  // confirm → POST without toAssignee → server auto-resolves
                  // the Negotiating Appraiser name. Multi-type claims that
                  // include 'acv' get the picker.
                  !(claim.claimTypes ?? []).includes('acv') ? (
                    <Button
                      onClick={() => {
                        const label = negotiatingAppraiserProfile?.name
                          || negotiatingAppraiserProfile?.email
                          || 'the negotiating appraiser'
                        void completeReportTo(null, label)
                      }}
                      disabled={workflowBusy}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                      title={`Hand off to ${negotiatingAppraiserProfile?.name || negotiatingAppraiserProfile?.email}`}
                    >
                      Complete Report
                    </Button>
                  ) : (
                  <div className="relative" ref={completeReportRef}>
                    <Button
                      onClick={() => setCompleteReportOpen(o => !o)}
                      disabled={workflowBusy}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                      title="Pick who to hand this claim off to"
                    >
                      Complete Report
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </Button>
                    {completeReportOpen && (() => {
                      // Eligible appraisers:
                      //   • active, appraiser-role, picker-visible (no super-admins)
                      //   • not the current assignee
                      //   • claim-type overlap with claim.claimTypes (empty on
                      //     profile = handles everything)
                      // Negotiating Appraiser surfaces at the top (highlighted)
                      // if they pass the filter; otherwise they're silently
                      // dropped — Henry's rule, non-handlers shouldn't be an
                      // option. If no one is eligible, show the fallback copy.
                      const types = (claim.claimTypes ?? [])
                      const eligible = allProfiles
                        .filter(p => p.isActive && isPickerVisible(p))
                        .filter(p => p.role === 'appraiser')
                        .filter(p => p.id !== assignedTo)
                        .filter(p => types.length === 0 || userHandlesClaimTypes(p, types))
                      const negotiatorEligible = negotiatingAppraiserProfile
                        && eligible.some(p => p.id === negotiatingAppraiserProfile.id)
                        ? negotiatingAppraiserProfile
                        : null
                      const others = eligible
                        .filter(p => p.id !== negotiatorEligible?.id)
                        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
                      return (
                        <div className="absolute right-0 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                          <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-400 border-b border-gray-100 bg-gray-50">
                            Hand off to
                          </div>
                          {negotiatorEligible && (
                            <button
                              type="button"
                              onClick={() => { setCompleteReportOpen(false); void completeReportTo(negotiatorEligible.id, negotiatorEligible.name || negotiatorEligible.email) }}
                              disabled={workflowBusy}
                              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 border-b border-gray-100 bg-blue-50/40 truncate"
                            >
                              {negotiatorEligible.name || negotiatorEligible.email}
                              <span className="text-blue-700 font-medium"> (negotiating appraiser)</span>
                            </button>
                          )}
                          <div className="max-h-72 overflow-y-auto">
                            {others.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { setCompleteReportOpen(false); void completeReportTo(p.id, p.name || p.email) }}
                                disabled={workflowBusy}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 truncate"
                              >
                                {p.name || p.email}
                              </button>
                            ))}
                          </div>
                          {!negotiatorEligible && others.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-gray-400 italic">
                              No eligible appraisers handle this claim&apos;s types.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  )
                ) : (
                  // Rough-numbers-pending claims take a different Submit path
                  // under the hood (routes to the Rough Numbers inbox owner,
                  // not QC). Label the button accordingly so the appraiser
                  // knows what's actually about to happen.
                  <Button
                    onClick={handleSubmit}
                    disabled={workflowBusy}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    title={needsRoughNumbers && !roughNumbersHandoffAt
                      ? 'Sends rough numbers to the admin for review before full workup'
                      : 'Submits the finished report to QC'}
                  >
                    {needsRoughNumbers && !roughNumbersHandoffAt
                      ? 'Submit for Rough Numbers'
                      : 'Submit for QC'}
                  </Button>
                )
              )}
              {isAdmin && !isClosed && workflowStage !== 'main' && (
                <div className="relative" ref={sendBackRef}>
                  <Button
                    onClick={() => setSendBackOpen(o => !o)}
                    disabled={workflowBusy}
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Send Back
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                  {sendBackOpen && (() => {
                    // Recipient list:
                    //   • Submitter at top (default) — always shown so admin
                    //     knows who sent it to QC, even if they're an admin
                    //     themselves. Row labeled "(submitted appraiser)"
                    //     inline so it's obvious at a glance.
                    //   • Below the divider: every other active APPRAISER
                    //     (admins excluded per Henry). Super-admins hidden
                    //     via isPickerVisible. Claim-type filter applied so
                    //     a Che-only user doesn't show for ACV send-backs.
                    const types = (claim.claimTypes ?? [])
                    const submitter = submittedBy ? allProfiles.find(p => p.id === submittedBy) : null
                    const others = allProfiles
                      .filter(p => p.isActive && isPickerVisible(p))
                      .filter(p => p.role === 'appraiser')
                      .filter(p => p.id !== submittedBy)
                      .filter(p => types.length === 0 || userHandlesClaimTypes(p, types))
                      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
                    return (
                      <div className="absolute right-0 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                        <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-400 border-b border-gray-100 bg-gray-50">
                          Send back to
                        </div>
                        {submitter && (
                          <button
                            type="button"
                            onClick={() => { setSendBackOpen(false); void sendBackTo(submitter.id, submitter.name || submitter.email) }}
                            disabled={workflowBusy}
                            className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 border-b border-gray-100 bg-blue-50/40 truncate"
                          >
                            {submitter.name || submitter.email}
                            <span className="text-blue-700 font-medium"> (submitted appraiser)</span>
                          </button>
                        )}
                        {!submitter && submittedBy && (
                          <button
                            type="button"
                            onClick={() => { setSendBackOpen(false); void sendBackTo(submittedBy, 'the submitter') }}
                            disabled={workflowBusy}
                            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-700 border-b border-gray-100 italic truncate"
                          >
                            Submitter <span className="text-blue-700 font-medium not-italic">(submitted appraiser)</span>
                          </button>
                        )}
                        {!submittedBy && (
                          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200 italic">
                            No submitter recorded on this claim — pick manually below.
                          </div>
                        )}
                        <div className="max-h-72 overflow-y-auto">
                          {others.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setSendBackOpen(false); void sendBackTo(p.id, p.name || p.email) }}
                              disabled={workflowBusy}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 truncate"
                            >
                              {p.name || p.email}
                            </button>
                          ))}
                        </div>
                        {others.length === 0 && !submitter && (
                          <div className="px-3 py-4 text-center text-xs text-gray-400 italic">No eligible recipients.</div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
              {isAdmin && !isClosed && (
                <div className="relative" ref={finalizeRef}>
                  <Button
                    onClick={handleAdvance}
                    disabled={workflowBusy}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {NEXT_LABEL[workflowStage] ?? 'Advance'}
                  </Button>
                  <Button
                    onClick={() => setFinalizeOpen(o => !o)}
                    disabled={workflowBusy}
                    size="sm"
                    variant="outline"
                    className="ml-1 px-2"
                    title="More actions"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  {finalizeOpen && (
                    <div className="absolute right-0 mt-1 w-60 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                      {finalizeView === 'main' ? (
                        <>
                          <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-400 border-b border-gray-100 bg-gray-50">
                            Stage: {STAGE_LABELS[workflowStage] ?? workflowStage}
                          </div>
                          <button
                            type="button"
                            onClick={() => setFinalizeView('phases')}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <span className="flex items-center gap-2">
                              <Tag className="w-4 h-4 text-blue-600" />
                              Change Phase
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFinalizeOpen(false); handleCancel() }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-red-50 hover:text-red-700"
                          >
                            <X className="w-4 h-4 text-red-600" />
                            Cancel Claim
                          </button>
                          {!isNew && editingId && (
                            <button
                              type="button"
                              onClick={() => { setFinalizeOpen(false); setDeleteConfirmOpen(true) }}
                              disabled={deleteBusy}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-red-50 hover:text-red-700 border-t border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                              Delete Claim
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setFinalizeView('main')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-b border-gray-100 bg-gray-50"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" /> Change Phase
                          </button>
                          <button
                            type="button"
                            onClick={() => pickFinalizePhase(null)}
                            disabled={finalizePhaseBusy}
                            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 italic disabled:opacity-50"
                          >
                            — None —
                          </button>
                          <div className="border-t border-gray-100" />
                          {finalizePhaseConfigs.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-400 italic">Loading phases…</div>
                          )}
                          {finalizePhaseConfigs.map(cfg => (
                            <button
                              key={cfg.code}
                              type="button"
                              onClick={() => pickFinalizePhase(cfg.code)}
                              disabled={finalizePhaseBusy}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-2 disabled:opacity-50"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-2 h-2 rounded-full border ${phaseColorClasses(cfg.color)}`}
                                  aria-hidden
                                />
                                {cfg.label}
                              </span>
                              {cfg.code === statusPhase && (
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
              {isAdmin && isClosed && (
                <div className="relative" ref={actionsRef}>
                  <Button
                    onClick={() => { setActionsOpen(o => !o); setActionsView('main') }}
                    disabled={workflowBusy || reopenBusy}
                    size="sm"
                    variant="outline"
                    title="Reopen, mark completed/cancelled, or delete this closed claim"
                  >
                    Actions
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                  {actionsOpen && (
                    <div className="absolute right-0 mt-1 w-60 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                      {actionsView === 'main' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openReopenSubmenu('supplement')}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-amber-50 hover:text-amber-800"
                          >
                            <span className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-amber-600" />
                              Reopen as Supplement
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openReopenSubmenu('revision')}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-yellow-50 hover:text-yellow-900"
                          >
                            <span className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-yellow-700" />
                              Reopen as Revision
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <div className="border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setActionsOpen(false)
                              changeCloseReason(effectiveCloseReason === 'cancelled' ? 'completed' : 'cancelled')
                            }}
                            disabled={workflowBusy}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={effectiveCloseReason === 'cancelled'
                              ? 'Flip back to Completed — restores it to Settlement Analytics.'
                              : 'Flip to Cancelled — excludes it from Settlement Analytics.'}
                          >
                            {effectiveCloseReason === 'cancelled' ? 'Mark Completed' : 'Mark Cancelled'}
                          </button>
                          {!isNew && editingId && (
                            <button
                              type="button"
                              onClick={() => { setActionsOpen(false); setDeleteConfirmOpen(true) }}
                              disabled={deleteBusy}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-red-50 hover:text-red-700 border-t border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                              Delete Claim
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setActionsView('main'); setPendingReopenKind(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-b border-gray-100 bg-gray-50"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Reopen as {pendingReopenKind === 'revision' ? 'Revision' : 'Supplement'}
                          </button>
                          <button
                            type="button"
                            onClick={() => pickReopenAssignee(null, 'Unassigned')}
                            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 italic"
                          >
                            — Unassigned —
                          </button>
                          <div className="border-t border-gray-100" />
                          <div className="max-h-72 overflow-y-auto">
                            {allProfiles.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-400 italic">
                                No appraisers available
                              </div>
                            ) : (
                              allProfiles
                                .filter(p =>
                                  isPickerVisible(p) &&
                                  p.isActive &&
                                  (wsMemberIds === null || wsMemberIds.has(p.id)) &&
                                  userHandlesClaimTypes(p, claim.claimTypes),
                                )
                                .map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => pickReopenAssignee(p.id, p.name || p.email)}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{p.name || p.email}</span>
                                    {p.id === assignedTo && (
                                      <span className="text-xs text-gray-400 shrink-0">current</span>
                                    )}
                                  </button>
                                ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!isClosed && (isAdmin || (profile?.canReassignClaims && isAssignee)) && (
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
                          {allProfiles
                            .filter(p =>
                              isPickerVisible(p) &&
                              p.isActive &&
                              (wsMemberIds === null || wsMemberIds.has(p.id)) &&
                              userHandlesClaimTypes(p, claim.claimTypes),
                            )
                            .map(p => (
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
              {/* Delete Claim moved into the Advance ▾ dropdown next to
                  Cancel Claim and Change Phase (Henry 2026-10-09). The
                  standalone button was redundant and cluttered the toolbar. */}
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
            pendingReassign ? (() => {
              // Resolve the human label + color for the current phase. Falls
              // back to the raw code + gray if the configs haven't loaded yet
              // (first open before the lazy-fetch useEffect lands).
              const cfg = statusPhase
                ? finalizePhaseConfigs.find(c => c.code === statusPhase)
                : null
              const phaseLabel = cfg?.label ?? statusPhase ?? ''
              const phaseColor = cfg?.color ?? 'gray'
              const phasePill = (
                <span
                  className={`inline-flex items-center justify-center px-3 py-0.5 rounded-md border text-[11.5px] font-semibold ${phaseColorClasses(phaseColor)}`}
                >
                  {phaseLabel}
                </span>
              )
              return (
                <div className="space-y-3">
                  <div>This claim will be assigned to <b>{pendingReassign.label}</b>.</div>
                  {statusPhase === 'completed' && (
                    // Policy, not a user choice: the 'completed' marker belongs
                    // to the prior appraiser's submit. Enforced server-side too.
                    <div className="text-[12.5px] text-slate-500 italic">
                      Phase will be cleared (new assignee hasn&apos;t submitted).
                    </div>
                  )}
                  {statusPhase && statusPhase !== 'completed' && (
                    <div className="rounded-lg bg-slate-50 px-3.5 py-3 space-y-2.5">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                        <span>Status Phase</span>
                      </div>
                      <label className={`flex items-center gap-2.5 cursor-pointer rounded-md px-2 py-1.5 transition-colors ${!dropPhase ? 'bg-white ring-1 ring-slate-200' : 'hover:bg-white/60'}`}>
                        <input
                          type="radio"
                          name="reassign-phase"
                          className="accent-blue-600"
                          checked={!dropPhase}
                          onChange={() => setDropPhase(false)}
                          disabled={reassignBusy}
                        />
                        <span className="text-[13px] text-slate-800">Keep</span>
                        {phasePill}
                      </label>
                      <label className={`flex items-center gap-2.5 cursor-pointer rounded-md px-2 py-1.5 transition-colors ${dropPhase ? 'bg-white ring-1 ring-slate-200' : 'hover:bg-white/60'}`}>
                        <input
                          type="radio"
                          name="reassign-phase"
                          className="accent-blue-600"
                          checked={dropPhase}
                          onChange={() => setDropPhase(true)}
                          disabled={reassignBusy}
                        />
                        <span className="text-[13px] text-slate-800">Drop</span>
                        <span className="text-[12px] text-slate-500">(reset to no phase)</span>
                      </label>
                    </div>
                  )}
                </div>
              )
            })() : ''
          }
          confirmLabel="Reassign"
          busy={reassignBusy}
          onConfirm={runReassign}
          onCancel={() => { setPendingReassign(null); setDropPhase(false) }}
        />

        <ConfirmDialog
          open={!!pendingReopen}
          title={
            pendingReopen
              ? pendingReopen.kind === 'supplement'
                ? `Reopen as Supplement ${supplementCount + 1}?`
                : 'Reopen as Revision?'
              : ''
          }
          message={
            pendingReopen ? (
              <>
                The claim returns to Open and is assigned to{' '}
                <b>{pendingReopen.assignToLabel}</b>.
                {pendingReopen.kind === 'supplement'
                  ? ' Supplement counter will increment.'
                  : (isRevision ? '' : ' This claim will be marked as a revision.')}
              </>
            ) : ''
          }
          confirmLabel="Reopen"
          variant="primary"
          busy={reopenBusy}
          onConfirm={runReopenWithAssignment}
          onCancel={() => setPendingReopen(null)}
        />

        <ConfirmDialog
          open={deleteConfirmOpen}
          title="Delete this claim?"
          message={
            <>
              This will permanently delete claim <b>{claim.maNumber || editingId}</b>
              {claim.insuredName ? <> for <b>{claim.insuredName}</b></> : null}.
              This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          variant="danger"
          busy={deleteBusy}
          onConfirm={runDeleteClaim}
          onCancel={() => setDeleteConfirmOpen(false)}
        />

        {isNew ? (
          <h1 className="hp-display mb-5">New Claim</h1>
        ) : (
          <>
          {/* Phase chip strip — only renders when the claim has an active
              phase. Sits above the 3-col header grid, centered, matches the
              dashboard phase pill style exactly (phaseColorClasses + age).
              Read-only here; admins change phase via the Finalize dropdown.
              Hidden entirely when there's no phase so no-phase claims look
              identical to pre-2026-10-20. Zero DOM overlap with the top
              licensing badge (which lives in the toolbar above) or the
              Negotiating Appraiser license summary (which lives INSIDE the
              right-side mini-card below). */}
          {statusPhase && (() => {
            const cfg = finalizePhaseConfigs.find(c => c.code === statusPhase)
            const label = cfg?.label ?? statusPhase
            const color = cfg?.color ?? 'gray'
            const age = formatPhaseAge(statusPhaseSetAt)
            return (
              <div className="mb-3 flex justify-center">
                <div
                  className={`inline-flex items-center justify-center gap-2 px-5 py-1 rounded-md border text-[12.5px] font-semibold min-w-[160px] ${phaseColorClasses(color)}`}
                  title={`Status Phase: ${label}${age ? ` (${age})` : ''}`}
                >
                  <span>{label}</span>
                  {age && <span className="opacity-80 font-medium">· {age}</span>}
                </div>
              </div>
            )
          })()}
          <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
            {/* Umpire mini-card — left-aligned, mirrors the Negotiating
                Appraiser mini-card on the right. Only renders on claims whose
                types include ACV, DV, Estimate Dispute, or Specialty — other
                workflows (LOU-only, Storage-only, etc.) never proceed to a
                third-party umpire so the card would just be noise. Mixed
                claims (e.g. ACV + LOU) still show it since one qualifier is
                enough. Henry 2026-10-15. */}
            {(() => {
              const UMPIRE_ELIGIBLE: ReadonlyArray<string> = ['acv', 'dv', 'estimate', 'specialty']
              const types = claim.claimTypes ?? []
              if (!types.some(t => UMPIRE_ELIGIBLE.includes(t))) return <div />
              // iOS-style slider toggle, same pattern used elsewhere in the
              // app (Needs Rough Numbers card). Blue = on, gray = off.
              const toggle = (checked: boolean, onChange: (next: boolean) => void) => (
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                </label>
              )
              return (
                <div className="hp-card px-4 py-2.5 min-w-[220px] justify-self-start">
                  <div className="flex items-center justify-between">
                    <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Claim Proceeded to Umpire?</div>
                    {toggle(proceededToUmpire, (yes) => {
                      // Flipping back off resets agreement to the default (Y).
                      void onUmpireChange({ proceededToUmpire: yes, umpireAgreement: yes ? umpireAgreement : true })
                    })}
                  </div>
                  {proceededToUmpire && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Umpire Agreement?</div>
                      {toggle(umpireAgreement, (yes) => {
                        void onUmpireChange({ proceededToUmpire: true, umpireAgreement: yes })
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
            {/* Claim stats chip card — centered */}
            <div className="hp-card px-6 py-3 max-w-full">
              <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-2">
                {[
                  { label: wsFileLabel, value: claim.maNumber },
                  { label: 'CL #', value: claim.claimNumber },
                  { label: 'Vehicle', value: claimVehicle },
                  { label: 'Client', value: claim.clientName },
                  { label: 'Owner', value: claim.ownerName || claim.insuredName },
                ].map((stat) => (
                  <ClaimHeaderStat key={stat.label} label={stat.label} value={stat.value || ''} />
                ))}
              </div>
            </div>
            {/* Negotiating Appraiser mini-card — right-aligned to the workspace edge */}
            <div className="hp-card px-4 py-2.5 min-w-[220px] justify-self-end">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1">Negotiating Appraiser</div>
              {isAdmin ? (
                <select
                  value={claim.negotiatingAppraiser ?? ''}
                  onChange={(e) => {
                    const nextClaim = { ...claim, negotiatingAppraiser: e.target.value }
                    setClaim(nextClaim)
                    // IMMEDIATE SAVE — the 2s debounced auto-save was losing
                    // this change when admins navigated away quickly after
                    // picking an appraiser. Fire a direct saveToHistory with
                    // the new claim; the debounced effect still fires too,
                    // which is a harmless no-op (same payload).
                    const id = editingIdRef.current
                    if (id) {
                      void saveToHistory(
                        nextClaim, builtComps, adjustments, result, modeRef.current,
                        id, mileageRate, reportsState,
                        { status, auctionListings, estimate, documents, dv, lou, invoice, storage, clientId, needsRoughNumbers },
                        activeCompanyId,
                      ).then(() => setHasUnsavedChanges(false))
                        .catch(err => console.error('[negotiatingAppraiser] immediate save failed:', err))
                    }
                  }}
                  className="w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">— Select appraiser —</option>
                  {(() => {
                    const visible = allProfiles.filter(p =>
                      isPickerVisible(p) &&
                      p.isActive &&
                      p.showInNegotiatingAppraiserList !== false &&
                      (wsMemberIds === null || wsMemberIds.has(p.id)) &&
                      userHandlesClaimTypes(p, claim.claimTypes)
                    )
                    const current = claim.negotiatingAppraiser ?? ''
                    const currentInVisible = current && visible.some(p => (p.name || p.email) === current)
                    return (
                      <>
                        {current && !currentInVisible && (
                          <option value={current} disabled>{current} (not in list)</option>
                        )}
                        {visible.map(p => {
                          const name = p.name || p.email
                          return <option key={p.id} value={name}>{name}</option>
                        })}
                      </>
                    )
                  })()}
                </select>
              ) : (
                <div className="text-[14px] font-semibold text-slate-900">
                  {claim.negotiatingAppraiser || <span className="text-slate-400">—</span>}
                </div>
              )}
              <NegotiatingAppraiserLicenseSummary
                claim={claim}
                negotiatingAppraiserName={claim.negotiatingAppraiser ?? ''}
                allProfiles={allProfiles}
              />
            </div>
          </div>
          </>
        )}

        {isSubmitted && !isAdmin && submittedAt && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[13px]">
            Submitted on {new Date(submittedAt).toLocaleString()}. Admin review in progress — you can still edit or attach documents.
          </div>
        )}

        {!isNew && (duplicates.vinCount > 0 || duplicates.claimNumberCount > 0 || duplicates.maNumberCount > 0) && (
          <DuplicateBanner duplicates={duplicates} />
        )}

        {/* Workspace tabs — two tiers: claim information (top), tools (bottom).
            Visually unified with the dashboard's segmented control style. */}
        {!isNew && (
        <div className="mb-4 space-y-2.5">
          <div className="flex items-center justify-center gap-6 border-b border-slate-200">
            {CLAIM_TABS.filter(tab => {
              // Reports + Activity are admin-only; Forms and the rest are
              // visible to everyone.
              if ((tab.id === 'reports-hub' || tab.id === 'activity') && !isAdmin) return false
              return true
            }).map((tab) => {
              const active = tabForStep(step) === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.step)}
                  className={cn(
                    'relative pb-3 pt-1 text-[16px] font-semibold tracking-tight whitespace-nowrap transition-colors',
                    active
                      ? 'text-slate-900'
                      : 'text-slate-500 hover:text-slate-900'
                  )}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-slate-900 rounded-full" aria-hidden />
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center flex-wrap gap-1 bg-slate-200/70 p-1 rounded-xl w-fit max-w-full overflow-x-auto mx-auto">
            {visibleToolTabs.map((tab) => {
              const active = tabForStep(step) === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.step)}
                  className={cn(
                    'inline-flex items-center h-9 px-4 rounded-lg text-[14px] font-semibold transition-colors whitespace-nowrap',
                    active
                      ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.1),0_2px_6px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* ACV Report internal stepper (Select Comps → Adjustments). The
            old Review & Generate step was dropped — Print lives on the
            Adjustments step now. */}
        {step >= 2 && step <= 3 && (
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {['Select Comps', 'Adjustments'].map((label, i) => {
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
        {/* Step 1: Claim Info — single Card holding the new 2-column form.
            Opposing Appraiser + Valuations are built here (they need parent
            reportsState) and injected as props into ClaimInfoForm's Row 4. */}
        {step === 1 && (() => {
          const vInputCls = 'w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
          const vLabelCls = 'block text-[12px] font-medium text-slate-500 tracking-tight mb-1'
          const vHeaderCls = 'text-[15px] font-bold text-black tracking-tight mb-2'
          const types = claim.claimTypes ?? []
          const showAll = types.length === 0 || types.includes('other')
          const showAcv = showAll || types.includes('acv')
          const showDv = showAll || types.includes('dv')
          const showEst = showAll || types.includes('estimate')
          const showStorage = showAll || types.includes('storage')
          const dvAmount = dv ? finalDvFor(dv, claim.mileage) : 0
          const storageAmount = storage ? computeStorageTotals(storage).total : 0
          const opposingAppraiserSection = (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                <div>
                  <label className={vLabelCls}>Opposing Appraiser Name</label>
                  <OpposingAppraiserPicker
                    value={reportsState.notesData.appraiserName}
                    currentCompany={reportsState.notesData.appraiserCompany}
                    placeholder="First Last"
                    onChange={(value) => {
                      const parts = value.trim().split(/\s+/)
                      const lastName = parts.length > 1 ? parts[parts.length - 1] : value.trim()
                      setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, appraiserName: value, appraiserLastName: lastName },
                        awardData: { ...prev.awardData, signatureBlock2: [value, prev.notesData.appraiserCompany].filter(Boolean).join('\n') },
                      }))
                    }}
                    onSelect={(oa) => {
                      setReportsState(prev => ({
                        ...prev,
                        notesData: {
                          ...prev.notesData,
                          appraiserName: oa.name,
                          appraiserCompany: oa.company ?? '',
                          appraiserLastName: oa.name.trim().split(/\s+/).pop() ?? oa.name,
                        },
                        awardData: {
                          ...prev.awardData,
                          signatureBlock2: [oa.name, oa.company ?? ''].filter(Boolean).join('\n'),
                        },
                      }))
                      // Henry 2026-10-10: if this claim has any claim types
                      // the OA doesn't currently handle, union them onto the
                      // OA profile. Fire-and-forget — a silent-no-op on
                      // pre-migration envs or auth hiccups is acceptable.
                      const claimTypes = claim.claimTypes ?? []
                      const have = new Set(oa.claimTypes ?? [])
                      const missing = claimTypes.filter(t => !have.has(t))
                      if (missing.length > 0) {
                        unionOpposingAppraiserClaimTypes(oa.id, missing)
                      }
                    }}
                  />
                </div>
                <div>
                  <label className={vLabelCls}>Opposing Appraiser Company</label>
                  <InlineEditText
                    value={reportsState.notesData.appraiserCompany}
                    placeholder="Firm / appraisal company"
                    onChange={(company) => {
                      setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, appraiserCompany: company },
                        awardData: { ...prev.awardData, signatureBlock2: [prev.notesData.appraiserName, company].filter(Boolean).join('\n') },
                      }))
                    }}
                  />
                </div>
              </div>
            </>
          )
          const valuationsSection = (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl">
                {showAcv && (() => {
                  // ACV override policy (Henry 2026-10-12):
                  //   OPEN  → read-only chip, always shows live result.acv
                  //           when the calculator has run. Changing ACV in
                  //           the calculator auto-updates Closing Notes
                  //           without any manual intervention. If no live
                  //           ACV exists yet (no comps picked), the field
                  //           stays editable so the user can set an initial
                  //           value by hand.
                  //   CLOSED → editable; override takes over once set so the
                  //            closed-claim value doesn't drift when someone
                  //            edits the calculator afterwards. "Reset to
                  //            live" link clears the override.
                  const override = reportsState.notesData.maValueNum ?? 0
                  const liveAcv = result.acv > 0 ? result.acv : 0
                  const openWithLive = !isClosed && liveAcv > 0
                  const diverges = isClosed && override > 0 && Math.abs(override - liveAcv) > 1
                  // Open+live: always show live. Otherwise prefer override.
                  const displayed = openWithLive
                    ? liveAcv
                    : (override > 0 ? override : liveAcv)
                  return (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className={vLabelCls}>MA Value (ACV)</label>
                        {diverges && (
                          <button
                            type="button"
                            onClick={() => setReportsState(prev => ({
                              ...prev,
                              notesData: { ...prev.notesData, maValueNum: 0 },
                            }))}
                            className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-wide"
                            title={`Reset to live ACV (${formatCurrency(liveAcv)})`}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {openWithLive ? (
                        // Open claim WITH live ACV → read-only chip. Editing
                        // the ACV calculator automatically updates this.
                        <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 font-medium tabular-nums">
                          {formatCurrency(liveAcv)}
                        </div>
                      ) : (
                        // Closed OR open-without-live → editable so the user
                        // can type an override / seed an initial value.
                        <InlineEditCurrency
                          value={displayed}
                          onChange={(val) => setReportsState(prev => ({
                            ...prev,
                            // Writing the SAME value as live stores 0 so the
                            // override stays clean (otherwise the Reset
                            // button would appear even when nothing changed).
                            notesData: { ...prev.notesData, maValueNum: Math.abs(val - liveAcv) <= 1 ? 0 : val },
                          }))}
                        />
                      )}
                    </div>
                  )
                })()}
                {showDv && (
                  <div>
                    <label className={vLabelCls}>MA Value (DV)</label>
                    <InlineEditCurrency
                      value={dvAmount > 0 ? dvAmount : (reportsState.notesData.dvValueNum ?? 0)}
                      onChange={(val) => setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, dvValueNum: val },
                      }))}
                    />
                  </div>
                )}
                {showEst && (
                  <div>
                    <label className={vLabelCls}>MA Value (Est)</label>
                    <InlineEditCurrency
                      value={reportsState.notesData.estValueNum ?? 0}
                      onChange={(val) => setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, estValueNum: val },
                      }))}
                    />
                  </div>
                )}
                {showEst && (
                  // Repair Shop Value — the body shop's own estimate on the
                  // vehicle. Lives in notesData.repairShopAmountNum (same
                  // field edited inside the Closing Notes "Repair Shop"
                  // section), so changing either place keeps both in sync.
                  <div>
                    <label className={vLabelCls}>Repair Shop Value</label>
                    <InlineEditCurrency
                      value={reportsState.notesData.repairShopAmountNum ?? 0}
                      onChange={(val) => setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, repairShopAmountNum: val },
                      }))}
                    />
                  </div>
                )}
                {showStorage && (
                  <div>
                    <label className={vLabelCls}>MA Value (Storage)</label>
                    <InlineEditCurrency
                      value={storageAmount > 0 ? storageAmount : (reportsState.notesData.storageValueNum ?? 0)}
                      onChange={(val) => setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, storageValueNum: val },
                      }))}
                    />
                  </div>
                )}
                <div>
                  <label className={vLabelCls}>Ins. Co. Offer</label>
                  <InlineEditCurrency
                    value={reportsState.notesData.insuranceOfferNum ?? 0}
                    onChange={(val) => setReportsState(prev => ({
                      ...prev,
                      notesData: { ...prev.notesData, insuranceOfferNum: val },
                    }))}
                  />
                </div>
                <div>
                  <label className={vLabelCls}>OA Value</label>
                  <InlineEditCurrency
                    value={reportsState.notesData.appraiserValueNum}
                    onChange={(val) => setReportsState(prev => ({
                      ...prev,
                      notesData: { ...prev.notesData, appraiserValueNum: val },
                    }))}
                  />
                </div>
                <div>
                  <label className={vLabelCls}>{proceededToUmpire ? 'Umpire Ruling Award' : 'Award Amount'}</label>
                  <InlineEditCurrency
                    value={reportsState.notesData.agreementAmountNum}
                    onChange={(val) => setReportsState(prev => ({
                      ...prev,
                      // Agreement / Award of loss / (when umpire) Umpire
                      // Ruling Amount are all the same conceptual value —
                      // mirror so editing here fills Award form + Closing
                      // Notes without the user having to retype.
                      awardData: { ...prev.awardData, acvAmountNum: val },
                      notesData: {
                        ...prev.notesData,
                        agreementAmountNum: val,
                        ...(proceededToUmpire ? { umpireAmountNum: val } : {}),
                      },
                    }))}
                  />
                </div>
              </div>
            </>
          )
          const claimInfoLocked = !claimInfoEditMode && !isNew
          return (
          <div>
            <Card className={cn(
              'bg-white border-gray-200 shadow-sm',
              // In read mode the SectionCards inside render their own borders,
              // so drop the outer Card chrome entirely for a clean, nested-free
              // look. In edit mode we keep the Card so the title + Done button
              // sit nicely at the top of the form.
              claimInfoLocked && 'border-0 shadow-none bg-transparent ring-0 py-0 rounded-none',
            )}>
              {!claimInfoLocked && (
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-black text-lg font-bold tracking-tight">
                      Claim Information
                    </CardTitle>
                    {!isNew && (isAdmin || profile?.canEditClaimInfo === true) && (
                      <Button size="sm" variant="outline" onClick={() => setClaimInfoEditMode(false)}>
                        <Lock className="w-3.5 h-3.5 mr-1" /> Done
                      </Button>
                    )}
                  </div>
                </CardHeader>
              )}
              <CardContent className={cn(claimInfoLocked ? 'p-0' : 'space-y-5 pt-0')}>
                <ClaimInfoForm
                  claim={claim}
                  onChange={setClaim}
                  clientId={clientId}
                  onClientIdChange={setClientId}
                  insuranceCompanyOptions={insuranceCompanyOptions}
                  duplicates={duplicates}
                  isNew={isNew}
                  canEdit={isAdmin || profile?.canEditClaimInfo === true}
                  isAdmin={isAdmin}
                  onParsedNotes={(notes) => { pendingAutoNoteRef.current = notes }}
                  onAssignmentSheetUploaded={(file) => {
                    pendingAssignmentSheetRef.current = file
                    // Existing claim? Upload immediately — we already have id + MA#.
                    // New claim? Stash; createClaim fires uploadPendingAssignmentSheet
                    // once the save returns.
                    if (editingIdRef.current && (claim.maNumber || '').trim()) {
                      void uploadPendingAssignmentSheet()
                    }
                  }}
                  allProfiles={allProfiles}
                  opposingAppraiserSection={opposingAppraiserSection}
                  valuationsSection={valuationsSection}
                  editMode={claimInfoEditMode}
                  onEditModeChange={setClaimInfoEditMode}
                  needsRoughNumbers={needsRoughNumbers}
                  onNeedsRoughNumbersChange={setNeedsRoughNumbers}
                />
              </CardContent>
            </Card>
            {isNew && (() => {
              const missing = missingRequiredFields()
              return (
                <div className="mt-6 space-y-2">
                  {createClaimError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{createClaimError}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-3">
                    {missing.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Missing: <span className="font-semibold">{missing.join(', ')}</span></span>
                      </div>
                    )}
                    <Button
                      onClick={createClaim}
                      disabled={creatingClaim}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                    >
                      {creatingClaim ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                      Create Claim
                    </Button>
                  </div>
                </div>
              )
            })()}
          </div>
          )
        })()}

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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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

            {/* VIN decoders occasionally misclassify body type (e.g. Kia Soul → "SUV")
                — when strict matching returns 0 we auto-widen past bodyType so the user
                still sees comps. Flag it so the override is visible, not silent. */}
            {!loadingComps && bodyTypeAutoWidened && unselectedListings.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  No listings matched body type <span className="font-semibold">{claim.bodyType}</span> — showing all body types instead.
                  Toggle the <span className="font-semibold">Body</span> match chip above to re-apply if the subject body type is correct.
                </span>
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
                {(['trim', 'drivetrain', 'transmission', 'engine', 'fuelType', 'bodyType'] as const).map((field) => {
                  const unique = [...new Set(listings.map((l) => l[field] || '').filter(Boolean))].sort()
                  if (unique.length < 2) return null
                  const labelMap: Record<string, string> = { drivetrain: 'Drive', fuelType: 'Fuel', bodyType: 'Body' }
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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

        {/* Step 3: Adjustments (final step — Print button generates the ACV
            report inline; the old Review & Generate step was dropped since
            it duplicated what's already visible in the Adjustments panel). */}
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
              maValueOverride={
                // Override banner only fires on closed claims — open claims
                // ignore the override entirely so there's no divergence
                // worth warning about (Henry 2026-10-12).
                isClosed &&
                reportsState.notesData.maValueNum > 0 &&
                Math.abs(reportsState.notesData.maValueNum - result.acv) > 1
                  ? {
                      manualValue: reportsState.notesData.maValueNum,
                      onReset: () => setReportsState(prev => ({
                        ...prev,
                        notesData: { ...prev.notesData, maValueNum: 0 },
                      })),
                    }
                  : null
              }
            />
            {acvPrintError && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {acvPrintError}
              </div>
            )}
            <div className="flex items-center gap-3 mt-6">
              <Button onClick={() => setStep(2)} variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-100">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acvIncludeCover}
                  onChange={(e) => setAcvIncludeCover(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                Cover Page
              </label>
              <Button
                onClick={async () => {
                  setAcvPrinting(true)
                  setAcvPrintError(null)
                  const name = `${claim.maNumber || 'report'}-acvreport.pdf`
                  try {
                    // Picker-first (see docs/BUGS.md 2026-10-13 and save-pdf.ts).
                    // Opens the OS Save-As dialog on the live click gesture;
                    // the fetch + save + Documents attach run after the user
                    // has chosen a folder.
                    await savePdfPickerFirst(
                      name,
                      async () => {
                        const res = await fetch('/api/acv/generate-pdf', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ claim, comps: builtComps, adjustments, includeCover: acvIncludeCover }),
                        })
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}))
                          throw new Error(data.error || 'PDF generation failed')
                        }
                        return res.blob()
                      },
                      async (blob, filename) => {
                        await handleSaveClaim()
                        await addDocument(blob, filename, 'acv-report')
                      },
                    )
                  } catch (err) {
                    setAcvPrintError(err instanceof Error ? err.message : 'Print failed')
                  } finally {
                    setAcvPrinting(false)
                  }
                }}
                disabled={acvPrinting || builtComps.length < 1}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {acvPrinting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Print Report
              </Button>
            </div>
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
              dv={dv}
              storage={storage}
              viewerId={profile?.id}
              viewerName={profile?.name ?? profile?.email}
              viewerIsAdmin={isAdmin}
              summaryDraft={summaryDraft}
              onSummaryDraftChange={setSummaryDraft}
              editingId={editingId}
              isClosed={isClosed}
              proceededToUmpire={proceededToUmpire}
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
            <EstimateTab
              claim={claim}
              claimId={editingId}
              estimate={estimate}
              onChange={setEstimate}
              onDocumentSaved={(blob, name, source) => addDocument(blob, name, source)}
              documents={documents}
            />
          </div>
        )}

        {/* Step 10: Documents */}
        {step === 10 && editingId && (
          <div>
            <DocumentsTab
              claimId={editingId}
              maNumber={claim.maNumber}
              documents={documents}
              onDocumentsChange={setDocuments}
            />
          </div>
        )}

        {/* Step 11: Diminished Value */}
        {step === 11 && (
          <div>
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
            <ReportsTab
              claim={claim}
              invoice={invoice}
              onChange={setInvoice}
              onGenerated={(blob, name) => addDocument(blob, name, 'invoice')}
              onBack={() => setStep(15)}
            />
          </div>
        )}

        {/* Step 16: Storage Charges — new element-of-loss tool (2026-09-15).
            Line-item calculator (Qty display / Description / Hours × Rate) with
            configurable sales tax and a notes block. Generates a from-scratch
            PDF (see /api/storage/generate-pdf + lib/storage/pdf.ts). */}
        {step === 16 && (
          <div>
            <StorageTab
              claim={claim}
              state={storage ?? defaultStorageState()}
              onChange={setStorage}
              onDocumentSaved={(blob, name) => addDocument(blob, name, 'storage')}
              readOnly={readOnly}
            />
          </div>
        )}

        {/* Step 19: Loss of Use (LOU) — rental-based LOU calculation plus
            PDF fill (two templates: direct days OR hours-derived). State is
            persisted on acv_history.lou jsonb; the Documents tab auto-files
            the generated PDF via addDocument. */}
        {step === 19 && (
          <div>
            <LOUTab
              claim={claim}
              lou={lou}
              onChange={setLou}
              onClaimChange={setClaim}
              onGenerated={(blob, name) => addDocument(blob, name, 'lou-report')}
            />
          </div>
        )}
        </fieldset>

        {/* Step 13: Messages — rendered OUTSIDE the fieldset so messaging
            stays active even on submitted/closed/read-only claims (spec §7.2:
            meta-conversation about the work is always allowed). */}
        {step === 13 && editingId && (
          <MessagesTab claimId={editingId} isClaimClosed={status === 'closed'} assignedToId={assignedTo} />
        )}

        {/* Step 14: Guidelines — reference material for the claim's insurance
            company. Always viewable (any state), fully read-only in the tab. */}
        {step === 14 && (
          <GuidelinesTab insuranceCompany={claim.insuranceCompany} />
        )}

        {/* Step 15: Reports Hub — entry point for all fillable/printable reports
            attached to this claim (Invoice, ACV Modern Contract). Admin-only —
            appraisers don't touch invoicing or the signed contract. Deep links
            to ?tab=reports-hub for non-admins fall through to a hidden render. */}
        {step === 15 && isAdmin && (
          <ReportsHubTab
            claimId={editingId ?? claimId}
            claim={claim}
            invoice={invoice}
            onOpenInvoice={() => setStep(12)}
            onOpenContract={() => setStep(20)}
            onOpenCoverLetter={() => setStep(21)}
            onDocumentSaved={(blob, name, source) => addDocument(blob, name, source)}
          />
        )}

        {/* Step 20: ACV Modern Contract (inline). Renders the standalone
            /claims/[id]/contract form in-workspace so clicking Edit from the
            Reports Hub feels the same as Edit on the Invoice — just appears,
            no modal, no route change. */}
        {step === 20 && isAdmin && editingId && (
          <div>
            <ContractClient
              embed
              onBack={() => setStep(15)}
              /* onBack renders a "← Back to Reports" button inside the
                 first section's header (matches Closing Notes layout). */
              entry={{
                id: editingId,
                date: '',
                mode: 'auto-acv',
                vehicle: [claim.year, claim.make, claim.model].filter(Boolean).join(' '),
                vin: claim.vin,
                maNumber: claim.maNumber,
                acv: 0,
                claim,
                comps: [],
                adjustments: defaultAdjustments(),
                result: { comp1Value: 0, comp2Value: 0, comp3Value: 0, averageValue: 0, totalAdjustments: 0, taxAmount: 0, acv: 0 },
                mileageRate: 0,
                status: 'open',
                reportsState,
              }}
            />
          </div>
        )}

        {/* Step 21: Cover Letter (inline). All fields in the editor
            (title + MA# / Date / Claim# / Client Name / Insured / Vehicle /
            VIN / Mileage) are editable, seeded from the claim. Generates a
            1-page PDF via /api/cover-letter/generate-pdf. The page title
            lives inside the editor card; only the Back button is in the
            wrapper to match the Invoice / Contract step layouts. */}
        {step === 21 && isAdmin && (
          <div>
            <CoverLetterTab
              claim={claim}
              onGenerated={(blob, name) => addDocument(blob, name, 'document')}
              onBack={() => setStep(15)}
            />
          </div>
        )}

        {/* Step 17: Forms — placeholder for client-specific intake / release
            forms. Visible to everyone. Content gets populated by the admin
            later. */}
        {step === 17 && editingId && (
          <FormsTab claimId={editingId} clientName={claim.clientName} />
        )}

        {/* Step 18: Activity timeline — chronological event log of stage
            transitions, reassignments, and messages for this claim. Admin-only. */}
        {step === 18 && isAdmin && editingId && (
          <ActivityTab claimId={editingId} allProfiles={allProfiles} />
        )}
      </main>

    </div>
  )
}

export function ClaimWorkspace({
  claimId,
  isLockedForMe = false,
}: {
  claimId: string
  // When true, the viewer is an assignee who's been locked out on this
  // specific claim (status_lockout_at is set and they're not an admin).
  // Everything in the workspace becomes read-only EXCEPT the Messages tab —
  // the appraiser can view the file, read messages, and post a status, but
  // cannot upload, edit, generate reports, or trigger any other write. The
  // DB trigger clears the lockout the moment they post a non-auto message
  // on this claim; the page refetches the lockout state on next navigation.
  isLockedForMe?: boolean
}) {
  return <ClaimWorkspaceInner claimId={claimId} isLockedForMe={isLockedForMe} />
}
