"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import type { ACVHistoryEntry } from '@/lib/supabase/history'
import { createClient } from '@/lib/supabase/client'

// Labels + section grouping for the ACV Modern Contract fill flow. Field
// names are the auto-generated AcroForm names from the PDF template; the
// visual mapping (which name corresponds to which labeled box) was derived
// by running scripts/inspect-contract-pdf.mjs and matching field positions
// against the printed template. If a label ever looks wrong on the generated
// PDF, regenerate the position dump and update this mapping.

type SectionType = 'section'
type FieldType = 'text' | 'dropdown' | 'checkbox'

interface FieldSpec {
  kind: 'field'
  name: string
  label: string
  type: FieldType
  colSpan?: 1 | 2
  /** Only meaningful when type === 'dropdown'. Values must match the PDF's
   *  option list exactly (including any embedded whitespace) — pdf-lib will
   *  refuse the write otherwise. Display gets a `.trim()` for readability. */
  options?: string[]
}
interface SectionSpec {
  kind: SectionType
  label: string
}
type LayoutItem = FieldSpec | SectionSpec

// State option list from the PDF's own dropdowns (List Box 2 / 2_2 / 2_3).
// Some entries carry an embedded \t that pdf-lib requires for the write to
// stick; we keep the raw string here and .trim() only for display.
const STATE_OPTIONS = [
  'AL', 'AK', 'AZ\t', 'AR\t', 'CA\t', 'CO\t', 'CT\t', 'DE\t', 'FL', 'GA',
  'HI', 'ID\t', 'IL\t', 'IN', 'IA\t', 'KS\t', 'KY\t', 'LA\t', 'ME\t', 'MD\t',
  'MA\t', 'MI\t', 'MN\t', 'MS\t', 'MO\t', 'MT\t', 'NE\t', 'NV\t', 'NH\t', 'NJ\t',
  'NM\t', 'NY\t', 'NC\t', 'ND\t', 'OH\t', 'OK\t', 'OR\t', 'PA\t', 'RI.', 'SC\t',
  'SD\t', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV\t', 'WI\t', 'WY',
]

