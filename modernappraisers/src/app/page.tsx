import Link from 'next/link'
import { Container } from '@/components/container'

export default function HomePage() {
  return (
    <main>
      {/* Hero — single-column, text-forward */}
      <section className="pt-20 pb-24 border-b border-[color:var(--color-border)] relative overflow-hidden">
        {/* Subtle background wash — single corner accent, nothing busy */}
        <div className="absolute top-0 right-0 w-[640px] h-[640px] rounded-full blur-3xl opacity-20 pointer-events-none -translate-y-1/3 translate-x-1/3"
             style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.45) 0%, rgba(255,255,255,0) 70%)' }} />
        <Container>
          <div className="relative max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Carrier-side independent appraisers · Est. 1999 · 50 states</p>
            <h1 className="text-[clamp(44px,7vw,88px)] leading-[1.02] tracking-[-0.035em] font-bold text-[color:var(--color-ink)]">
              Independent appraisals<br/>
              <span className="text-[color:var(--color-accent)]">built for insurance carriers.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-xl leading-relaxed text-[color:var(--color-ink-muted)]">
              Twenty-six years of vehicle-valuation work for the carrier side — ACV documentation, cost-of-repair reviews, appraisal-clause representation, salvage, subrogation support, and expert testimony. Delivered on your timeline.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link href="/submit" className="inline-flex items-center h-12 px-7 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim →</Link>
              <Link href="/services" className="inline-flex items-center h-12 px-6 rounded-md border border-[color:var(--color-border-strong)] text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]">Our services</Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-[color:var(--color-ink-soft)] flex-wrap">
              <span className="flex items-center gap-2"><Dot /> IAAA &amp; NAADA member</span>
              <span className="flex items-center gap-2"><Dot /> ASE-certified appraisers</span>
              <span className="flex items-center gap-2"><Dot /> E&amp;O insured</span>
            </div>
          </div>

          <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-[color:var(--color-border)] pt-10">
            <Stat value="26 yrs" label="In the field" />
            <Stat value="4,200+" label="Claims handled" />
            <Stat value="50" label="States covered" />
            <Stat value="3–5 days" label="Typical report turnaround" />
          </div>
        </Container>
      </section>

      {/* What we deliver — carrier-focused service categories */}
      <section className="py-24 bg-[color:var(--color-bg-subtle)] border-b border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-4">What we deliver</p>
            <h2 className="text-4xl font-bold tracking-tight">Independent documentation for every stage of the claim.</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Eleven valuation and claim-support services, all under one roof. Request the work your file needs and skip the vendor shuffle.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <CategoryCard
              title="Valuation"
              bullets={['Actual Cash Value', 'Diminished Value', 'Full Appraisal']}
              href="/services"
            />
            <CategoryCard
              title="Dispute Resolution"
              bullets={['Cost of Repair Dispute', 'Appraisal Clause', 'Expert Witness']}
              href="/services"
            />
            <CategoryCard
              title="Loss Management"
              bullets={['Desk Reviews', 'Subrogation', 'Salvage Bids']}
              href="/services"
            />
            <CategoryCard
              title="Vehicle-Related Costs"
              bullets={['Loss of Use', 'Towing & Storage Charges']}
              href="/services"
            />
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="py-24 border-b border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-4">How it works</p>
            <h2 className="text-4xl font-bold tracking-tight">A clear process, start to finish.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step num="01" title="Assign"       copy="Submit the file online in under three minutes. Attach documents and we triage within one business day." />
            <Step num="02" title="Review"       copy="We pull comparable market data, apply mileage and condition adjustments, and build the valuation or review." />
            <Step num="03" title="Final report" copy="You receive the completed report in 3–5 business days — formatted for file, negotiation, or appraisal-clause proceedings." />
          </div>
        </Container>
      </section>

      {/* Services highlight */}
      <section className="py-24 border-b border-[color:var(--color-border)]">
        <Container>
          <div className="flex items-end justify-between flex-wrap gap-6 mb-14">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-4">Core services</p>
              <h2 className="text-4xl font-bold tracking-tight">The four most-requested.</h2>
            </div>
            <Link href="/services" className="text-sm font-semibold text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">All 11 services →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <ServiceCard title="Actual Cash Value"      copy="Market-value documentation for total-loss files."       href="/services/acv"                       image="https://images.unsplash.com/photo-1549924231-f129b911e442?w=800&q=80&auto=format&fit=crop" />
            <ServiceCard title="Diminished Value"       copy="Post-repair resale-value analysis."                     href="/services/diminished-value"          image="https://images.unsplash.com/photo-1588636142475-a62d56692870?w=800&q=80&auto=format&fit=crop" />
            <ServiceCard title="Cost of Repair Dispute" copy="Line-by-line estimate review."                           href="/services/cost-of-repair-dispute"    image="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80&auto=format&fit=crop" />
            <ServiceCard title="Appraisal Clause"       copy="Third-party valuation under the policy clause."         href="/services/appraisal-clause"          image="https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&q=80&auto=format&fit=crop" />
          </div>
        </Container>
      </section>

      {/* Trust band — dark */}
      <section className="py-24 bg-[color:var(--color-ink)] text-white">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400 mb-4">Why carriers retain us</p>
              <h2 className="text-4xl font-bold tracking-tight">A valuation only holds up if the work behind it does.</h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-300 max-w-xl">
                Every report we deliver includes the comparables, the adjustments, and the methodology — not just a bottom-line figure. Our reports are built to hold up on the file, in negotiation, and at appraisal.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <TrustCard label="Comparables documented" value="Line-by-line" />
              <TrustCard label="Adjustments shown" value="Transparently" />
              <TrustCard label="Report turnaround" value="3–5 days" />
              <TrustCard label="Jurisdictions" value="All 50 states" />
            </div>
          </div>
        </Container>
      </section>

      {/* Testimonials — carrier side only */}
      <section className="py-24 border-b border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-4">What claims teams say</p>
            <h2 className="text-4xl font-bold tracking-tight">Trusted by adjusters, claims managers, and SIU teams.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Testimonial
              quote="Clear comparables, clear math, and a report I can put straight on the file. That is all I need from an independent appraiser."
              name="J. Patel"
              role="Senior Claims Adjuster · Mutual Specialty Ins."
            />
            <Testimonial
              quote="Professional team, prompt turnaround, and reports that hold up under scrutiny. Our go-to for appraisal-clause work."
              name="D. Alvarez"
              role="Claims Manager · Pacific National"
            />
            <Testimonial
              quote="Thorough file documentation and consistent methodology. Easy to defend in negotiation and at arbitration."
              name="R. Nguyen"
              role="SIU Investigator · Northwest Mutual"
            />
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <Container>
          <div className="bg-[color:var(--color-bg-subtle)] border border-[color:var(--color-border)] rounded-[14px] p-12 lg:p-16">
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 items-center">
              <div>
                <h2 className="text-4xl font-bold tracking-tight">Have a file for us?</h2>
                <p className="mt-4 text-lg text-[color:var(--color-ink-muted)] max-w-xl">Assign online in under three minutes. We follow up within one business day with next steps and a fee quote.</p>
              </div>
              <div className="flex items-center gap-3 lg:justify-end flex-wrap">
                <Link href="/submit" className="inline-flex items-center h-12 px-7 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim</Link>
                <Link href="/contact" className="inline-flex items-center h-12 px-6 rounded-md border border-[color:var(--color-border-strong)] text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]">Call us</Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Dot() { return <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--color-accent)]" /> }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[clamp(28px,3vw,40px)] font-bold tracking-tight tabular-nums leading-none">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)]">{label}</div>
    </div>
  )
}

