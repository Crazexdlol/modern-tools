import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About — Modern Appraisers', description: 'Independent carrier-side vehicle appraisers. 26 years of valuation work for insurance companies across all 50 states.' }

export default function AboutPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">About</p>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl">Independent carrier-side vehicle appraisers.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">
          Modern Appraisers has been doing vehicle-valuation work for insurance carriers since 1999 — ACV documentation, cost-of-repair reviews, appraisal-clause representation, subrogation support, salvage analysis, and expert testimony.
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 border-t border-[color:var(--color-border)] pt-16">
          <section>
            <h2 className="text-base font-semibold mb-3">Who we work with</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">First-party and third-party claims teams, adjusters, claims managers, SIU, and defense counsel. We work with carriers of every size — from regional mutuals to national brands.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">How we work</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">Market-based comparables, documented adjustments, and a methodology record on every report. Short-form desk reviews when speed matters; full appraisal packages when the file demands it.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">Our standards</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">ASE-certified appraisers, IAAA and NAADA membership, E&amp;O insured. Every report is built to hold up on file, in negotiation, and under cross-examination at appraisal or trial.</p>
          </section>
        </div>
      </Container>
    </main>
  )
}
