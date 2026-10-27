import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About | Independent Vehicle Appraisal Firm | Modern Appraisers',
  description:
    'Modern Appraisers is an independent, third-party vehicle appraisal firm serving carriers, vehicle owners, attorneys, and claims professionals in all 50 states. 27+ years of experience across ACV, diminished value, cost of repair, loss of use, storage charges, right to appraisal, and umpire services.',
}

// SEO-focused About page (Henry 2026-10-22). Keyword-rich H1 and
// section headers; adds service overview, audience, independence,
// and geographic-coverage sections to broaden on-page content.

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-12 sm:pt-20 pb-10 sm:pb-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">About Us</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Independent Vehicle Appraisers for ACV, Diminished Value, and Appraisal-Clause Disputes.
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Modern Appraisers is an independent, third-party vehicle appraisal firm serving insurance carriers, vehicle owners, attorneys, and claims professionals in all 50 states. We handle the full range of claim valuation and dispute work: total-loss ACV and diminished-value demands, cost-of-repair disagreements, loss-of-use and storage charges, right-to-appraisal filings, and neutral umpire decisions when the two sides deadlock.
            </p>
            <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Our appraisers cover every vehicle class, standard autos, commercial trucks, trailers, motorcycles, RVs, buses, marine vessels, classics, and exotics. Every report is built the same way: comparable listings shown line by line, adjustments shown transparently, methodology documented so the number holds up through negotiation, mediation, appraisal-clause proceedings, and umpire review.
            </p>
          </div>
        </Container>
      </section>

      {/* Metrics */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            <AboutMetric value="50" label="States covered" copy="Nationwide service for claim assignments and remote appraisals in all 50 states." />
            <AboutMetric value="27+" label="Years of experience" copy="Combined independent vehicle appraisal experience across every claim type." />
            <AboutMetric value="9+" label="Vehicle types" copy="Standard Autos, Motorcycles, Trucks, Trailers, RVs, Buses, Boats, Classics, Exotics." />
          </div>
        </Container>
      </section>

      {/* What we handle */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl mb-10 sm:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Core Services</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
                What we handle on a claim.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
                Six overlapping disputes make up most of the claim-valuation work we see. Each is a dedicated discipline with its own methodology, documentation standard, and procedural rules.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <ServiceCard
                title="Actual Cash Value (ACV) Appraisals"
                body="Total-loss valuations supported by live market comparables, condition adjustments, mileage-rate math, and jurisdiction-specific tax and fee rules."
                href="/actualcashvalue"
              />
              <ServiceCard
                title="Diminished Value (DV) Appraisals"
                body="Post-repair loss-in-value documentation for first- and third-party claims, written to the standard your state's courts and carriers actually accept."
                href="/diminishedvalue"
              />
              <ServiceCard
                title="Cost of Repair Disputes"
                body="Line-item review of insurer estimates when operations, labor rates, or part sourcing understate what a proper repair actually requires."
                href="/costofrepair"
              />
              <ServiceCard
                title="Loss of Use Claims"
                body="Rental and comparable-replacement coverage analysis when the carrier won't pay reasonable costs during the repair or settlement window."
                href="/lossofuse"
              />
              <ServiceCard
                title="Storage Charges"
                body="Reasonable-and-customary analysis for salvage yards, body shops, and tow operators disputing storage, administrative, and release fees."
                href="/storage"
              />
              <ServiceCard
                title="Right to Appraisal & Umpire"
                body="End-to-end appraisal-clause management, invocation, appraiser briefing, meeting coordination, and umpire proceedings when the two appraisers deadlock."
                href="/righttoappraisal"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Who we work with */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl mb-10 sm:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Clients</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
                Who we work with.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
                The audience shifts, the standard doesn&apos;t. Every report has to withstand the same scrutiny whichever side of the file we were hired on.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <AudienceCard
                title="Insurance Carriers"
                body="Independent assignments, second-look valuations, and desk-review support when a file benefits from outside documentation. We work with carrier panels, TPAs, and in-house claim teams nationwide."
              />
              <AudienceCard
                title="Vehicle Owners"
                body="First-party appraisals when your own insurer's total-loss offer or repair estimate doesn't reflect what the vehicle actually is. We invoke the appraisal clause on your behalf and run the full process end to end."
              />
              <AudienceCard
                title="Attorneys & Law Firms"
                body="Expert documentation for litigation, mediation, bad-faith suits, and appraisal-clause filings. Reports written with the deposition and the courtroom in mind."
              />
              <AudienceCard
                title="Adjusters, Body Shops & Fleet Managers"
                body="Defensible valuations delivered on commercial timelines for the professionals who move claims daily, independent adjusters, repair facilities, dealership service writers, and commercial fleet operators."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Why independent */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <div className="max-w-2xl mb-10 sm:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Our Approach</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
                Why independent matters.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
                A carrier-staff appraiser answers to a loss ratio. An independent third-party appraiser answers to the file. That distinction decides whether the number holds up when it&apos;s challenged.
              </p>
            </div>
            <div className="space-y-10 sm:space-y-14">
              <WhyPoint
                num="01"
                title="No carrier affiliation."
                body="We don't take assignments that compromise independence, don't share financial interests with insurers or body shops, and don't tune methodology to a particular outcome. The valuation reflects the evidence, not the party that paid the invoice."
              />
              <WhyPoint
                num="02"
                title="Transparent methodology."
                body="Every comparable is shown. Every adjustment is explained. If a carrier or an owner wants to challenge a line, they can see exactly which listings were used, what each adjustment was for, and how the final number was reached."
              />
              <WhyPoint
                num="03"
                title="Built to survive scrutiny."
                body="Reports are drafted knowing they may be read by umpires, judges, mediators, and opposing counsel. Exhibits, citations, and jurisdiction-specific references assume adversarial review, not a friendly desk read."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Where we serve */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Coverage</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
              Las Vegas base. 50-state reach.
            </h2>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Modern Appraisers is headquartered in Las Vegas, Nevada, and licensed where state licensure applies. We handle onsite inspections across the Southwest, Southern California, Arizona, Utah, and Nevada, and remote appraisals across the United States, from single-owner first-party claims to multi-state carrier assignments. If the file needs a physical inspection, we coordinate with the storage facility, body shop, or inspection location directly. If the file is remote-ready, we work from photos, repair estimates, and claim documentation.
            </p>
            <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              We regularly handle claims in Nevada, California, Arizona, Utah, Texas, Florida, Washington, Oregon, Colorado, Georgia, and the Pacific Northwest, and the firm accepts assignments in every state. Jurisdiction-specific statutes, policy language, and appraisal-clause rules are researched on every file, because the right answer in one state is often the wrong one in another.
            </p>
          </div>
        </Container>
      </section>

      {/* Team */}
      <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
                Our Team
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.1]">
                The people behind every report.
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

      {/* CTA */}
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

function ServiceCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="group block bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6 hover:border-[color:var(--color-accent)] transition-colors"
    >
      <h3 className="text-lg font-bold text-[color:var(--color-ink)] group-hover:text-[color:var(--color-accent)] transition-colors leading-snug">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
        Learn more →
      </div>
    </Link>
  )
}

function AudienceCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6 sm:p-7">
      <h3 className="text-lg sm:text-xl font-bold text-[color:var(--color-ink)] leading-snug">{title}</h3>
      <p className="mt-3 text-sm sm:text-base leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function WhyPoint({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 md:gap-8 items-start">
      <div className="text-5xl sm:text-6xl font-bold tabular-nums text-[color:var(--color-accent)]/40 leading-none">{num}</div>
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-[color:var(--color-ink)] leading-snug">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
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
