import Link from 'next/link'
import Image from 'next/image'
import { LogoutButton } from '@/components/logout-button'

export default function RulesLawsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-white">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tool cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link href="/rules-laws/appraisal-clause" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-amber-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Appraisal Clause</h3>
              <p className="text-xs text-gray-400 mt-1">State-by-state appraisal laws</p>
            </div>
          </Link>
          <Link href="/rules-laws/diminished-value" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-amber-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Diminished Value</h3>
              <p className="text-xs text-gray-400 mt-1">DV laws, methodologies & court cases</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
