import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cost of Repair Disputes | Modern Appraisers' }

export default function CostOfRepairPage() {
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
              Right to Appraisal · Dispute Resolution
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.02]">
              Cost of Repair Disputes
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              A <strong>Cost of Repair dispute</strong> arises when the insurer&apos;s authorized repair estimate differs from what the body shop (or vehicle owner) believes is needed to restore the vehicle. We audit the estimate line-by-line and deliver a corrected position defensible on either side of the claim.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <Link href="/righttoappraisal" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">About Right to Appraisal</Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Appraisal clause availability, critical */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Repair-cost appraisal clause isn&apos;t universal</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Unlike ACV (where nearly every auto policy includes appraisal clause coverage), <strong>repair-cost appraisal is state-dependent and policy-dependent</strong>. Confirm the clause applies before engaging.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
              <ClauseBox state="Massachusetts" rule="Explicit" body="MGL c. 175 §110L mandates repair-cost appraisal on all auto policies." />
              <ClauseBox state="Specialty & HO" rule="Often included" body="Collector / high-value auto policies, homeowners policies in coastal states (FL, LA, MA)." />
              <ClauseBox state="Standard auto" rule="Usually ACV only" body="Most state standard auto policies limit appraisal clause to ACV disputes. Confirm language before invoking." />
            </div>
            <p className="mt-6 text-sm text-[color:var(--color-ink-muted)]">
              When the clause doesn&apos;t apply, we still perform the audit and deliver a corrected estimate, useful for negotiation, settlement, and expert-witness preparation. It just isn&apos;t binding under the policy.
            </p>
          </div>
        </Container>
      </section>

      {/* Common dispute sources */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Where disputes typically arise</h2>
            <div className="mt-10 space-y-5">
              <DisputeBox
                title="Labor rates vs. prevailing market"
                body="Carrier estimates often use national or regional lockstep rates ($40, 65/hr body, $65, 95/hr refinish) that undercut local prevailing rates. SCRS publishes annual labor-rate surveys by market; DRP agreements set per-market rates. A Boston shop's prevailing rate is not Chicago's."
              />
              <DisputeBox
                title="Labor hours, OEM vs. estimating system"
                body="Carrier systems (Mitchell, CCC, Audatex) often estimate 10 to 15% below OEM-required times for structural welding, unibody repair, and recalibration. OEM procedures (I-CAR Repairability Portal, OEM1Stop, manufacturer bulletins) specify the correct times. Appraiser flags the shortage with OEM citation."
              />
              <DisputeBox
                title="Three-stage paint & blend operations"
                body="Modern vehicles with three-stage pearl / candy / effect-coat paints require blend operations on all four adjacent panels for color-match. Carrier estimates commonly skip blend panels or apply flat overlap deductions regardless of panel count. Appraiser validates against paint code and procedure guide."
              />
              <DisputeBox
                title="ADAS calibration post-repair"
                body="Advanced Driver Assistance Systems (cameras, radar, lidar) require OEM-mandated calibration ($300, 800) before the vehicle is road-safe. Carrier estimates often omit calibration if structural damage is deemed 'minor', but even minor damage triggers calibration requirements."
              />
              <DisputeBox
                title="OEM vs. aftermarket vs. recycled parts"
                body="OEM is highest cost, exact fit. Aftermarket (CAPA / NSF-certified) is 60 to 80% of OEM cost. Recycled (LKQ) is 40 to 60%. Many states require written consumer consent for non-OEM parts; carriers sometimes authorize substitution without disclosure. 'Like kind and quality' standard varies by state."
              />
              <DisputeBox
                title="Supplement timing & hidden damage"
                body="Shop discovers hidden damage during repair, submits supplement. Carrier disputes whether damage was reasonably discoverable pre-repair or whether the operation was already included. Appraiser audits the supplement against the original estimate and procedure guides."
              />
              <DisputeBox
                title="Procedure page (P-pages) interpretation"
                body="Mitchell / CCC / Audatex publish 'included operations' lists for every labor line. Carriers sometimes over-apply bundling (e.g., 'R&I door' including hinge replacement when the P-page actually bills hinges separately). Appraiser cites specific procedure-guide language."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* What we audit */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">What a line-by-line audit covers</h2>
            <ul className="mt-10 space-y-5">
              <AuditItem title="Labor rate validation" body="Benchmark against SCRS survey data, DRP rate agreements, and shop's current labor-rate schedule. Flag discrepancies with supporting documentation." />
              <AuditItem title="Labor hour validation" body="Cross-reference each operation against the procedure guide (Mitchell / CCC / Audatex) and OEM procedure. Flag shortages with specific OEM document citations." />
              <AuditItem title="Paint operation review" body="Validate paint formula (single-stage, two-stage, three-stage pearl, effect-coat). Count physically adjacent panels. Verify blend operations and overlap deductions against paint procedure." />
              <AuditItem title="Parts specification review" body="Cross-check OEM part numbers. Note aftermarket / recycled substitutions. Flag missing consumer-consent disclosure where state law requires." />
              <AuditItem title="OEM procedure compliance" body="Verify all OEM-mandated operations are included, weld inspection, ADAS calibration, fastener replacement, trim replacement, composite repair restrictions." />
              <AuditItem title="Supplement validation" body="Audit supplements line-by-line against original estimate. Determine whether damage was reasonably discoverable pre-repair. Flag duplicate billing." />
              <AuditItem title="Corrected counter-estimate" body="Deliverable: a corrected estimate showing original figures, our recommended adjustments, and the corrected total. Formatted for either settlement negotiation or appraisal-clause proceedings." />
            </ul>
          </div>
        </Container>
      </section>

      {/* Common over-write / shortage patterns */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Common over-write and shortage patterns</h2>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Common over-writes (inflated charges)</h3>
                <ul className="space-y-3 text-sm text-[color:var(--color-ink-muted)]">
                  <li>• Duplicate operations (paint + prep listed separately when prep is included)</li>
                  <li>• Phantom overlap deductions (flat 0.5 hr when actual blend involves 4 panels)</li>
                  <li>• Unnecessary R&I when repair-in-place is viable</li>
                  <li>• Over-engineered repairs (frame straightening when sectioning suffices)</li>
                  <li>• Inflated hardware / fastener charges</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-accent)] mb-4">Common shortages (under-estimates)</h3>
                <ul className="space-y-3 text-sm text-[color:var(--color-ink-muted)]">
                  <li>• Missing ADAS calibration post-repair</li>
                  <li>• Missing OEM-required weld inspection</li>
                  <li>• Missing fastener replacement (torque-sensitive, one-time use)</li>
                  <li>• Incomplete three-stage paint blend operations</li>
                  <li>• Missing sublet (windshield + ADAS, fuel cell, specialized tooling)</li>
                  <li>• Missing clips, brackets, trim pieces</li>
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Estimate dispute on your claim?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the claim online with the disputed estimate. We follow up within one business day.</p>
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

function ClauseBox({ state, rule, body }: { state: string; rule: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <div className="text-sm font-bold text-[color:var(--color-accent)] mb-1">{state}</div>
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] font-semibold mb-3">{rule}</div>
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function DisputeBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function AuditItem({ title, body }: { title: string; body: string }) {
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
