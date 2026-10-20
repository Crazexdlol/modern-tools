"use client"

import { useEffect, useState } from 'react'
import { X, Loader2, Printer, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClaimInfo } from '@/lib/acv/types'
import type { InvoiceReportState } from '@/components/claim/reports-tab'
import { defaultInvoiceReportState } from '@/components/claim/reports-tab'
import {
  pickInvoiceVariant,
  invoiceSubtotal,
  formatInvoiceMoneyWithSign,
  formatLineItemsForPdf,
} from '@/lib/invoice/types'
import { savePdfPickerFirst } from '@/lib/save-pdf'

interface Props {
  claimId: string
  claim: ClaimInfo
  invoice: InvoiceReportState | null
  onOpenInvoice: () => void
  onOpenContract: () => void
  onOpenCoverLetter: () => void
  // Files a generated report blob into the claim's Documents tab. Required
  // so the Reports Hub's Print buttons behave the same as the per-tool
  // tabs (Invoice tab, DV tab, etc.) — otherwise printing from the Hub
  // silently skips the Documents save and the user has to use the other
  // tab to get a filed copy.
  // Returns a Promise so the caller can AWAIT the full upload + DB-save
  // chain before continuing. Without the await, closing the file picker +
  // refreshing fast enough would orphan the Documents-tab save.
  onDocumentSaved?: (blob: Blob, name: string, source: 'invoice' | 'document') => Promise<void> | void
}

interface PreviewState {
  title: string
  url: string
  // When the URL is an object: URL from a Blob we created, revoke on close.
  objectUrl?: boolean
}

