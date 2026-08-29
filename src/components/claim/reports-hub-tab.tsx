"use client"

import Link from 'next/link'
import { FileText, Receipt, Printer } from 'lucide-react'

interface Props {
  claimId: string
  onOpenInvoice: () => void
}

export function ReportsHubTab({ claimId, onOpenInvoice }: Props) {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onOpenInvoice}
          className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900">Invoice</div>
            </div>
          </div>
        </button>

        <Link
          href={`/claims/${claimId}/contract`}
          className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all group block"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900">ACV Modern Contract</div>
            </div>
          </div>
        </Link>

        <Link
          href="/certificate-of-appraisal-template.pdf"
          target="_blank"
          rel="noopener"
          className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all group block"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900">Certificate of Appraisal</div>
              <div className="text-xs text-gray-400 mt-1">Fill flow coming once the PDF has form fields added</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
