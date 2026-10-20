"use client"

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer, AlertCircle } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  emptyInvoiceFormData,
  invoiceSubtotal,
  formatInvoiceMoneyWithSign,
  formatLineItemsForPdf,
  pickInvoiceVariant,
} from '@/lib/invoice/types'
import { InvoiceFormFields, InvoiceLineItemsEditor, InvoiceSummary } from '@/components/invoice/invoice-fields'
import { savePdfPickerFirst } from '@/lib/save-pdf'

export default function StandaloneInvoicePage() {
  const [data, setData] = useState(emptyInvoiceFormData)
  const set = (patch: Partial<typeof data>) => setData((prev) => ({ ...prev, ...patch }))
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    const name = `invoice${data.invoiceNumber ? `-${data.invoiceNumber}` : ''}.pdf`
    try {
      await savePdfPickerFirst(name, async () => {
        const subtotal = formatInvoiceMoneyWithSign(invoiceSubtotal(data.lineItems))
        const variant = pickInvoiceVariant(data.lineItems.length)
        const res = await fetch('/api/invoices/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variant,
            data: { ...data, lineItems: formatLineItemsForPdf(data.lineItems), subtotal },
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'PDF generation failed')
        }
        return res.blob()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-6 py-7">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/reports" className="hp-btn hp-btn-sm hp-btn-ghost">
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <h1 className="hp-display">Invoice</h1>
        </div>

        <div className="space-y-6">
          <InvoiceFormFields data={data} onChange={set} />

          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader><CardTitle className="text-gray-900">Line Items</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <InvoiceLineItemsEditor lineItems={data.lineItems} onChange={(lineItems) => set({ lineItems })} />
              <InvoiceSummary lineItems={data.lineItems} />
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
            Print Report
          </Button>
        </div>
      </main>
    </div>
  )
}
