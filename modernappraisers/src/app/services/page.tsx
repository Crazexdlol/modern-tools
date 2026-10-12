import Link from 'next/link'
import { Container } from '@/components/container'
import { SERVICES, type ServiceContent } from '@/lib/services-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Services — Modern Appraisers' }

const CATEGORIES: { key: ServiceContent['category']; label: string; blurb: string }[] = [
  { key: 'valuation', label: 'Valuation',                  blurb: 'Market-based vehicle valuation for the file.' },
  { key: 'dispute',   label: 'Dispute Resolution',         blurb: 'Independent documentation when value or cost is in dispute.' },
  { key: 'loss',      label: 'Loss Management',            blurb: 'Fast reviews, subrogation support, and salvage analysis.' },
  { key: 'costs',     label: 'Vehicle-Related Costs',      blurb: 'Loss-of-use, towing, and storage documentation.' },
]

export default function ServicesPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Services</p>
        <h1 className="text-5xl font-bold tracking-tight max-w-3xl mb-6">Eleven services, one carrier-side firm.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl mb-16">Choose the service that matches your file, or submit a claim and we&apos;ll triage.</p>

        {CATEGORIES.map(cat => {
          const items = SERVICES.filter(s => s.category === cat.key)
          if (items.length === 0) return null
          return (
            <section key={cat.key} className="mb-16">
              <div className="mb-6 flex items-end justify-between gap-4 border-b border-[color:var(--color-border)] pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{cat.label}</h2>
                  <p className="text-sm text-[color:var(--color-ink-soft)] mt-1">{cat.blurb}</p>
                </div>
                <span className="text-xs text-[color:var(--color-ink-soft)] tabular-nums">{items.length} service{items.length === 1 ? '' : 's'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map(s => (
                  <Link key={s.slug} href={`/services/${s.slug}`} className="group block p-6 bg-white border border-[color:var(--color-border)] rounded-[10px] hover:border-[color:var(--color-ink)] transition-colors">
                    <h3 className="text-base font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{s.summary}</p>
                    <span className="mt-4 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Read more →</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </Container>
    </main>
  )
}
