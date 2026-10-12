import Link from 'next/link'
import { Container } from '@/components/container'
import { SERVICES } from '@/lib/services-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Services — Modern Appraisers' }

export default function ServicesPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Services</p>
        <h1 className="text-5xl font-bold tracking-tight max-w-3xl mb-6">Five ways we recover value for you.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl mb-12">Every claim is different. These are the five services we offer — pick the one that matches your situation, or submit a claim and we&apos;ll triage.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SERVICES.map(s => (
            <Link key={s.slug} href={`/services/${s.slug}`} className="group block p-6 bg-white border border-[color:var(--color-border)] rounded-[10px] hover:border-[color:var(--color-ink)] transition-colors">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{s.summary}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Read more →</span>
            </Link>
          ))}
        </div>
      </Container>
    </main>
  )
}
