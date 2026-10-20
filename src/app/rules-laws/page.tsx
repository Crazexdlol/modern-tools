import Link from 'next/link'
import { ChevronRight, Scale, TrendingDown, Receipt, FileText } from 'lucide-react'
import { AppHeader } from '@/components/app-header'

interface RLCard {
  href: string
  label: string
  description: string
  Icon: typeof Scale
  status?: 'live' | 'in_progress' | 'placeholder'
}

const CARDS: RLCard[] = [
  {
    href: '/rules-laws/appraisal-clause',
    label: 'Appraisal Clause',
    description: 'State-by-state appraisal clause statutes, process, timeframes, binding effect.',
    Icon: Scale,
    status: 'live',
  },
  {
    href: '/rules-laws/acv',
    label: 'ACV',
    description: 'Licensing + methodology (comparables, book values, mileage/distance caps, timeframes) per state.',
    Icon: Receipt,
    status: 'in_progress',
  },
  {
    href: '/rules-laws/diminished-value',
    label: 'Diminished Value',
    description: 'DV laws, methodologies, and leading court cases per state.',
    Icon: TrendingDown,
    status: 'live',
  },
  {
    href: '/rules-laws/estimate-disputes',
    label: 'Estimate Disputes',
    description: 'Repair estimate dispute framework — placeholder, research pending.',
    Icon: FileText,
    status: 'placeholder',
  },
]

const STATUS_BADGE: Record<NonNullable<RLCard['status']>, { label: string; cls: string }> = {
  live:         { label: 'Live',        cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  in_progress:  { label: 'In progress', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  placeholder:  { label: 'Coming soon', cls: 'bg-slate-100 border-slate-200 text-slate-500' },
}

export default function RulesLawsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="hp-display">Rules &amp; Laws</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            State-by-state reference material. Not legal advice — verify anything load-bearing
            against the cited statute / regulation before relying on it in a case.
          </p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CARDS.map(c => {
            const badge = c.status ? STATUS_BADGE[c.status] : null
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  className="group block bg-white border border-slate-200 rounded-lg px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-700">
                      <c.Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[15px] font-semibold text-slate-900">{c.label}</div>
                        {badge && (
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-slate-500 mt-1 leading-snug">{c.description}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors mt-1" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
