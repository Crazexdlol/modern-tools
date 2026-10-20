import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Actual Cash Value (ACV) Appraisals | Modern Appraisers' }

// Deep-content ACV page (Henry 2026-10-18 research pass). Educational
// framing: what ACV is, how it's calculated, state variations, how
// disputes get resolved via appraisal clause.

export default function ActualCashValuePage() {
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
              Actual Cash Value
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              <strong>Actual Cash Value</strong> is the dollar figure an insurer pays when a vehicle is declared a total loss. It&apos;s the single most common appraisal-clause invocation, and the number where carrier and vehicle-owner frequently disagree.
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

      {/* What ACV actually is */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">What ACV is (and isn&apos;t)</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Actual Cash Value is the <strong>pre-loss market value</strong> of the vehicle, less depreciation for its specific condition on the date of loss. It&apos;s the figure the carrier owes under the indemnity principle, enough to restore the insured to their pre-loss financial position, no more.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <TermCard term="ACV" body="Pre-loss market value minus condition-specific depreciation. The number paid on total losses." />
              <TermCard term="Fair Market Value" body="What a willing buyer would pay a willing seller. Narrower insurance definition, excludes dealer markup." />
              <TermCard term="Replacement Cost" body="Full cost to buy an equivalent new vehicle. Not depreciated. Different coverage, not standard auto." />
              <TermCard term="Stated Value" body="Pre-agreed figure for specialty vehicles. Bypasses ACV calculation if invoked. Separate policy type." />
              <TermCard term="Retail / Dealer Asking" body="Dealer sticker price. Typically 15 to 25% above ACV." />
              <TermCard term="Trade-in / Wholesale" body="Dealer wholesale value. Typically 5 to 10% below ACV. Not the right figure for a total-loss settlement." />
            </div>
          </div>
        </Container>
      </section>

      {/* 3 methodologies */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Three primary ACV methodologies</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Courts and umpires accept three methods, selecting the right one for the jurisdiction and vehicle matters.
            </p>
            <div className="mt-10 space-y-6">
              <MethodCard
                num="01"
                name="Cost-to-replace minus depreciation"
                body="Start from current retail replacement cost, subtract a depreciation schedule based on age/mileage/condition. Mechanical, repeatable, well-precedented. Weakness: depreciation formula is somewhat arbitrary and doesn't track real-time market shifts. Used by CCC ONE, Mitchell, Audatex as a 40 to 60% weighted component in their hybrid models."
              />
              <MethodCard
                num="02"
                name="Fair Market Value (comparables-based)"
                body="Identify 3, 6 real-world comparables (same make/model/year/trim/mileage/options), adjust each for condition and market variance, average the adjusted values. Market-grounded, defensible, accommodates regional variation. The method independent appraisers use primarily. Dominates in appraisal-clause proceedings because it's auditable line-by-line."
              />
              <MethodCard
                num="03"
                name="Broad Evidence Rule"
                body="A holistic approach where ACV emerges from any material evidence, comparables, condition at loss, maintenance records, pre-loss listings, repair cost minus salvage, functional obsolescence, rarity. More discretionary but accommodates nuance (collector vehicles, well-maintained units beating age-adjusted norms). Favored by umpires when single-method appraisals disagree."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* How carriers calculate */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">How carriers typically produce ACV</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Roughly 80% of carrier ACV offers come from one of three valuation systems, CCC ONE (~50% market share), Audatex (Solera), or Mitchell. Each pulls comparable vehicles within a region, applies algorithmic adjustments for mileage, condition, options, and body style, and produces a figure based on 8, 15 data points.
            </p>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Common issues with system-generated ACV:
            </p>
            <ul className="mt-6 space-y-3">
              <IssueBullet title="Comparable selection bias" body="150-mile radius pulls urban dealer inventory into rural valuations (or vice versa), inflating or deflating the comp pool." />
              <IssueBullet title="Condition-rating buckets" body="5-tier buckets (poor/average/above-average/excellent/exceptional) obscure significant variation. A vehicle with recent tires + brakes + maintenance records gets the same 'average' rating as one with bald tires + deferred service." />
              <IssueBullet title="Option package underweighting" body="Factory packages (sport, premium audio, tow, leather) often credited at $500 to $1,200 by the system when actual market uplift is $2,000 to $4,500." />
              <IssueBullet title="Stale auction data" body="Auction data lags 2 to 4 weeks. In a shifting market, the figure reflects where values were, not where they are." />
              <IssueBullet title="Salvage assumption" body="System assumes 10 to 15% salvage recovery. Actual varies 5 to 25% by market, drivetrain, and salvage buyer competition." />
            </ul>
          </div>
        </Container>
      </section>

      {/* How we approach it */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">How an independent appraiser approaches ACV</h2>
            <div className="mt-10 space-y-5">
              <ProcessStep num="01" title="Pre-loss condition inspection" body="In-person inspection where cost-justified. Minimum 8 exterior photos, interior / odometer / engine bay / undercarriage. Detailed narrative on condition, not a bucket score. Maintenance records pulled (CarFax / AutoCheck)." />
              <ProcessStep num="02" title="Comparable vehicle research" body="3, 6 true comparables, same metro area where possible, listings/sales within 30 days of loss. Dealer inventory (CarGurus / Autotrader), auction closing prices (NADA, Manheim, Copart), local classifieds. Comps match on trim, body, drivetrain." />
              <ProcessStep num="03" title="Line-item adjustments" body="Mileage ($0.08, 0.25/mile depending on vehicle class), condition (only when documented), options, body/trim variance, regional demand. Each adjustment shown separately with its reasoning." />
              <ProcessStep num="04" title="Reconciliation" body="Each comp adjusted to the subject vehicle. Final ACV is typically the median or weighted average of the adjusted comps. Report explains the weightings." />
            </div>
          </div>
        </Container>
      </section>

      {/* State-by-state */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">State-by-state variations</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              ACV calculation methodology, sales-tax reimbursement, and depreciation rules vary significantly by state. A few examples:
            </p>
            <div className="mt-10 overflow-hidden rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-bg-subtle)]">
                  <tr>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">State</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Framework</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Sales Tax</th>
                  </tr>
                </thead>
                <tbody>
                  <StateRow s="California" f="§1765.1 requires fair-market-value. Rejects fixed depreciation schedules. Labor costs non-depreciable." tax="Required" />
                  <StateRow s="Georgia" f="No specific ACV statute. Total Loss Formula (Repair + Salvage ≥ ACV). Broad evidence permitted." tax="Required" />
                  <StateRow s="Florida" f="§626.9743 requires carriers to consider comparable local vehicles. 80% damage-to-value total-loss threshold." tax="Required (statutory)" />
                  <StateRow s="Texas" f="100% Total Loss Formula. Broad evidence permitted. Depreciation generally allowed." tax="Carrier discretion" />
                  <StateRow s="Massachusetts" f="Broad evidence. Explicit repair-cost appraisal (MGL c. 175 §110L)." tax="Carrier discretion" />
                  <StateRow s="Colorado" f="Broad evidence. Explicit proof-of-replacement model for sales tax." tax="Reimbursed on proof" />
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-xs text-[color:var(--color-ink-soft)]">
              Approximately 34 states statutorily require sales tax inclusion in ACV settlement or reimbursement on proof of replacement within 30 to 60 days. Rules change, confirm current statute at engagement.
            </p>
          </div>
        </Container>
      </section>

      {/* Common disputes */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Common dispute points</h2>
            <div className="mt-10 space-y-5">
              <DisputeRow
                title="Comparable selection"
                body="Carrier algorithm picks 12 data points from a 150-mile radius; appraiser argues 3 dealer-lot comps in the exact market are better matches. Resolution: curated comps with matching trim/options/condition typically beat algorithmic averages."
              />
              <DisputeRow
                title="Condition adjustments"
                body="Carrier deducts $2,000 for 'poor' condition; appraiser argues condition was above-average given recent paint and body work. NAIC guidance: no condition deduction without documented below-average evidence."
              />
              <DisputeRow
                title="Mileage adjustment formula"
                body="$0.10/mile vs. $0.15/mile on a 150k-mile vehicle = $7,500 ACV delta. No statutory guidance in most states; the figure is defensible as long as it's benchmarked and consistent."
              />
              <DisputeRow
                title="Option package credits"
                body="Factory tow + leather + navigation = $3,500 original uplift. Carrier credits $1,200 (algorithm preset). Appraiser researches dealer inventory and documents the actual uplift at $2,800."
              />
              <DisputeRow
                title="Sales tax inclusion"
                body="State-specific. Mandatory in some, carrier-discretion in others, proof-of-replacement in a few (CO, IN, HI). Rate 5 to 8.5% of ACV typical."
              />
              <DisputeRow
                title="Geographic market definition"
                body="Rural vehicle valued against urban comps inflates ACV by $2,000 to $5,000; the reverse deflates. Appraiser documents the appropriate radius."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Typical timeline</h2>
            <div className="mt-10 space-y-3">
              <TimelineRow when="Day 1, 3" what="Loss notification. Claim assigned, vehicle towed if required." />
              <TimelineRow when="Day 3, 10" what="Damage assessment. Adjuster inputs VIN + mileage into CCC / Mitchell / Audatex. Algorithmic ACV generated." />
              <TimelineRow when="Day 7, 14" what="Total loss declared. Carrier issues ACV offer. Claimant has 10 to 30 days (state-dependent) to accept or dispute." />
              <TimelineRow when="Day 14, 21" what="Negotiation. Appraiser retained if dispute. 2, 4 exchange rounds typical. Most resolve here." />
              <TimelineRow when="Day 21, 35" what="Appraisal clause invoked. Both parties name appraisers within 5 to 7 days. Reports produced in 5 to 10 business days each." />
              <TimelineRow when="Day 35, 50" what="Umpire if appraisers can't agree. Umpire reviews reports, inspects if needed, issues binding determination in 10 business days." />
              <TimelineRow when="Day 50, 60" what="Settlement paid. Simple claims: 2 to 4 weeks total. Disputed with appraisal: 6 to 8 weeks." />
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Total loss on your claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the claim online in minutes. We follow up within one business day.</p>
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

function TermCard({ term, body }: { term: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-5">
      <div className="text-sm font-bold text-[color:var(--color-accent)] mb-2">{term}</div>
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function MethodCard({ num, name, body }: { num: string; name: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-7 flex gap-6">
      <div className="shrink-0 text-4xl font-bold tracking-tight text-[color:var(--color-accent)]/50 tabular-nums leading-none">{num}</div>
      <div>
        <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{name}</h3>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </div>
  )
}

function IssueBullet({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <svg viewBox="0 0 24 24" className="shrink-0 w-5 h-5 mt-0.5 fill-none stroke-[color:var(--color-accent)]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div>
        <strong className="text-sm text-[color:var(--color-ink)]">{title}.</strong>{' '}
        <span className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</span>
      </div>
    </li>
  )
}

function ProcessStep({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="flex gap-5">
      <div className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--color-accent)] text-white font-bold flex items-center justify-center text-sm">{num}</div>
      <div>
        <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </div>
  )
}

function StateRow({ s, f, tax }: { s: string; f: string; tax: string }) {
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-5 py-4 font-semibold text-[color:var(--color-ink)] align-top">{s}</td>
      <td className="px-5 py-4 text-[color:var(--color-ink-muted)] align-top">{f}</td>
      <td className="px-5 py-4 text-[color:var(--color-accent)] align-top font-semibold whitespace-nowrap">{tax}</td>
    </tr>
  )
}

function DisputeRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-base font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function TimelineRow({ when, what }: { when: string; what: string }) {
  return (
    <div className="flex gap-6 items-start">
      <div className="shrink-0 w-24 text-sm font-bold text-[color:var(--color-accent)] tabular-nums">{when}</div>
      <div className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{what}</div>
    </div>
  )
}
