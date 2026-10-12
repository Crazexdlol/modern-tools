import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Container } from '@/components/container'
import { SERVICES } from '@/lib/services-content'
import type { Metadata } from 'next'

export async function generateStaticParams() { return SERVICES.map(s => ({ slug: s.slug })) }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const s = SERVICES.find(x => x.slug === slug)
  if (!s) return { title: 'Service — Modern Appraisers' }
  return { title: `${s.title} — Modern Appraisers`, description: s.summary }
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const s = SERVICES.find(x => x.slug === slug)
  if (!s) notFound()

  return (
    <main className="py-20">
      <Container>
        <Link href="/services" className="text-sm text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">← All services</Link>
        <h1 className="mt-6 text-5xl font-bold tracking-tight max-w-3xl">{s.title}</h1>
        <p className="mt-6 text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">{s.summary}</p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-[color:var(--color-border)] pt-16">
          <section>
            <h2 className="text-base font-semibold mb-4">When you&apos;d use this</h2>
            <ul className="space-y-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
              {s.whenYouNeedIt.map((item, i) => <li key={i} className="flex gap-3"><span className="text-[color:var(--color-ink-soft)] mt-[2px]">·</span><span>{item}</span></li>)}
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-4">How it works</h2>
            <ol className="space-y-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
              {s.howItWorks.map((item, i) => <li key={i} className="flex gap-3"><span className="text-[color:var(--color-ink-soft)] mt-[2px] tabular-nums">{i + 1}.</span><span>{item}</span></li>)}
            </ol>
          </section>
        </div>

        <div className="mt-16">
          <Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim →</Link>
        </div>
      </Container>
    </main>
  )
}
