import Link from 'next/link'
import type { StateContent } from '@/data/state-types'
import { STATES } from '@/data/states/_index'
import { StateHero } from './state-hero'
import { StateAttribution } from './state-attribution'

const SERVICES = [
  { href: '/actualcashvalue',  title: 'Actual Cash Value',       desc: 'Comparable-market valuations for total-loss settlements.' },
  { href: '/diminishedvalue',  title: 'Diminished Value',        desc: 'Post-repair value loss documented and defended.' },
  { href: '/costofrepair',     title: 'Cost of Repair Disputes', desc: 'Independent review of estimates and supplements.' },
  { href: '/righttoappraisal', title: 'Appraisal Clause',        desc: 'Appraiser and umpire services for policy appraisal provisions.' },
  { href: '/lossofuse',        title: 'Loss of Use',             desc: 'Documented rental and loss-of-use valuations.' },
  { href: '/storage',          title: 'Storage',                 desc: 'Reasonable storage-charge documentation and review.' },
]

export function StatePage({ state }: { state: StateContent }) {
  const nameBySlug = new Map(STATES.map(s => [s.slug, s.name]))
  const related = state.relatedStates
    .filter(slug => nameBySlug.has(slug))     // drops MA/RI (never in index) + any typo
    .slice(0, 6)

  return (
    <article>
      <StateHero state={state} />
      <StateAttribution image={state.heroImage} />

      <section className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-lg text-[color:var(--color-ink)] leading-relaxed">{state.intro}</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold text-[color:var(--color-ink)] mb-6">Our Services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-lg border border-white/10 hover:border-[color:var(--color-accent)] p-5 transition-colors bg-[color:var(--color-bg-elevated)]"
            >
              <div className="font-semibold text-[color:var(--color-ink)]">{s.title}</div>
              <div className="text-sm text-[color:var(--color-ink-muted)] mt-1">{s.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-[color:var(--color-ink)] mb-6">Related States</h2>
          <div className="flex flex-wrap gap-3">
            {related.map(slug => (
              <Link
                key={slug}
                href={`/states/${slug}`}
                className="inline-block px-4 py-2 rounded-md border border-white/10 hover:border-[color:var(--color-accent)] bg-[color:var(--color-bg-elevated)] text-sm text-[color:var(--color-ink)]"
              >
                {nameBySlug.get(slug)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[color:var(--color-bg-subtle)] text-white py-16 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Need an appraisal in {state.name}?</h2>
          <p className="mt-3 text-white/80 max-w-2xl mx-auto">
            Reach out to our team for a documented, defensible appraisal that stands up to scrutiny.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/submitaclaim" className="inline-block bg-[color:var(--color-accent)] hover:brightness-110 font-semibold px-6 py-3 rounded-md">
              Submit a Claim
            </Link>
            <Link href="/contact" className="inline-block border border-white/40 hover:border-white font-semibold px-6 py-3 rounded-md">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </article>
  )
}
