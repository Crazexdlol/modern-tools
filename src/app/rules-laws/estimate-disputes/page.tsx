import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { AppHeader } from '@/components/app-header'

// Placeholder page — research for Estimate Disputes hasn't started yet.
// Henry asked for the slot to exist so the Rules/Laws index has a
// visible home for it, but we're not building the data out here yet.

export default function EstimateDisputesPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/rules-laws" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Rules &amp; Laws
        </Link>
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-slate-100 text-slate-500 mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Estimate Disputes</h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Placeholder — the state-by-state framework for repair-estimate disputes is on the
            roadmap but hasn&apos;t been researched or populated yet. Content will land here once
            the ACV section is complete.
          </p>
        </div>
      </main>
    </div>
  )
}
