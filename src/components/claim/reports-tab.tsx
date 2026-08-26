"use client"

import { useState } from 'react'
import { Loader2, Printer, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClaimInfo } from '@/lib/acv/types'
import {
  invoiceSubtotal,
  formatInvoiceMoneyWithSign,
  formatLineItemsForPdf,
  emptyLineItem,
  pickInvoiceVariant,
  type InvoiceFormData,
} from '@/lib/invoice/types'
import { InvoiceFormFields, InvoiceLineItemsEditor, InvoiceSummary } from '@/components/invoice/invoice-fields'
import { savePdfWithPicker } from '@/lib/save-pdf'

// Per-claim Invoice state, stored as acv_history.invoice jsonb via workspace
// auto-save. Pre-filled from Claim Info the first time the tab is opened for
// a claim, but every field is editable from here on — nothing is silently
// pulled from the claim behind the scenes at generation time, so what's on
// this page is exactly what prints.
export type InvoiceReportState = InvoiceFormData

export function defaultInvoiceReportState(claim: ClaimInfo): InvoiceReportState {
  return {
    date: new Date().toISOString().split('T')[0],
    invoiceNumber: claim.maNumber,
    client: claim.clientName,
    ownerName: claim.insuredName,
    ownerAddress: claim.ownerAddress,
    ownerPhone: claim.ownerPhone,
    dateOfLoss: claim.dateOfLoss,
    insuranceCompany: claim.insuranceCompany,
    adjuster: claim.adjuster,
    insurancePhone: claim.adjusterPhone,
    insuranceEmail: claim.adjusterEmail,
    claimNumber: claim.claimNumber,
    vehicleYear: claim.year ? String(claim.year) : '',
    vehicleMake: claim.make,
    vehicleModel: claim.model,
    vin: claim.vin,
    lineItems: [emptyLineItem()],
  }
}

export function ReportsTab({
  claim,
  invoice,
  onChange,
  onGenerated,
}: {
  claim: ClaimInfo
  invoice: InvoiceReportState | null
  onChange: (next: InvoiceReportState) => void
  onGenerated?: (blob: Blob, name: string) => void
}) {
  const state = invoice ?? defaultInvoiceReportState(claim)
  const set = (patch: Partial<InvoiceReportState>) => onChange({ ...state, ...patch })

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    try {
      const subtotal = formatInvoiceMoneyWithSign(invoiceSubtotal(state.lineItems))
      const variant = pickInvoiceVariant(state.lineItems.length)
      const res = await fetch('/api/invoices/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant,
          data: { ...state, lineItems: formatLineItemsForPdf(state.lineItems), subtotal },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const name = `${claim.maNumber || 'claim'}-invoice${state.invoiceNumber ? `-${state.invoiceNumber}` : ''}.pdf`
      // Auto-file to Documents first, then prompt for local save location.
      onGenerated?.(blob, name)
      await savePdfWithPicker(blob, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <InvoiceFormFields data={state} onChange={set} />

      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Line Items</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <InvoiceLineItemsEditor lineItems={state.lineItems} onChange={(lineItems) => set({ lineItems })} />
          <InvoiceSummary lineItems={state.lineItems} />
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
        {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
        Print Invoice
      </Button>
    </div>
  )
}
