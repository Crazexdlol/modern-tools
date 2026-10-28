import type { Metadata } from 'next'
import { STATES } from '@/data/states/_index'
import { StateCard } from '@/components/states/state-card'

export const metadata: Metadata = {
  title: 'States We Serve — Independent Auto Appraisals Nationwide',
  description:
    'Modern Appraisers provides independent vehicle appraisal services across 48 US states. Browse state-specific appraisal information and submit a claim.',
  alternates: { canonical: '/states' },
}

export default function StatesDirectoryPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl md:text-4xl font-bold text-[color:var(--color-ink)]">States We Serve</h1>
      <p className="mt-3 text-[color:var(--color-ink-muted)] max-w-3xl">
        Modern Appraisers provides independent, documented vehicle appraisals and dispute-resolution services
        across 48 US states. Choose a state below for state-specific information and to submit a claim.
      </p>
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {STATES.map(s => <StateCard key={s.slug} state={s} />)}
      </div>
    </main>
  )
}
