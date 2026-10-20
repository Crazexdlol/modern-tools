import Link from 'next/link'
import { Container } from '@/components/container'
import { CarriersMarquee } from '@/components/carriers-marquee'
import { HomeContactForm } from '@/components/home-contact-form'
import { SERVICES, iconFor } from '@/lib/services-content'

// Dark theme, carrier-only positioning. Section order:
//   1. Full-bleed hero car photo
//   2. What We Do — services teaser
//   3. Trusted across the industry — carriers marquee
//   4. Evaluation — value prop block
//   5. Small Contact Us CTA
// Google Reviews section pulled 2026-10-20 — restoring once the GBP is
// claimed + verified so the Places API returns the listing. Component
// kept in-tree at src/components/google-reviews.tsx.

export default function HomePage() {
  return (
    <main>
      {/* 1. Full-bleed hero. Car fills the viewport, text sits at the bottom
             over a dark gradient so it stays readable. */}
      <section
        className="relative min-h-[calc(100dvh-64px)] lg:min-h-[calc(100dvh-96px)] w-full flex items-end bg-cover bg-no-repeat bg-[position:45%_center] md:bg-center"
        style={{ backgroundImage: 'url(/car-hero.jpg)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--color-bg)] via-[color:var(--color-bg)]/70 to-transparent pointer-events-none" />

        <div className="relative w-full pb-10 sm:pb-16 md:pb-24">
          <Container>
            <div className="max-w-3xl">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
                Independent vehicle appraisers &middot; nationwide
              </p>
              <h1 className="text-[clamp(32px,8vw,72px)] leading-[1.05] font-bold text-[color:var(--color-ink)]">
                Independent appraisals that hold up.
              </h1>
              <div className="mt-6 sm:mt-8 flex items-center gap-3 flex-wrap">
                <Link
                  href="/services"
                  className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors"
                >
                  Our Services
                </Link>
                <Link
                  href="/submitaclaim"
                  className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors"
                >
                  Submit a Claim
                </Link>
              </div>
            </div>
          </Container>
        </div>

      </section>

      {/* 2. What We Do — services teaser (3 featured services). */}
      <section className="py-14 sm:py-20 md:py-24 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
              What we do
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[color:var(--color-ink)] leading-[1.1]">
              Independent appraisals, done right.
            </h2>
            <p className="mt-5 sm:mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Three of the most-requested valuation and dispute services. Explore the full suite to see everything we handle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {['acv', 'dv', 'cost-of-repair'].map(slug => {
              const s = SERVICES.find(sv => sv.slug === slug)
              if (!s) return null
              return <ServiceTeaserCard key={slug} service={s} />
            })}
          </div>

          <div className="mt-14 text-center">
            <Link
              href="/services"
              className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors"
            >
              Explore all services →
            </Link>
          </div>
        </Container>
      </section>

      {/* 3. Trusted across the industry — carriers marquee. */}
      <CarriersMarquee />

      {/* 4. Evaluation — value prop block. */}
      <section id="about" className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
              Evaluation
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[color:var(--color-ink)] leading-[1.1]">
              The preferred choice for every vehicle claim
            </h2>
            <p className="mt-5 text-lg sm:text-xl md:text-2xl font-semibold text-[color:var(--color-ink)]">
              <span className="text-[color:var(--color-accent)]">27+ years</span> of independent vehicle appraisal
            </p>
            <p className="mt-6 sm:mt-8 text-base leading-relaxed text-[color:var(--color-ink-muted)] max-w-3xl mx-auto">
              Modern Appraisers is an independent third-party appraisal firm. We provide documented, defensible valuations and dispute-resolution services for everyone involved in a vehicle claim, carriers, vehicle owners, attorneys, adjusters, and claims professionals. Our 27+ years of experience across every claim type make us a one-stop shop for appraisal-clause representation, ACV, Diminished Value, cost-of-repair disputes, umpire services, and more.
            </p>
          </div>
        </Container>
      </section>

      {/* 5. Inline Contact form at the bottom of the home page. Posts to
             /api/contact (Resend). The /contact page still exists for the
             dedicated-page experience. */}
      <section className="py-12 sm:py-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[color:var(--color-ink)] leading-tight">
                Have a claim or question?
              </h2>
              <p className="mt-3 text-sm text-[color:var(--color-ink-muted)]">
                Reach us directly at{' '}
                <a href="tel:+17023215930" className="font-semibold text-[color:var(--color-accent)] hover:underline">(702) 321-5930</a>{' '}
                or{' '}
                <a href="mailto:info@modernappraisers.com" className="font-semibold text-[color:var(--color-accent)] hover:underline">info@modernappraisers.com</a>,
                send a note below, or formally submit a claim.
              </p>
            </div>
            <HomeContactForm />
            <div className="mt-8 pt-8 border-t border-[color:var(--color-border)] text-center">
              <p className="text-sm text-[color:var(--color-ink-muted)] mb-4">
                Already know you need an appraisal? Skip the back-and-forth.
              </p>
              <Link
                href="/submitaclaim"
                className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors"
              >
                Submit a Claim
                <svg viewBox="0 0 24 24" className="w-4 h-4 ml-2" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
        </Container>
      </section>

    </main>
  )
}

// Home-page teaser card for the 3 featured services. Clean, larger
// treatment than the services-page row list.
function ServiceTeaserCard({ service }: { service: typeof SERVICES[number] }) {
  return (
    <Link
      href={service.href}
      className="group relative block bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-8 overflow-hidden hover:border-[color:var(--color-accent)] hover:-translate-y-1 transition-all duration-200"
    >
      <div className="w-14 h-14 rounded-sm bg-[color:var(--color-accent)]/10 border border-[color:var(--color-accent)]/40 flex items-center justify-center text-[color:var(--color-accent)] mb-6 group-hover:scale-105 transition-transform">
        {iconFor(service.slug)}
      </div>
      <h3 className="text-xl font-bold text-[color:var(--color-ink)] leading-tight">{service.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{service.shortPitch}</p>
      <div className="mt-6 inline-flex items-center text-sm font-semibold text-[color:var(--color-accent)]">
        Learn more
        <svg viewBox="0 0 24 24" className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </Link>
  )
}
