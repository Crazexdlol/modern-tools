"use client"

import { useState } from 'react'
import { Loader2, Printer, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClaimInfo } from '@/lib/acv/types'
import { savePdfPickerFirst } from '@/lib/save-pdf'

// Single-card Cover Letter editor. The title ("Appraisal" by default) and
// every identity row (MA#, Date, Claim#, Client Name, Insured, Vehicle,
// VIN, Mileage) are all editable text inputs seeded from the claim. The
// user can override any value before generating the PDF.
export function CoverLetterTab({
  claim,
  onGenerated,
  onBack,
}: {
  claim: ClaimInfo
  onGenerated?: (blob: Blob, name: string) => Promise<void> | void
  // When set, renders a "← Back to Reports" button in the card header so
  // the tab matches the Closing Notes / Award in-bubble layout.
  onBack?: () => void
}) {
  const todayUs = (() => {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
  })()
  const seedVehicle = [claim.year, claim.make, claim.model].filter(Boolean).join(' ')
  const seedMileage = claim.mileage ? claim.mileage.toLocaleString('en-US') : ''

  // Date of Loss arrives as ISO (YYYY-MM-DD) on the claim — format to the
  // same M/D/YYYY style the template uses for its own "Date" row.
  const seedDol = (() => {
    if (!claim.dateOfLoss) return ''
    const m = claim.dateOfLoss.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[2]}/${m[3]}/${m[1]}` : claim.dateOfLoss
  })()

  const [title, setTitle] = useState('Appraisal')
  const [maNumber, setMaNumber] = useState(claim.maNumber || '')
  const [date, setDate] = useState(todayUs)
  const [claimNumber, setClaimNumber] = useState(claim.claimNumber || '')
  const [clientName, setClientName] = useState(claim.clientName || '')
  const [insuredName, setInsuredName] = useState(claim.insuredName || '')
  const [vehicle, setVehicle] = useState(seedVehicle)
  const [vin, setVin] = useState(claim.vin || '')
  const [mileage, setMileage] = useState(seedMileage)
  const [dateOfLoss, setDateOfLoss] = useState(seedDol)

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    const name = `${maNumber || 'claim'}-cover.pdf`
    try {
      await savePdfPickerFirst(
        name,
        async () => {
          const res = await fetch('/api/cover-letter/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: { title, maNumber, date, claimNumber, clientName, insuredName, vehicle, vin, mileage, dateOfLoss },
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'PDF generation failed')
          }
          return res.blob()
        },
        async (blob, filename) => {
          await onGenerated?.(blob, filename)
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-3">
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-black text-lg font-bold tracking-tight">Cover Letter</CardTitle>
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
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Appraisal" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>MA #</label>
              <input className={inputCls} value={maNumber} onChange={(e) => setMaNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Claim #</label>
              <input className={inputCls} value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Client Name</label>
              <input className={inputCls} value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Insured</label>
              <input className={inputCls} value={insuredName} onChange={(e) => setInsuredName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Vehicle</label>
              <input className={inputCls} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>VIN</label>
              <input className={inputCls} value={vin} onChange={(e) => setVin(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Mileage</label>
              <input className={inputCls} value={mileage} onChange={(e) => setMileage(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date of Loss</label>
              <input className={inputCls} value={dateOfLoss} onChange={(e) => setDateOfLoss(e.target.value)} />
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

      <div>
        <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
          {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
          Print Report
        </Button>
      </div>
    </div>
  )
}
