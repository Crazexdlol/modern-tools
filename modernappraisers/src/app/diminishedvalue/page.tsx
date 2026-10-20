import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Diminished Value (DV) Appraisals | Modern Appraisers' }

export default function DiminishedValuePage() {
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
              Right to Appraisal · Valuation
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.02]">
              Diminished Value
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              <strong>Diminished value</strong> is the reduction in a vehicle&apos;s market value caused by its history of collision damage, even when repairs are completed to manufacturer specifications. The vehicle will never sell for pre-loss value because buyers see the accident in the vehicle history report.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link
                href="/submitaclaim"
                className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]"
              >
                Submit a Claim
              </Link>
              <Link
                href="/righttoappraisal"
                className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors"
              >
                About Right to Appraisal
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Three types of DV */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Three types of DV, only one is payable</h2>
            <div className="mt-10 space-y-5">
              <TypeCard
                tag="Not payable"
                name="Immediate DV"
                body="The theoretical loss at the moment of damage, before any repair attempt. Not compensable in insurance claims because the vehicle has not yet been repaired."
              />
              <TypeCard
                tag="Payable"
                name="Inherent DV"
                body="The permanent loss after proper repair. The vehicle will never sell for pre-loss value because buyers know it was in an accident. This is the only type of DV that insurance claims actually pay."
                highlight
              />
              <TypeCard
                tag="Not DV"
                name="Repair-related DV"
                body="Temporary loss due to incomplete or defective repair. Resolved by proper repair, not a DV claim. The remedy is correcting the repair, not a DV payment."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* First-party vs third-party */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">First-party vs. third-party DV</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Whether a DV claim is even allowed depends heavily on which carrier is being asked to pay.
            </p>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
              <PartyCard
                title="First-party DV"
                subtitle="Your own carrier, under your own collision policy"
                body="Allowed in only 2 states: Georgia (State Farm v. Mabry, 2001) and Virginia (by statutory interpretation). Barred in the other 48 states + DC. Rationale: collision coverage insures against repair cost, not post-repair resale loss."
                states="GA, VA"
              />
              <PartyCard
                title="Third-party DV"
                subtitle="At-fault party's liability coverage"
                body="Allowed in 49 states + DC (exception: Michigan, barred by statute). Processed through settlement negotiation or litigation against the at-fault carrier. Appraisal clause rarely applies, these go to court or settle informally."
                states="49 states + DC"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* 17c formula */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">The 17c formula</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Named after a claim handbook procedure referenced in <em>State Farm v. Mabry</em> (Ga. 2001), the 17c formula became the nationwide template for DV calculation. It&apos;s simple, which is both its strength (universally recognized) and its weakness (ignores brand, condition, and real-world market data).
            </p>
            <div className="mt-8 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-8 font-mono text-sm md:text-base">
              <div className="text-[color:var(--color-accent)]">DV = Pre-loss value × 10% cap × Damage multiplier × Mileage multiplier</div>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
              <ComponentCard
                name="10% cap"
                body="Hard ceiling on the base figure. A $25,000 pre-loss value → max $2,500 DV under strict 17c."
              />
              <ComponentCard
                name="Damage multiplier"
                body="0 to 1 scale. Minor = 0.25, moderate = 0.5, major/structural = 0.75, 1.0. Subjective."
              />
              <ComponentCard
                name="Mileage multiplier"
                body="Linear decline, 1.0 at 0 miles down toward 0 at ~200k miles. A 100k-mile vehicle is roughly 0.4, 0.5."
              />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
              <strong>Limitations:</strong> The 10% cap is arbitrary, real market data on luxury and low-mileage vehicles often supports 12 to 18% loss post-structural repair. The damage multiplier is subjective and inconsistent across adjusters. The mileage multiplier doesn&apos;t weight brand or pre-loss condition. Modern umpires increasingly expect market-comparables backup rather than pure 17c output.
            </p>
          </div>
        </Container>
      </section>

      {/* Other methodologies */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">When 17c isn&apos;t enough, modified and market-based methodologies</h2>
            <div className="mt-10 space-y-5">
              <MethodBox
                name="Modified 17c"
                body="Removes or raises the 10% cap (15% or 20% for structural damage). Weights damage multiplier via actual repair cost percentage: repair cost ÷ pre-loss value = damage multiplier. More defensible on expensive repairs. Used in Texas, parts of New York, and California umpire proceedings."
              />
              <MethodBox
                name="Market-based (comparables)"
                body="Pull post-repair vehicles of same year / make / model / trim from retail listings; pull pre-loss comparables (clean accident history). Calculate the price delta per vehicle. More labor-intensive but much more defensible. Standard-of-care in California; increasingly preferred by Georgia umpires."
              />
              <MethodBox
                name="Specific-model DV studies"
                body="For high-value or specialty vehicles (Porsche, exotic, low-production), published DV studies by brand or model-year can supplement comparables research. More weight at umpire proceedings than formula output alone."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* State by state */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">State-by-state framework</h2>
            <div className="mt-10 overflow-hidden rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-bg-subtle)]">
                  <tr>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Jurisdiction</th>
                    <th className="text-center px-3 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">First-party</th>
                    <th className="text-center px-3 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Third-party</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Standard methodology</th>
                  </tr>
                </thead>
                <tbody>
                  <DvStateRow s="Georgia" fp="Allowed" tp="Allowed" m="17c + comparables (umpire-friendly)" ok1 ok2 />
                  <DvStateRow s="Virginia" fp="Allowed" tp="Allowed" m="17c or comparables" ok1 ok2 />
                  <DvStateRow s="California" fp="Barred" tp="Allowed" m="Market-based (standard-of-care)" ok2 />
                  <DvStateRow s="Texas" fp="Barred" tp="Allowed" m="Modified 17c or comparables" ok2 />
                  <DvStateRow s="Florida" fp="Barred" tp="Allowed" m="17c variant, litigation standard" ok2 />
                  <DvStateRow s="New York" fp="Barred" tp="Allowed" m="Mixed, court-dependent" ok2 />
                  <DvStateRow s="Michigan" fp="Barred" tp="Barred (statutory)" m="N/A" />
                  <DvStateRow s="Illinois / Ohio / PA" fp="Barred" tp="Allowed" m="17c baseline, litigation standard" ok2 />
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-xs text-[color:var(--color-ink-soft)]">
              Only Georgia and Virginia permit first-party DV. Michigan bars both first- and third-party DV. Every other state allows third-party DV but typically goes to settlement or litigation rather than appraisal clause.
            </p>
          </div>
        </Container>
      </section>

      {/* Qualifying factors */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">What enhances or disqualifies a DV claim</h2>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-accent)] mb-4">Enhances the claim</h3>
                <ul className="space-y-4">
                  <QualItem title="Luxury / premium brand" body="A 2020 BMW X5 loses 12 to 18% post-structural repair; a Chevy Equinox loses 5 to 8%. Market data shows steeper drops for luxury." />
                  <QualItem title="Low mileage" body="15k-mile 2023 Porsche has substantially higher DV ($12k, $18k) than an 80k example. Lower miles = higher DV percentage." />
                  <QualItem title="Structural damage" body="Frame, unibody, or suspension components repaired. Buyers perceive structural damage as more permanent than cosmetic, supports higher multipliers." />
                  <QualItem title="Specialty / exotic" body="Ferrari, Lamborghini, limited-production. DV often 15 to 25% of pre-loss value; formulas break down (10% cap is too low)." />
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Disqualifies the claim</h3>
                <ul className="space-y-4">
                  <QualItem title="Leased vehicle" body="Insurable interest typically reserved to lessor. Lessee cannot claim loss in residual value unless the lease specifically assigns residual risk." />
                  <QualItem title="Pre-existing damage on title" body="Salvage title, rebuilt title, or prior accident history, vehicle already marked; no new loss-in-value from current damage." />
                  <QualItem title="Total loss" body="Vehicle destroyed, no post-repair value to compare against pre-loss. DV is a post-repair concept." />
                  <QualItem title="Repair quality failure" body="If repair was defective and caused remaining loss, remedy is proper repair (shop's responsibility), not a DV payment." />
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Typical ranges */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Typical DV ranges by vehicle class</h2>
            <p className="mt-4 text-sm text-[color:var(--color-ink-muted)]">
              Representative ranges based on market data. Actual DV varies by vehicle, mileage, damage severity, and jurisdiction.
            </p>
            <div className="mt-10 overflow-hidden rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-bg-subtle)]">
                  <tr>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Class</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Pre-loss value</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Typical DV</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">% of value</th>
                  </tr>
                </thead>
                <tbody>
                  <RangeRow c="Economy sedan" v="$12k, $18k" dv="$400 to $1,200" p="3 to 8%" />
                  <RangeRow c="Mid-market sedan" v="$18k, $28k" dv="$800 to $2,500" p="4 to 10%" />
                  <RangeRow c="Compact / mid SUV" v="$22k, $35k" dv="$1,200 to $3,500" p="5 to 12%" />
                  <RangeRow c="Full-size truck" v="$28k, $45k" dv="$1,500 to $5,000" p="4 to 12%" />
                  <RangeRow c="Luxury sedan" v="$25k, $45k" dv="$2,000 to $6,000" p="6 to 15%" />
                  <RangeRow c="Luxury SUV" v="$35k, $65k" dv="$3,000 to $10,000" p="6 to 18%" />
                  <RangeRow c="Premium truck" v="$45k, $75k" dv="$4,000 to $12,000" p="6 to 18%" />
                  <RangeRow c="Specialty / exotic" v="$60k, $150k+" dv="$8,000 to $25,000+" p="10 to 25%" />
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">DV claim on your claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the claim online and we&apos;ll follow up within one business day.</p>
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

function TypeCard({ tag, name, body, highlight = false }: { tag: string; name: string; body: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-sm p-6 ${highlight ? 'bg-[color:var(--color-accent)]/5 border-[color:var(--color-accent)]/40' : 'bg-[color:var(--color-bg-elevated)] border-[color:var(--color-border)]'}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-sm ${highlight ? 'bg-[color:var(--color-accent)] text-white' : 'bg-[color:var(--color-border)] text-[color:var(--color-ink-muted)]'}`}>{tag}</span>
        <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{name}</h3>
      </div>
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function PartyCard({ title, subtitle, body, states }: { title: string; subtitle: string; body: string; states: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-xl font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-1 text-sm text-[color:var(--color-ink-soft)] italic">{subtitle}</p>
      <p className="mt-4 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-[color:var(--color-accent)] font-semibold">Available: {states}</p>
    </div>
  )
}

function ComponentCard({ name, body }: { name: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-5">
      <div className="text-sm font-bold text-[color:var(--color-accent)] mb-2">{name}</div>
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function MethodBox({ name, body }: { name: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{name}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function DvStateRow({ s, fp, tp, m, ok1 = false, ok2 = false }: { s: string; fp: string; tp: string; m: string; ok1?: boolean; ok2?: boolean }) {
  const chip = (text: string, ok: boolean) => (
    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-sm ${ok ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]' : 'bg-[color:var(--color-border)] text-[color:var(--color-ink-soft)]'}`}>{text}</span>
  )
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-5 py-4 font-semibold text-[color:var(--color-ink)] align-top">{s}</td>
      <td className="px-3 py-4 text-center align-top">{chip(fp, ok1)}</td>
      <td className="px-3 py-4 text-center align-top">{chip(tp, ok2)}</td>
      <td className="px-5 py-4 text-[color:var(--color-ink-muted)] align-top">{m}</td>
    </tr>
  )
}

function QualItem({ title, body }: { title: string; body: string }) {
  return (
    <li>
      <strong className="text-sm text-[color:var(--color-ink)]">{title}.</strong>{' '}
      <span className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</span>
    </li>
  )
}

function RangeRow({ c, v, dv, p }: { c: string; v: string; dv: string; p: string }) {
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-5 py-4 font-semibold text-[color:var(--color-ink)]">{c}</td>
      <td className="px-5 py-4 text-[color:var(--color-ink-muted)]">{v}</td>
      <td className="px-5 py-4 font-bold text-[color:var(--color-accent)]">{dv}</td>
      <td className="px-5 py-4 text-[color:var(--color-ink-muted)]">{p}</td>
    </tr>
  )
}
