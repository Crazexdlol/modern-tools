import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import { LossOfUseFaqSection } from '@/components/loss-of-use-faq-section'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loss of Use | Modern Appraisers' }

export default function LossOfUsePage() {
  return (
    <main>
      <Container>
        <BackLink />
      </Container>
      {/* Hero */}
      <section className="pt-10 sm:pt-20 pb-10 sm:pb-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
              Loss & Recovery Costs
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.02]">
              Loss of Use
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              <strong>Loss of use</strong> compensates the vehicle owner for being deprived of their vehicle during repair or (on a total loss) during the time it takes to replace it. Compensable even when rental reimbursement coverage isn&apos;t carried, and often recoverable without an actual rental having been incurred.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <Link href="/contact" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Contact Us</Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Rental coverage vs. loss of use */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Rental reimbursement vs. loss of use</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              These are two different things and often confused.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
              <ConceptCard
                title="Rental reimbursement coverage"
                body="A first-party policy benefit, an optional endorsement on your own auto policy. Typically capped at $30 to $75/day with a $900 to $1,500 total limit. Pays actual rental expense only."
              />
              <ConceptCard
                title="Loss of use damages"
                body="A measure of damages owed by the at-fault party (third-party claim). Not capped by any policy benefit. Based on reasonable rental market value of a comparable vehicle. In most states, recoverable even if no rental was actually incurred ('hypothetical rental value')."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Jurisdictional split */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Jurisdictional split, hypothetical vs. actual rental</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              States diverge sharply on whether an actual rental must be incurred to recover loss of use.
            </p>
            <div className="mt-8 space-y-4">
              <JurBox
                title="Hypothetical rental allowed (majority)"
                body="California, Colorado, Texas, and most other states allow loss of use based on the reasonable rental value of a substitute vehicle, whether or not one was actually rented. For commercial vehicles, this extends to lost profits when no substitute was available for rent."
              />
              <JurBox
                title="Actual rental required (minority)"
                body="New York (Third Appellate Department) refuses commercial loss-of-use awards when no substitute has actually been rented, a strict outlier. Confirm current law at engagement."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Calculation methods */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Four calculation methods</h2>
            <div className="mt-10 space-y-5">
              <CalcBox num="01" name="Actual rental cost paid" body="If a rental was procured, actual receipts for a comparable class vehicle." />
              <CalcBox num="02" name="Reasonable hypothetical rental" body="Market rate for a comparable-class rental in the local area, applied to the deprivation period. The dominant method in most jurisdictions." />
              <CalcBox num="03" name="Daily depreciation / finance proxy" body="0.33 to 0.5% of vehicle ACV per day (e.g., $30k ACV × 0.5% = $150/day). Occasional alternative; less common." />
              <CalcBox num="04" name="Commercial lost profits" body="For trucks and commercial fleets, calculate 90-day pre-loss net income (gross revenue minus variable expenses like fuel/tolls, excluding depreciation), divided by days driven, multiplied by out-of-service days." />
            </div>
          </div>
        </Container>
      </section>

      {/* Comparable vehicle class */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">The &quot;comparable vehicle&quot; standard</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Loss of use is based on a rental of equal class, performance, and features, not a downgraded substitute. Luxury vehicles cannot be downgraded to economy rentals simply because they cost less. Typical daily market rates:
            </p>
            <div className="mt-8 overflow-hidden rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-bg-subtle)]">
                  <tr>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Vehicle class</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Daily rental range</th>
                  </tr>
                </thead>
                <tbody>
                  <ClassRow c="Economy / compact" r="$40 to $70/day" />
                  <ClassRow c="Mid-size / standard" r="$50 to $100/day" />
                  <ClassRow c="Full-size SUV / truck" r="$80 to $150/day" />
                  <ClassRow c="Luxury sedan / SUV" r="$150 to $350/day" />
                  <ClassRow c="High-performance / exotic" r="$500 to $2,000+/day" />
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      {/* Duration */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Reasonable duration</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Damages run for the period of restoration, the time reasonably required to repair or replace the vehicle. Carrier-caused and shop-caused delays extend; owner-caused delays don&apos;t.
            </p>
            <div className="mt-10 space-y-3">
              <DurationRow sev="Minor damage" time="3 to 7 days" note="Bolt-on parts, minor cosmetic" />
              <DurationRow sev="Moderate damage" time="10 to 20 days" note="Structural, multiple systems" />
              <DurationRow sev="Major damage" time="20, 45+ days" note="Frame, airbag deployment, complex rebuild" />
              <DurationRow sev="Total loss settlement" time="Accident → settlement + 2 to 4 weeks replacement" note="Only reasonable replacement time compensable, not leisurely search" />
            </div>
          </div>
        </Container>
      </section>

      {/* Common disputes */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Common disputes</h2>
            <div className="mt-10 space-y-4">
              <DisputeLine
                title="Rental class justification"
                body="Carrier offers economy-class rental rates for a luxury vehicle loss of use. Counter: documented local rental-market rates for the actual vehicle class, luxury rentals exist and are the correct benchmark."
              />
              <DisputeLine
                title="Duration justification"
                body="Carrier disputes whether all repair days were reasonable. Counter: shop timeline logs showing parts order dates, backorder notices, and actual repair phases distinguish shop-caused delays (compensable) from owner-caused delays (not)."
              />
              <DisputeLine
                title="Second vehicle in household"
                body="Carrier argues loss of use is zero if the owner had another car available. Counter: mitigation doctrine only requires an alternative existed, not that it was convenient or available for the claimant's actual needs."
              />
              <DisputeLine
                title="Leased vehicle"
                body="Lessees can recover loss of use for their own deprivation, though lease terms affect how (lessor's lost rental income is a separate claim, not the lessee's)."
              />
              <DisputeLine
                title="Commercial lost profits"
                body="For trucking / taxi / rideshare / delivery vehicles, lost-revenue damages often exceed rental cost. Documentation of pre-loss 90-day revenue is essential."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* FAQ Section */}
      <LossOfUseFaqSection />

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Loss of use on your claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the claim and we&apos;ll follow up within one business day.</p>
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

function ConceptCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function JurBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function CalcBox({ num, name, body }: { num: string; name: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6 flex gap-5">
      <div className="shrink-0 text-3xl font-bold tracking-tight text-[color:var(--color-accent)]/50 tabular-nums leading-none">{num}</div>
      <div>
        <h3 className="text-base font-bold text-[color:var(--color-ink)]">{name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </div>
  )
}

function ClassRow({ c, r }: { c: string; r: string }) {
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-5 py-4 font-semibold text-[color:var(--color-ink)]">{c}</td>
      <td className="px-5 py-4 font-bold text-[color:var(--color-accent)]">{r}</td>
    </tr>
  )
}

function DurationRow({ sev, time, note }: { sev: string; time: string; note: string }) {
  return (
    <div className="flex gap-6 items-start border-l-2 border-[color:var(--color-accent)] pl-5">
      <div className="shrink-0 w-40">
        <div className="text-sm font-bold text-[color:var(--color-ink)]">{sev}</div>
        <div className="text-sm font-semibold text-[color:var(--color-accent)]">{time}</div>
      </div>
      <div className="text-sm text-[color:var(--color-ink-muted)]">{note}</div>
    </div>
  )
}

function DisputeLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-5">
      <h3 className="text-base font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}