const LAYOUT: LayoutItem[] = [
  { kind: 'section', label: 'Cover Letter' },
  { kind: 'field', name: 'List Box 1',    label: 'How did you hear about Modern Appraisers?', type: 'dropdown', colSpan: 2,
    options: ['Social Media', 'Google/Online', 'Billboard', 'Mail', 'Law Firm', 'Body Shop', 'Insurance Company', 'Other'] },

  { kind: 'section', label: 'Vehicle Owner' },
  { kind: 'field', name: 'Text Box 1',    label: 'Owner Email',                    type: 'text' },
  { kind: 'field', name: 'Text Box 1_2',  label: 'Vehicle Status (Lease / Buy / Paid Off)', type: 'text' },
  { kind: 'field', name: 'Text Box 1_3',  label: 'Owner First Name',               type: 'text' },
  { kind: 'field', name: 'Text Box 1_7',  label: 'Owner Last Name',                type: 'text' },
  { kind: 'field', name: 'Text Box 1_4',  label: 'Owner Address',                  type: 'text', colSpan: 2 },
  { kind: 'field', name: 'Text Box 2',    label: 'Owner City',                     type: 'text' },
  { kind: 'field', name: 'List Box 2',    label: 'Owner State',                    type: 'dropdown', options: STATE_OPTIONS },
  { kind: 'field', name: 'Text Box 1_5',  label: 'Owner Phone 1',                  type: 'text' },
  { kind: 'field', name: 'Text Box 1_6',  label: 'Owner Phone 2',                  type: 'text' },

  { kind: 'section', label: 'Insurance Company' },
  { kind: 'field', name: 'Text Box 1_15', label: 'Claim Number',                   type: 'text' },
  { kind: 'field', name: 'Text Box 3',    label: 'Insurance Company ACV Offer',    type: 'text' },
  { kind: 'field', name: 'Text Box 1_8',  label: 'ACV Offer (secondary)',          type: 'text' },
  { kind: 'field', name: 'Text Box 1_9',  label: 'Insurance Company',              type: 'text' },
  { kind: 'field', name: 'Text Box 1_10', label: 'Adjuster Email',                 type: 'text' },
  { kind: 'field', name: 'Text Box 1_11', label: 'Adjuster Full Name',             type: 'text' },
  { kind: 'field', name: 'Text Box 1_12', label: 'Insurance Address',              type: 'text', colSpan: 2 },
  { kind: 'field', name: 'List Box 2_2',  label: 'Insurance State',                type: 'dropdown', options: STATE_OPTIONS },
  { kind: 'field', name: 'Text Box 1_13', label: 'Insurance City',                 type: 'text' },
  { kind: 'field', name: 'Text Box 1_14', label: 'Insurance Phone',                type: 'text' },

  { kind: 'section', label: 'Accident' },
  { kind: 'field', name: 'Date Field 1',  label: 'Date of Loss',                   type: 'text' },
  { kind: 'field', name: 'Text Box 1_16', label: 'Cause of Damage',                type: 'text' },
  { kind: 'field', name: 'Text Box 1_17', label: 'Point of Impact',                type: 'text' },
  { kind: 'field', name: 'Text Box 1_18', label: 'Party at Fault',                 type: 'text' },
  { kind: 'field', name: 'Text Box 1_19', label: 'Repair Status',                  type: 'text' },
  { kind: 'field', name: 'Text Box 1_20', label: 'Accident History',               type: 'text', colSpan: 2 },

  { kind: 'section', label: 'Vehicle' },
  { kind: 'field', name: 'Text Box 1_21', label: 'Year',                           type: 'text' },
  { kind: 'field', name: 'Text Box 1_22', label: 'Make',                           type: 'text' },
  { kind: 'field', name: 'Text Box 1_23', label: 'Model',                          type: 'text' },
  { kind: 'field', name: 'Text Box 1_24', label: 'Special Packages',              type: 'text' },
  { kind: 'field', name: 'Text Box 1_25', label: '17-Character VIN',              type: 'text', colSpan: 2 },
  { kind: 'field', name: 'List Box 3',    label: 'Condition',                      type: 'dropdown',
    options: ['Excellent', 'Very Good', 'Good', 'Fair'] },
  { kind: 'field', name: 'Text Box 1_26', label: 'Mileage',                        type: 'text' },
  { kind: 'field', name: 'Text Box 1_27', label: 'Color',                          type: 'text' },
  // PDF has two nearby fields for "Prior Damages": List Box 4 (empty option list,
  // likely a stub) and List Box 5 (Yes/No dropdown at the bottom of page 5).
  // We surface only the Yes/No one; the stub is left unfilled and ignored.
  { kind: 'field', name: 'List Box 5',    label: 'Prior Damages',                  type: 'dropdown',
    options: ['Yes', 'No'] },

  { kind: 'section', label: 'Payment (Optional)' },
  { kind: 'field', name: 'List Box 6',    label: 'Card Type',                      type: 'dropdown',
    options: ['Visa', 'Mastercard', 'American Express', 'Discover', 'Other'] },
  { kind: 'field', name: 'Text Box 1_28', label: 'Card Number',                    type: 'text' },
  { kind: 'field', name: 'Text Box 4',    label: 'Expiration Month',              type: 'text' },
  { kind: 'field', name: 'Text Box 4_2',  label: 'Expiration Year',               type: 'text' },
  { kind: 'field', name: 'Text Box 5',    label: 'CVV',                            type: 'text' },
  { kind: 'field', name: 'Text Box 1_29', label: 'Name on Card',                   type: 'text' },
  { kind: 'field', name: 'Text Box 1_30', label: 'Billing Address',                type: 'text', colSpan: 2 },
  { kind: 'field', name: 'Text Box 1_31', label: 'Billing Address 2',              type: 'text', colSpan: 2 },
  { kind: 'field', name: 'Text Box 1_32', label: 'Billing City',                   type: 'text' },
  { kind: 'field', name: 'List Box 2_3',  label: 'Billing State',                  type: 'dropdown', options: STATE_OPTIONS },
  { kind: 'field', name: 'Check Box 1',   label: 'I authorize a charge to my card', type: 'checkbox', colSpan: 2 },
]

const ALL_FIELDS = LAYOUT.filter((i): i is FieldSpec => i.kind === 'field')

