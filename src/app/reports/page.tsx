import Link from 'next/link'
import { AppHeader } from '@/components/app-header'

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports</h1>
        <p className="text-sm text-gray-500 mb-6">Fill out a report by hand and download it — not tied to any claim. For a claim-specific invoice, use the Reports tab inside that claim instead.</p>

        <div className="grid grid-cols-2 gap-4">
          <Link href="/reports/invoice" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-blue-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Invoice</h3>
              <p className="text-xs text-gray-400 mt-1">Fill out and download a Modern Appraisers invoice</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