function CategoryCard({ title, bullets, href }: { title: string; bullets: string[]; href: string }) {
  return (
    <Link href={href} className="group block bg-white border border-[color:var(--color-border)] rounded-[12px] p-6 hover:border-[color:var(--color-ink)] transition-colors">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="mt-4 space-y-1.5 text-sm text-[color:var(--color-ink-muted)]">
        {bullets.map(b => <li key={b} className="flex gap-2"><span className="text-[color:var(--color-ink-soft)]">·</span><span>{b}</span></li>)}
      </ul>
      <span className="mt-5 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Explore →</span>
    </Link>
  )
}

function Step({ num, title, copy }: { num: string; title: string; copy: string }) {
  return (
    <div>
      <div className="text-5xl font-bold tracking-tight text-[color:var(--color-border-strong)] mb-4 tabular-nums">{num}</div>
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{copy}</p>
    </div>
  )
}

function ServiceCard({ title, copy, href, image }: { title: string; copy: string; href: string; image: string }) {
  return (
    <Link href={href} className="group block bg-white border border-[color:var(--color-border)] rounded-[12px] overflow-hidden hover:border-[color:var(--color-ink)] transition-colors">
      <div className="aspect-[16/10] overflow-hidden bg-[color:var(--color-bg-subtle)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </div>
      <div className="p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{copy}</p>
        <span className="mt-3 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Learn more →</span>
      </div>
    </Link>
  )
}

function TrustCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[10px] p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-bold tracking-tight">{value}</div>
    </div>
  )
}

function Testimonial({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <blockquote className="bg-white border border-[color:var(--color-border)] rounded-[12px] p-6">
      <p className="text-sm leading-relaxed text-[color:var(--color-ink)]">&ldquo;{quote}&rdquo;</p>
      <footer className="mt-5 pt-5 border-t border-[color:var(--color-border)]">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-xs text-[color:var(--color-ink-soft)] mt-0.5">{role}</div>
      </footer>
    </blockquote>
  )
}
