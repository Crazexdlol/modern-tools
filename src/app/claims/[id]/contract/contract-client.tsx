"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/app-header'
import type { ACVHistoryEntry } from '@/lib/supabase/history'

// The 47 field names from the acv-contract-template.pdf AcroForm.
// These are the auto-generated names from the PDF authoring tool —
// there is no semantic mapping yet. Henry: open the PDF in Acrobat,
// rename each field to a meaningful name (e.g. 'insured_name'), then
// update the CONTRACT_FIELDS array and the DEFAULT_VALUES seeding below.
const CONTRACT_FIELDS = [
  'List Box 1',
  'Text Box 1',
  'Text Box 1_2',
  'Text Box 1_3',
  'Text Box 1_4',
  'Text Box 1_5',
  'Text Box 1_6',
  'Text Box 1_7',
  'Text Box 2',
  'List Box 2',
  'List Box 2_2',
  'Text Box 1_8',
  'Text Box 1_9',
  'Text Box 1_10',
  'Text Box 1_11',
  'Text Box 1_12',
  'Text Box 1_13',
  'Text Box 1_14',
  'Text Box 3',
  'Text Box 1_15',
  'Date Field 1',
  'Text Box 1_16',
  'Text Box 1_17',
  'Text Box 1_18',
  'Text Box 1_19',
  'Text Box 1_20',
  'Text Box 1_21',
  'Text Box 1_22',
  'Text Box 1_23',
  'Text Box 1_24',
  'Text Box 1_25',
  'Text Box 1_26',
  'Text Box 1_27',
  'List Box 3',
  'List Box 4',
  'List Box 5',
  'List Box 6',
  'Text Box 1_28',
  'Text Box 1_29',
  'Text Box 1_30',
  'Text Box 1_31',
  'Text Box 1_32',
  'List Box 2_3',
  'Check Box 1',
  'Text Box 4',
  'Text Box 4_2',
  'Text Box 5',
] as const

function todayMMDDYYYY(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function buildDefaults(entry: ACVHistoryEntry): Record<string, string> {
  const c = entry.claim
  const vehicle = [c.year, c.make, c.model].filter(Boolean).join(' ')
  return {
    'Date Field 1': todayMMDDYYYY(),
    'Text Box 1': c.claimNumber ?? '',
    'Text Box 2': c.insuredName ?? '',
    'Text Box 3': c.vin ?? '',
    'Text Box 4': vehicle,
  }
}

interface Props {
  entry: ACVHistoryEntry
}

export function ContractClient({ entry }: Props) {
  const router = useRouter()
  const defaults = buildDefaults(entry)

  // All field values, keyed by PDF field name
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of CONTRACT_FIELDS) {
      init[f] = defaults[f] ?? ''
    }
    return init
  })

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setValue(field: string, value: string) {
    setValues(prev => ({ ...prev, [field]: value }))
  }

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

  return (
    <>
      <AppHeader />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Back */}
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to claim
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">ACV Modern Contract</h1>
            {vehicleLabel && (
              <p className="text-sm text-gray-500 mt-0.5">{entry.maNumber} — {vehicleLabel}</p>
            )}
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              : <><Download className="w-4 h-4 mr-2" />Generate PDF</>}
          </Button>
        </div>

        {/* Field-mapping notice */}
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Fields are labeled by their PDF field name. Henry — open the PDF in Acrobat and rename fields to semantic names (e.g. &quot;insured_name&quot;) so we can auto-populate them from claim data.
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Field grid */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {CONTRACT_FIELDS.map(field => {
              const isCheckBox = field === 'Check Box 1'
              const isListBox = field.startsWith('List Box')

              if (isCheckBox) {
                return (
                  <div key={field} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`field-${field}`}
                      checked={values[field] === 'true'}
                      onChange={e => setValue(field, e.target.checked ? 'true' : '')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`field-${field}`} className="text-sm text-gray-700 font-mono">
                      {field}
                    </label>
                  </div>
                )
              }

              if (isListBox) {
                return (
                  <div key={field} className="space-y-1">
                    <label htmlFor={`field-${field}`} className="block text-xs font-medium text-gray-500 font-mono">
                      {field}
                    </label>
                    <input
                      id={`field-${field}`}
                      type="text"
                      value={values[field]}
                      onChange={e => setValue(field, e.target.value)}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="—"
                    />
                  </div>
                )
              }

              return (
                <div key={field} className="space-y-1">
                  <label htmlFor={`field-${field}`} className="block text-xs font-medium text-gray-500 font-mono">
                    {field}
                  </label>
                  <input
                    id={`field-${field}`}
                    type="text"
                    value={values[field]}
                    onChange={e => setValue(field, e.target.value)}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="—"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom generate button */}
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
              : <><Download className="w-4 h-4 mr-2" />Generate PDF</>}
          </Button>
        </div>
      </div>
    </>
  )
}
