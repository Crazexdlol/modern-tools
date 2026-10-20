import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

// Settings grouped by claim-workspace tool. Each entry maps to a route under
// /admin/settings/tools/<slug>. When adding a new tool-level setting (not a
// workspace-wide setting like Fee Catalog or Users), create a new entry here
// + a matching page at /admin/settings/tools/<slug>/page.tsx.
const TOOLS: { slug: string; label: string; description: string; configured: boolean }[] = [
  { slug: 'acv-report',       label: 'ACV Report',       description: 'Market comp sourcing + valuation rules.',                  configured: false },
  { slug: 'award',            label: 'Award',            description: 'Default award language, signature blocks.',                configured: false },
  { slug: 'closing-notes',    label: 'Closing Notes',    description: 'Templates and auto-fill behavior.',                        configured: false },
  { slug: 'cover-letter',     label: 'Cover Letter',     description: 'Template PDF, signatures, company header.',                configured: false },
  { slug: 'diminished-value', label: 'Diminished Value', description: 'Template selection, state-specific DV rules.',             configured: false },
  { slug: 'documents',        label: 'Documents',        description: 'Allowed file types, retention, bucket config.',            configured: false },
  { slug: 'estimate-dispute', label: 'Estimate Dispute', description: 'State Tax Rules — how sales tax is calculated per state.', configured: true },
  { slug: 'invoice',          label: 'Invoice',          description: 'Line-item defaults, template variant thresholds.',         configured: false },
  { slug: 'loss-of-use',      label: 'Loss of Use',      description: 'HOURS vs DAYS defaults, weekend handling.',                configured: false },
  { slug: 'summary',          label: 'Summary',          description: 'Field visibility, label overrides.',                       configured: false },
]

export default function AdminSettingsToolsPage() {
  return (
    <div>
      <h1 className="hp-display mb-6">Tool Settings</h1>
      <p className="text-sm text-gray-600 mb-6 max-w-2xl">
        Settings specific to a single tool in the claim workspace. Pick a tool below to see its configuration.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
        {TOOLS.map((t) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                {t.configured ? (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                    Configurable
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                    No settings yet
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">{t.description}</div>
              {t.configured && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                  Open settings <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </>
          )
          return t.configured ? (
            <Link
              key={t.slug}
              href={`/admin/settings/tools/${t.slug}`}
              className="block p-3 rounded-md border border-gray-200 bg-white shadow-sm hover:border-blue-300 hover:shadow transition-all"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={t.slug}
              className="block p-3 rounded-md border border-gray-200 bg-gray-50/60 opacity-70"
              title="No admin-configurable settings for this tool yet"
            >
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
