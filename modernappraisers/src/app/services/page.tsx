import Link from 'next/link'
import { Container } from '@/components/container'
import { SERVICES, iconFor, type Service } from '@/lib/services-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Services | Modern Appraisers' }

// Numbered-category list layout per Henry's 2026-10-18 mockup. Three
// categories (01/02/03) with large faded numerals on the left; each
// service renders as a lightweight row (small icon tile + title + right
// arrow) separated by thin dividers. No cards. No nested descriptions.
//
// Grouping is page-local — doesn't match the shared services-content.tsx
// categories, which the home page uses differently.

interface CategoryGroup {
  num: string
  title: string
  tagline: string
  slugs: string[]
}

const GROUPS: CategoryGroup[] = [
  {
    num: '01',
    title: 'Claim & Valuation Services',
    tagline: 'Accurate valuations. Fairer outcomes.',
    slugs: ['right-to-appraisal', 'acv', 'dv', 'full-appraisals'],
  },
  {
    num: '02',
    title: 'Dispute & Recovery Services',
    tagline: 'Challenges resolved. Value recovered.',
    slugs: ['cost-of-repair', 'loss-of-use', 'storage-charges', 'subrogation'],
  },
  {
    num: '03',
    title: 'Review & Support Services',
    tagline: 'Independent. Objective. Detailed.',
    slugs: ['umpire', 'desk-reviews'],
  },
]

const SERVICE_BY_SLUG: Record<string, Service> = Object.fromEntries(
  SERVICES.map(s => [s.slug, s]),
)

export default function ServicesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-10 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
              Services
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              A Complete Suite of Appraisal &amp; Dispute Services
            </h1>
            <p className="mt-6 sm:mt-8 text-base md:text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">
              From first notice to final resolution, we handle the complex details so you can focus on what matters. Select a category below to explore our full range of services.
            </p>
            <div className="mt-8 sm:mt-10 h-px w-full bg-[color:var(--color-border)]" />
          </div>
        </Container>
      </section>

      {/* Numbered category sections */}
      <section className="pb-14 sm:pb-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl space-y-14 sm:space-y-20">
            {GROUPS.map(group => (
              <CategoryGroup key={group.num} group={group} />
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">
              Have a claim for us?
            </h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Submit online in minutes. We follow up within one business day with next steps and a fee quote.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <a href="tel:+17023215930" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Call (702) 321-5930</a>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function CategoryGroup({ group }: { group: CategoryGroup }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-10">
      <div className="shrink-0">
        <div className="text-5xl sm:text-6xl md:text-7xl font-bold tabular-nums text-[color:var(--color-accent)]/40 leading-none">
          {group.num}
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">
          {group.title}
        </h2>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-ink-soft)]">
          {group.tagline}
        </p>

        <ul className="mt-8 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
          {group.slugs.map(slug => {
            const svc = SERVICE_BY_SLUG[slug]
            if (!svc) return null
            return <ServiceRow key={slug} service={svc} />
          })}
        </ul>
      </div>
    </div>
  )
}

function ServiceRow({ service }: { service: Service }) {
  return (
    <li>
      <Link
        href={service.href}
        className="group flex items-center gap-4 py-5 px-1 hover:px-3 transition-all"
      >
        <div className="shrink-0 w-9 h-9 rounded-sm border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 flex items-center justify-center text-[color:var(--color-accent)]">
          {iconFor(service.slug)}
        </div>
        <div className="min-w-0 flex-1 text-base text-[color:var(--color-ink)] group-hover:text-[color:var(--color-accent)] transition-colors">
          {service.title}
        </div>
        <svg
          viewBox="0 0 24 24"
          className="shrink-0 w-5 h-5 text-[color:var(--color-ink-soft)] group-hover:text-[color:var(--color-accent)] group-hover:translate-x-1 transition-all"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </li>
  )
}
