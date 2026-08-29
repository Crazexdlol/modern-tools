"use client"

import Link from 'next/link'
import { FileText, Receipt, Printer } from 'lucide-react'

interface Props {
  onOpenInvoice: () => void
}

/**
 * Reports hub — the entry point Henry wants "next to Guidelines" that lists
 * every printable / fillable report available on a claim.
 *
 * Wired today:
 *  - Invoice → routes to the existing Invoice tab (step 12)
 *  - ACV Contract → downloads blank template
 *  - Certificate of Appraisal → downloads blank template
 *
 * Auto-fill from claim data for Contract + Certificate is TODO — the source
 * PDFs need their form fields mapped to claim fields (Contract has 47
 * auto-named fields; Certificate has none, needs form fields added).
 */
export function ReportsHubTab({ onOpenInvoice }: Props) {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="text-sm text-gray-500">
        Pick a report to fill and print. Invoice is fully auto-filled with claim data. Contract and Certificate open the blank templates for now — auto-fill coming soon.
      </div>

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
              <div className="text-xs text-gray-500 mt-1">Auto-filled from the Invoice tab. Click to open the builder.</div>
            </div>
          </div>
        </button>

        <ReportCard
          href="/acv-contract-template.pdf"
          icon={<FileText className="w-5 h-5" />}
          title="ACV Modern Contract"
          description="Modern Appraisers ACV service contract. Opens the blank template — fill in the browser or Acrobat, then print."
        />

        <ReportCard
          href="/certificate-of-appraisal-template.pdf"
          icon={<Printer className="w-5 h-5" />}
          title="Certificate of Appraisal"
          description="Final certificate of appraisal. Opens the blank template — fill in the browser or Acrobat, then print."
        />
      </div>
    </div>
  )
}

function ReportCard({
  href, icon, title, description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition-all group block"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 mt-1">{description}</div>
        </div>
      </div>
    </Link>
  )
}