// Table-style Claim Documents list — one row per generatable report.
// Preview opens the report content in a modal (no app chrome, read-only).
// Edit opens the same modal in editable mode OR navigates in-tab, depending
// on what the report is (Invoice is a workspace tab; Contract is its own
// route, so Edit iframes it in embed mode so the user stays on this page).
export function ReportsHubTab({ claimId, claim, invoice, onOpenInvoice, onOpenContract, onOpenCoverLetter, onDocumentSaved }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  function closePreview() {
    if (preview?.objectUrl) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setPreviewError(null)
  }

  // Iframed contract page posts 'close-report-preview' when the user clicks
  // its Back to Reports button — close the modal from this side.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data && typeof e.data === 'object' && e.data.type === 'close-report-preview') {
        closePreview()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  // Invoice preview: generate the PDF against the current invoice state
  // (falling back to defaults derived from the claim when the user hasn't
  // opened the Invoice tab yet) and show the resulting blob in an iframe.
  async function previewInvoice() {
    setPreviewLoading('invoice')
    setPreviewError(null)
    try {
      const state = invoice ?? defaultInvoiceReportState(claim)
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
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Preview failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPreview({ title: 'Invoice', url, objectUrl: true })
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(null)
    }
  }

  // Cover letter preview: generate the PDF with claim-derived defaults and
  // the default "Appraisal" title, then iframe the resulting blob.
  async function previewCoverLetter() {
    setPreviewLoading('cover')
    setPreviewError(null)
    try {
      const d = new Date()
      const today = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
      const vehicle = [claim.year, claim.make, claim.model].filter(Boolean).join(' ')
      const dolMatch = claim.dateOfLoss?.match(/^(\d{4})-(\d{2})-(\d{2})/)
      const dol = dolMatch ? `${dolMatch[2]}/${dolMatch[3]}/${dolMatch[1]}` : (claim.dateOfLoss || '')
      const res = await fetch('/api/cover-letter/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            title: 'Appraisal',
            maNumber: claim.maNumber,
            date: today,
            claimNumber: claim.claimNumber,
            clientName: claim.clientName,
            insuredName: claim.insuredName,
            vehicle,
            vin: claim.vin,
            mileage: claim.mileage ? claim.mileage.toLocaleString('en-US') : '',
            dateOfLoss: dol,
          },
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Preview failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPreview({ title: 'Cover Letter', url, objectUrl: true })
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(null)
    }
  }

  // Invoice download: same payload as the preview, but save with the file picker.
  async function downloadInvoice() {
    setPreviewLoading('invoice-download')
    setPreviewError(null)
    const name = `${claim.maNumber || 'claim'}-invoice.pdf`
    try {
      await savePdfPickerFirst(
        name,
        async () => {
          const state = invoice ?? defaultInvoiceReportState(claim)
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
          if (!res.ok) throw new Error('Download failed')
          return res.blob()
        },
        async (blob, filename) => {
          await onDocumentSaved?.(blob, filename, 'invoice')
        },
      )
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setPreviewLoading(null)
    }
  }

  // Each row either has an `onEdit` (editable report) OR an `onDownload`
  // (static reference doc like the W-9) — the action-column renderer below
  // picks the right button based on which one is set.
  type Row = {
    key: string
    name: string
    description: string
    onPreview: () => void
    previewBusy: boolean
    onEdit?: () => void
    onDownload?: { href: string; filename: string }
  }
  const rows: Row[] = [
    {
      key: 'invoice',
      name: 'Invoice',
      description: claim.clientName
        ? `Appraisal fee billed to ${claim.clientName}`
        : 'Appraisal fee invoice',
      onPreview: previewInvoice,
      onEdit: onOpenInvoice,
      previewBusy: previewLoading === 'invoice',
    },
    {
      key: 'contract',
      name: 'ACV Modern Contract',
      description: claim.insuredName
        ? `Appraisal agreement for the owner, ${claim.insuredName}`
        : 'Appraisal agreement',
      onPreview: () => setPreview({
        title: 'ACV Modern Contract',
        url: `/claims/${claimId}/contract?embed=1&readonly=1`,
      }),
      // Edit opens the contract inline inside the workspace (like Invoice),
      // not as a modal — the parent calls setStep(20) via onOpenContract.
      onEdit: onOpenContract,
      previewBusy: false,
    },
    {
      key: 'cover',
      name: 'Cover Letter',
      description: claim.insuredName
        ? `Cover page for ${claim.insuredName}`
        : 'Cover page',
      onPreview: previewCoverLetter,
      onEdit: onOpenCoverLetter,
      previewBusy: previewLoading === 'cover',
    },
    {
      key: 'w9',
      name: 'Modern Appraisers W9',
      description: 'IRS Form W-9 — static reference, not editable',
      onPreview: () => setPreview({
        title: 'Modern Appraisers W9',
        url: '/companies/modern-appraisers/W9.pdf',
      }),
      onDownload: {
        href: '/companies/modern-appraisers/W9.pdf',
        filename: 'Modern Appraisers W9.pdf',
      },
      previewBusy: false,
    },
  ]

  return (
    <>
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black text-lg font-bold tracking-tight">Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_140px_200px] gap-4 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-200">
            <div>Document</div>
            <div>Last generated</div>
            <div className="text-right">Actions</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_140px_200px] gap-4 px-3 py-3 items-center border-b border-gray-100 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{row.name}</div>
                <div className="text-xs text-gray-500 truncate">{row.description}</div>
              </div>
              <div className="text-xs text-gray-500">—</div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={row.onPreview}
                  disabled={row.previewBusy}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {row.previewBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Preview
                </button>
                {row.onDownload ? (
                  <a
                    href={row.onDownload.href}
                    download={row.onDownload.filename}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-500 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={row.onEdit}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-500 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
          {previewError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {previewError}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="font-semibold text-gray-900">{preview.title}</div>
              <div className="flex items-center gap-2">
                {preview.title === 'Invoice' && (
                  <button
                    type="button"
                    onClick={downloadInvoice}
                    disabled={previewLoading === 'invoice-download'}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-500 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {previewLoading === 'invoice-download'
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Printer className="w-3 h-3" />}
                    Print Report
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePreview}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* For blob PDFs, append the fragment that suppresses the
                browser's built-in PDF chrome (toolbar / sidebar / scrollbar)
                — matches the Documents-tab preview style. */}
            <iframe
              src={preview.objectUrl ? `${preview.url}#toolbar=0&navpanes=0&scrollbar=0` : preview.url}
              className="flex-1 border-0 w-full"
              title={preview.title}
            />
          </div>
        </div>
      )}
    </>
  )
}