function todayMMDDYYYY(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function buildDefaults(entry: ACVHistoryEntry): Record<string, string> {
  const c = entry.claim
  const owner = splitName(c.insuredName ?? '')
  return {
    // Vehicle Owner
    'Text Box 1':    c.ownerEmail ?? '',
    'Text Box 1_3':  owner.first,
    'Text Box 1_7':  owner.last,
    'Text Box 1_4':  c.ownerAddress ?? '',
    'Text Box 1_5':  c.ownerPhone ?? '',
    // Insurance
    'Text Box 1_15': c.claimNumber ?? '',
    'Text Box 1_9':  c.insuranceCompany ?? '',
    'Text Box 1_10': c.adjusterEmail ?? '',
    'Text Box 1_11': c.adjuster ?? '',
    'Text Box 1_14': c.adjusterPhone ?? '',
    // Accident
    'Date Field 1':  c.dateOfLoss ?? todayMMDDYYYY(),
    // Vehicle
    'Text Box 1_21': c.year ? String(c.year) : '',
    'Text Box 1_22': c.make ?? '',
    'Text Box 1_23': c.model ?? '',
    'Text Box 1_25': c.vin ?? '',
    'Text Box 1_26': c.mileage ? String(c.mileage) : '',
  }
}

interface Props {
  entry: ACVHistoryEntry
  // Optional overrides for in-workspace rendering. When present they win
  // over the ?embed=1 / ?readonly=1 URL params the standalone page uses.
  embed?: boolean
  readOnly?: boolean
  // Called by the "Back to Reports" button in embed mode. If omitted we fall
  // back to postMessage (iframe case) and finally router.back() (full page).
  onBack?: () => void
}

export function ContractClient({ entry, embed: embedProp, readOnly: readOnlyProp, onBack }: Props) {
  const router = useRouter()
  // Embed mode: when the contract is rendered inside the workspace or inside
  // the Reports Hub preview modal, hide the app chrome + back button so only
  // the form shows. Readonly disables every input + hides Generate.
  const search = useSearchParams()
  const embed = embedProp ?? (search.get('embed') === '1')
  const readOnly = readOnlyProp ?? (search.get('readonly') === '1')
  const defaults = buildDefaults(entry)

  // Initial values: saved contract state (if any) wins over claim-derived
  // defaults so users don't lose edits between visits. Each claim keeps its
  // own contract field values on reports_state.contract.
  const saved = entry.reportsState?.contract as Record<string, string> | undefined
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of ALL_FIELDS) init[f.name] = saved?.[f.name] ?? defaults[f.name] ?? ''
    return init
  })

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setValue(field: string, value: string) {
    setValues(prev => ({ ...prev, [field]: value }))
  }

  // Debounced auto-save of contract values onto acv_history.reports_state.
  // Merges with the existing reportsState so sibling blobs (summaryId,
  // Award / Notes editor state) aren't clobbered.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRun = useRef(true)
  useEffect(() => {
    if (readOnly) return
    if (firstRun.current) { firstRun.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const nextReportsState = { ...(entry.reportsState ?? {}), contract: values }
        await supabase.from('acv_history').update({ reports_state: nextReportsState }).eq('id', entry.id)
      } catch (err) {
        console.error('contract auto-save failed', err)
      }
    }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [values, readOnly, entry.id, entry.reportsState])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/acv/generate-contract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, maNumber: entry.maNumber }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.maNumber ? `${entry.maNumber}-contract.pdf` : 'contract.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const c = entry.claim
  const vehicleLabel = [c.year, c.make, c.model].filter(Boolean).join(' ')

  const inputCls = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const labelCls = 'block text-xs font-medium text-gray-600'

  function renderField(f: FieldSpec) {
    const colClass = f.colSpan === 2 ? 'sm:col-span-2' : ''
    if (f.type === 'checkbox') {
      return (
        <div key={f.name} className={`flex items-center gap-3 ${colClass}`}>
          <input
            type="checkbox"
            id={`field-${f.name}`}
            checked={values[f.name] === 'true'}
            onChange={e => setValue(f.name, e.target.checked ? 'true' : '')}
            disabled={readOnly}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-70"
          />
          <label htmlFor={`field-${f.name}`} className="text-sm text-gray-700">
            {f.label}
          </label>
        </div>
      )
    }
    if (f.type === 'dropdown' && f.options && f.options.length > 0) {
      return (
        <div key={f.name} className={`space-y-1 ${colClass}`}>
          <label htmlFor={`field-${f.name}`} className={labelCls}>{f.label}</label>
          <select
            id={`field-${f.name}`}
            value={values[f.name]}
            onChange={e => setValue(f.name, e.target.value)}
            disabled={readOnly}
            className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-700`}
          >
            <option value="">— Select —</option>
            {f.options.map(opt => (
              <option key={opt} value={opt}>{opt.trim()}</option>
            ))}
          </select>
        </div>
      )
    }
    return (
      <div key={f.name} className={`space-y-1 ${colClass}`}>
        <label htmlFor={`field-${f.name}`} className={labelCls}>{f.label}</label>
        <input
          id={`field-${f.name}`}
          type="text"
          value={values[f.name]}
          onChange={e => setValue(f.name, e.target.value)}
          readOnly={readOnly}
          className={`${inputCls} read-only:bg-gray-50 read-only:text-gray-700`}
          placeholder="—"
        />
      </div>
    )
  }

  // Group layout into sections for rendering.
  const sections: { label: string; fields: FieldSpec[] }[] = []
  let current: { label: string; fields: FieldSpec[] } | null = null
  for (const item of LAYOUT) {
    if (item.kind === 'section') {
      current = { label: item.label, fields: [] }
      sections.push(current)
    } else if (current) {
      current.fields.push(item)
    }
  }

  return (
    <>
      {!embed && <AppHeader />}
      <div className={embed ? 'space-y-6' : 'max-w-4xl mx-auto px-4 py-8 space-y-6'}>
        {/* Only the standalone page renders the back button + big title here.
            In embed mode the parent (workspace step 20 or modal header)
            already provides them — rendering again would duplicate. */}
        {!embed && (
          <>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to claim
            </button>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900">ACV Modern Contract</h1>
                {vehicleLabel && (
                  <p className="text-sm text-gray-500 mt-0.5">{entry.maNumber} — {vehicleLabel}</p>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {sections.map((section, idx) => (
          <div key={section.label} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
            {/* First section bubble carries ONLY the tab title + Back
                button. Print Report lives at bottom-right of the form (see
                below) matching every other tool. */}
            {idx === 0 && embed && (
              <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-gray-100">
                <h1 className="text-lg font-bold tracking-tight text-black">ACV Modern Contract</h1>
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    ← Back to Reports
                  </button>
                )}
              </div>
            )}
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{section.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {section.fields.map(renderField)}
            </div>
          </div>
        ))}

        {!readOnly && (
          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={generating} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
              {generating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                : <><Printer className="w-4 h-4 mr-2" />Print Report</>}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
