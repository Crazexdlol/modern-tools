import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import { iconFor } from '@/lib/services-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Right to Appraisal | Modern Appraisers' }

// Umbrella page for the appraisal-clause process. Explains the clause,
// the 3-appraiser mechanics, when it applies (ACV / DV / Cost of Repair),
// and routes to the three dedicated sub-pages.

const SUB_SERVICES = [
  { slug: 'acv', title: 'Actual Cash Value', pitch: 'Total-loss valuation disputes, the single most common ACV appraisal.', href: '/actualcashvalue' },
  { slug: 'dv',  title: 'Diminished Value',  pitch: 'Post-repair loss-in-value demands, first- or third-party.',           href: '/diminishedvalue' },
  { slug: 'cost-of-repair', title: 'Cost of Repair', pitch: 'Repair-estimate disputes where the policy allows it (MA explicit; many states by rider).', href: '/costofrepair' },
]

export default function RightToAppraisalPage() {
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
              The umbrella, ACV, DV, and Cost of Repair
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.02]">
              Right to Appraisal
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Nearly every auto insurance policy contains an <strong>appraisal clause</strong>, a contractual right that lets either party demand an independent appraisal when the value of a loss is in dispute. Modern Appraisers handles every type of appraisal that can be invoked under the clause: Actual Cash Value, Diminished Value, and Cost of Repair.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link
                href="/submitaclaim"
                className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]"
              >
                Submit a Claim
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* What the clause actually says */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">What the appraisal clause actually says</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              The exact language varies by carrier, but nearly every US auto policy includes something close to:
            </p>
            <blockquote className="mt-6 border-l-2 border-[color:var(--color-accent)] pl-6 py-2 italic text-[color:var(--color-ink)]">
              If we and you do not agree on the amount of loss, either may demand an appraisal of the loss. In this event, each party will select a competent and impartial appraiser. The two appraisers will select an umpire. The appraisers will state separately the actual cash value and the amount of loss. If they fail to agree, they will submit their differences to the umpire. A decision agreed to by any two will be binding.
            </blockquote>
            <p className="mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Three key points: <strong>either party</strong> can invoke; <strong>each side selects its own appraiser</strong> (at its own expense); and the determination is <strong>binding</strong> when any two of the three agree.
            </p>
          </div>
        </Container>
      </section>

      {/* The 3-step process */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)] text-center">How the process works</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)] text-center max-w-2xl mx-auto">
              Typical appraisal clause proceeding runs 4 to 8 weeks from demand to binding determination.
            </p>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Step
                num="01"
                title="Appraisal demanded"
                body={<>Either party sends a written appraisal demand under the policy. Each side has (typically) 20 days to name its appraiser.<br /><br />Costs: each party pays its own appraiser; umpire costs are split 50/50.</>}
              />
              <Step
                num="02"
                title="Two appraisers work independently"
                body="Each appraiser inspects the vehicle, pulls comparables, documents adjustments, and produces an independent valuation. Appraisers then meet (or exchange reports) to see if they can agree. Many disputes resolve here without an umpire."
              />
              <Step
                num="03"
                title="Umpire breaks the tie"
                body="If the two appraisers can't agree within a reasonable range, they jointly select an umpire. The umpire reviews both reports (and may inspect the vehicle), then issues a binding determination. Any two of the three must agree."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* When the clause applies */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">When the clause applies</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              The appraisal clause covers <strong>valuation disputes</strong>, disagreements about <em>how much</em> is owed, not <em>whether</em> coverage applies. Three main categories:
            </p>
            <div className="mt-8 space-y-5">
              <WhereBox
                title="Actual Cash Value (ACV)"
                body="The most common appraisal-clause invocation. Applies to every total-loss settlement in essentially every US auto policy. If the carrier's valuation and your position differ by more than 5 to 10%, appraisal clause is often faster and cheaper than litigation."
                availability="Available in all 50 states, every standard auto policy includes it for total-loss ACV."
              />
              <WhereBox
                title="Diminished Value (DV)"
                body="First-party DV (your own carrier) is only compensable in Georgia and Virginia, and in those states, the appraisal clause typically applies. Third-party DV (against the at-fault carrier) is allowed in 49 states but goes to settlement negotiation or litigation, not appraisal clause."
                availability="First-party appraisal clause: GA, VA. Third-party DV: 49 states but typically litigated."
              />
              <WhereBox
                title="Cost of Repair"
                body="Not every policy includes an appraisal clause for repair-cost disputes. Massachusetts explicitly mandates it (MGL c. 175 §110L). Many homeowners and specialty auto policies include it. Standard auto policies in most states do not, the clause is usually ACV-only. Confirm in your policy before invoking."
                availability="Massachusetts: statutory. Other states: policy-dependent. Confirm clause availability before engaging."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Sub-services deep links */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)] text-center">Three types of appraisal, one firm</h2>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
              {SUB_SERVICES.map(s => (
                <Link
                  key={s.slug}
                  href={s.href}
                  className="group block bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-7 hover:border-[color:var(--color-accent)] transition-colors"
                >
                  <div className="w-12 h-12 rounded-sm border border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/10 flex items-center justify-center text-[color:var(--color-accent)] mb-5">
                    {iconFor(s.slug)}
                  </div>
                  <h3 className="text-xl font-bold text-[color:var(--color-ink)]">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{s.pitch}</p>
                  <span className="mt-5 inline-block text-sm font-semibold text-[color:var(--color-accent)] group-hover:text-[color:var(--color-ink)]">
                    Learn more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* What we deliver */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">What our appraisal report delivers</h2>
            <ul className="mt-10 space-y-5">
              <DeliverableRow title="Line-by-line comparables" body="Each comparable vehicle identified by VIN, listing source, date, mileage, trim, options. No proprietary black-box algorithm, every number is traceable to a source document." />
              <DeliverableRow title="Transparent adjustments" body="Mileage, condition, trim, options, regional market, each adjustment is a separate line with its reasoning stated. Umpires expect this format." />
              <DeliverableRow title="Jurisdiction-appropriate methodology" body="California requires fair-market-value, Georgia DV uses 17c or market-based depending on who's appraising, Massachusetts has explicit repair-cost framework. We apply the right methodology for the state and policy." />
              <DeliverableRow title="Umpire-ready formatting" body="If the two appraisers can't agree, the umpire reviews both reports. Reports that read cleanly, cite sources, and show the math win more umpire decisions than reports that stop at a bottom-line number." />
              <DeliverableRow title="Available either side" body="We serve carriers, vehicle owners, attorneys, and claims professionals, the methodology doesn't change based on who retains us. The appraisal-clause process depends on that neutrality." />
            </ul>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Clause invoked on your claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the claim online and we&apos;ll follow up within one business day with next steps and a fee quote.</p>
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

function Step({ num, title, body }: { num: string; title: string; body: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-7">
      <div className="text-5xl font-bold tracking-tight text-[color:var(--color-accent)]/50 tabular-nums leading-none mb-5">{num}</div>
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function WhereBox({ title, body, availability }: { title: string; body: string; availability: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-[color:var(--color-accent)] font-semibold">{availability}</p>
    </div>
  )
}

function DeliverableRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-5">
      <svg viewBox="0 0 24 24" className="shrink-0 w-6 h-6 mt-0.5 fill-none stroke-[color:var(--color-accent)]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <div>
        <h3 className="text-base font-bold text-[color:var(--color-ink)]">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </li>
  )
}
