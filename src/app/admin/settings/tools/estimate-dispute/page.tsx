import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { StateTaxRulesClient } from '@/app/admin/settings/state-tax-rules/state-tax-rules-client'

export default function AdminSettingsToolsEstimateDisputePage() {
  return (
    <div>
      <Link
        href="/admin/settings/tools"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Tool Settings
      </Link>
      <h1 className="hp-display mb-1">Estimate Dispute</h1>
      <p className="text-sm text-gray-600 mb-6 max-w-2xl">
        Tool-specific settings for the Estimate Dispute workspace.
      </p>

      <section className="space-y-3">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">State Tax Rules</h2>
        <StateTaxRulesClient />
      </section>
    </div>
  )
}
