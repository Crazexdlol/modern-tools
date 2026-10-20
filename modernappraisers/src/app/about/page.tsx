import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About Us | Modern Appraisers' }

// Neutral / independent-firm positioning (Henry 2026-10-18).

export default function AboutPage() {
  return (
    <main>
      <section className="pt-12 sm:pt-20 pb-10 sm:pb-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">About Us</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Over 27 years of independent appraisal experience.
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Modern Appraisers is an independent third-party appraisal firm. We provide documented, defensible valuations and dispute-resolution services for everyone involved in a claim.
            </p>
            <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Our appraisers specialize in standard autos, motorcycles, trucks, trailers, RVs, buses, boats, classics, and exotics, if it has value, we document it. Reports are built to hold up on the claim, in negotiation, and under appraisal-clause and umpire proceedings, with comparables shown line-by-line and adjustments shown transparently.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            <AboutMetric value="50" label="States covered" copy="Nationwide service for claim assignments and remote appraisals in all 50 states." />
            <AboutMetric value="27+" label="Years of experience" copy="Combined independent vehicle appraisal experience across every claim type." />
            <AboutMetric value="9+" label="Vehicle types" copy="Standard Autos, Motorcycles, Trucks, Trailers, RVs, Buses, Boats, Classics, Exotics." />
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
                Our Team
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
                The people behind every report
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl mx-auto">
                A tight, hands-on team. Every claim gets a direct line to the person working it, not a ticketing queue.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <TeamMember name="Alex Aleksanyan"  title="Chief Executive Officer"           photo="/team/alex.jpg" />
              <TeamMember name="Henry Aleksanyan" title="Chief Operating Officer & Appraiser" photo="/team/henry.jpg" />
              <TeamMember name="Maeli Sotelo"     title="Office Manager"                    photo="/team/maeli.jpg" />
              <TeamMember name="Wendy Castro"     title="Office Manager"                    photo="/team/wendy.jpg" />
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Ready to assign a claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Independent documentation, fast turnarounds, and reports that hold up, whichever side of the claim you&apos;re on.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <Link href="/contact" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Contact Us</Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function AboutMetric({ value, label, copy }: { value: string; label: string; copy: string }) {
  return (
    <div>
      <div className="text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-accent)] tabular-nums leading-none">{value}</div>
      <div className="mt-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink)]">{label}</div>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{copy}</p>
    </div>
  )
}

function TeamMember({ name, title, photo }: { name: string; title: string; photo?: string }) {
  const initials = name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6 text-center">
      {photo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photo}
          alt={name}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          className="mx-auto w-24 h-24 rounded-full object-cover border border-[color:var(--color-border)] mb-4"
        />
      ) : (
        <div className="mx-auto w-24 h-24 rounded-full bg-[color:var(--color-bg-subtle)] border border-[color:var(--color-border)] flex items-center justify-center text-xl font-bold text-[color:var(--color-accent)] mb-4">
          {initials}
        </div>
      )}
      <div className="text-base font-bold text-[color:var(--color-ink)]">{name}</div>
      <div className="mt-1 text-sm text-[color:var(--color-ink-muted)] leading-snug">{title}</div>
    </div>
  )
}
