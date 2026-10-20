import Link from 'next/link'
import { FileText, ChevronRight, Download } from 'lucide-react'
import { AppHeader } from '@/components/app-header'

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="hp-display mb-6">Reports</h1>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            href="/reports/invoice"
            className="hp-card px-4 py-4 flex items-center gap-3 transition-colors hover:border-slate-300 group"
          >
            <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-700">
              <FileText className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-slate-900">Invoice</div>
              <div className="text-[12px] text-slate-500">Standalone invoice builder</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </Link>

          {/* Static downloadable W-9 for Modern Appraisers. Not editable —
              the `download` attribute pins the save-as filename so the
              recipient's folder has the branded name. */}
          <a
            href="/companies/modern-appraisers/W9.pdf"
            download="Modern Appraisers W9.pdf"
            className="hp-card px-4 py-4 flex items-center gap-3 transition-colors hover:border-slate-300 group"
          >
            <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-700">
              <FileText className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-slate-900">Modern Appraisers W9</div>
              <div className="text-[12px] text-slate-500">IRS Form W-9 — download</div>
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </a>
        </div>
      </main>
    </div>
  )
}
