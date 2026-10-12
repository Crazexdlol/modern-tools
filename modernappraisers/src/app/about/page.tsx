import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About — Modern Appraisers', description: 'Independent appraisers who work for vehicle owners, not insurance companies. 26 years in the field.' }

export default function AboutPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">About</p>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl">Independent appraisers who work for you.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">
          Modern Appraisers has been resolving vehicle valuation disputes since 1999 — advocating for the actual market value of your vehicle, not the number the insurance company&apos;s internal appraiser landed on.
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 border-t border-[color:var(--color-border)] pt-16">
          <section>
            <h2 className="text-base font-semibold mb-3">What &quot;independent&quot; means</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">We&apos;re paid by the vehicle owner — not the insurer. Our only interest is in documenting the real value of your car.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">How we work</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">Comparable-sales research, documented repair cost analysis, and when necessary a third-party appraisal under your policy&apos;s appraisal clause.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">Who we help</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">Vehicle owners facing low total-loss offers, undervalued post-repair claims, or denied diminished-value requests. All vehicle types — from daily drivers to exotics.</p>
          </section>
        </div>
      </Container>
    </main>
  )
}
