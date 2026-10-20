import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Fulfillment Policy | Modern Appraisers',
  description: 'How Modern Appraisers delivers appraisal services, including scope, timeline, revisions, cancellation, refunds, and billing.',
}

const EFFECTIVE_DATE = 'October 18, 2026'

export default function FulfillmentPolicyPage() {
  return (
    <main>
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-10 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Legal</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Fulfillment Policy
            </h1>
            <p className="mt-6 text-sm uppercase tracking-wider text-[color:var(--color-ink-soft)]">
              Last updated: {EFFECTIVE_DATE}
            </p>
            <p className="mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              This Fulfillment Policy explains how Modern Appraisers, a service of Modern Group LLC, delivers its appraisal and dispute-resolution services. It covers scope confirmation, delivery timelines, revisions, cancellation, refunds, and billing. For general website terms see our Terms of Service, and for data handling see our Privacy Policy.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl space-y-10 text-[color:var(--color-ink-muted)] leading-relaxed">

            <Clause num="1" title="Services We Deliver">
              <p>Modern Appraisers provides professional vehicle appraisal and claim dispute services, including:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Actual Cash Value (ACV) appraisals for total-loss claims;</li>
                <li>Diminished Value (DV) appraisals for repaired vehicles;</li>
                <li>Cost of Repair appraisals and estimate reviews;</li>
                <li>Loss of Use calculations and reports;</li>
                <li>Storage charge disputes and reasonable-rate opinions;</li>
                <li>Right-to-Appraisal clause representation and umpire services;</li>
                <li>Desk reviews, subrogation reviews, and related consulting work.</li>
              </ul>
              <p className="mt-3">Services are delivered nationwide across all fifty states and across standard autos, motorcycles, trucks, trailers, RVs, buses, boats, classics, and exotics. Specialty-equipment and commercial-vehicle engagements are also supported.</p>
            </Clause>

            <Clause num="2" title="How an Engagement Starts">
              <p>Every engagement begins with a scope confirmation. After you submit a claim or inquiry, we review the materials, confirm the vehicle class, jurisdiction, and scope of work, and send a written engagement letter or assignment that sets out the deliverable, the fee, the expected timeline, and any required documentation or deposit. The engagement starts when you accept the engagement letter in writing (including by email) and, where applicable, satisfy any required deposit or documentation condition.</p>
            </Clause>

            <Clause num="3" title="Turnaround Times">
              <p>Standard delivery timelines, measured from the day we have all required documentation and, where applicable, vehicle inspection access:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Desk appraisal (ACV or DV with photos and records):</strong> typically 3 to 5 business days.</li>
                <li><strong>Field appraisal (on-site inspection):</strong> typically 5 to 10 business days from scheduling.</li>
                <li><strong>Cost of Repair review or estimate dispute:</strong> typically 2 to 5 business days.</li>
                <li><strong>Loss of Use or Storage opinion:</strong> typically 2 to 4 business days.</li>
                <li><strong>Umpire proceeding:</strong> timeline is set by the two appraisers and the policy; we schedule the review within 5 business days of appointment.</li>
                <li><strong>Rush delivery:</strong> available on request subject to capacity and an expedite fee set in the engagement letter.</li>
              </ul>
              <p className="mt-3">Timelines are good-faith estimates, not guarantees. Delays can arise from missing documentation, carrier or counterparty responsiveness, inspection scheduling, or circumstances outside our control. We will communicate meaningful schedule changes as they arise.</p>
            </Clause>

            <Clause num="4" title="Deliverables and Format">
              <p>Reports are delivered as PDF documents by email or secure link to the engaging client. Each report includes the methodology used, the data sources considered, comparable sales (where applicable) shown line-by-line, condition and adjustment detail shown transparently, and the appraiser&apos;s opinion of value or finding. Supporting photos, worksheets, and reference data are included or appended as appropriate. Printed copies and sworn or notarized versions are available on request for an additional fee.</p>
            </Clause>

            <Clause num="5" title="Revisions and Supplemental Work">
              <p>If, after delivery, you identify a factual error (for example, a mistaken VIN, incorrect mileage, or an overlooked record that was timely produced), we will correct the report at no additional charge. Changes requested after delivery that expand the scope, add newly produced documentation, or require re-opinion based on new facts are performed as supplemental work billed at the rate set out in the engagement letter.</p>
            </Clause>

            <Clause num="6" title="Fees, Deposits, and Payment">
              <p>Fees are set in the engagement letter and reflect the scope, vehicle class, jurisdiction, inspection requirements, and expected turnaround. Fees are typically structured as flat fees per report, hourly rates for consulting or umpire time, or a combination. Deposits or retainers may be required for larger scopes or expedited work and are credited against the final invoice. Payment is accepted by major credit card, ACH, or business check. Invoices are due on receipt unless the engagement letter provides otherwise.</p>
              <p>Modern Appraisers does not perform appraisals on a contingency basis (a fee tied to the amount recovered). Our opinions are independent, and tying our fee to a specific outcome would compromise the professional neutrality that gives our reports their value.</p>
            </Clause>

            <Clause num="7" title="Cancellation">
              <p>You may cancel an engagement in writing at any time. Charges at cancellation depend on how far the work has progressed:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Before work begins</strong> (no file review, no inspection scheduled): no charge; any deposit paid is refunded less any merchant-processing fees.</li>
                <li><strong>After work begins but before delivery</strong>: the fee for work performed to date (file review, data gathering, partial drafting, scheduling and travel time if applicable), plus any non-refundable third-party costs incurred (travel, data-provider fees, courier). We will issue a reconciled statement with the refund or balance due.</li>
                <li><strong>After delivery of the report</strong>: no refund, because the deliverable has been produced. Legitimate factual-error corrections are still handled under the Revisions section above.</li>
              </ul>
              <p className="mt-3">We may cancel an engagement if the vehicle, the claim, or the documentation turns out to be materially different from what was represented at intake, if we identify a conflict of interest, or if continuing the engagement would violate applicable law or professional standards. If we cancel for one of those reasons, we will refund any portion of the deposit that exceeds work actually performed.</p>
            </Clause>

            <Clause num="8" title="Refund Requests">
              <p>If you believe a refund is warranted outside the categories above (for example, you believe the deliverable materially missed the agreed scope), contact us within thirty (30) days of delivery at info@modernappraisers.com with a written explanation. We review refund requests promptly and in good faith, and will respond within ten (10) business days. Where a refund is approved, it is issued to the original payment method within ten (10) business days of approval.</p>
            </Clause>

            <Clause num="9" title="Scope Boundaries">
              <p>Our engagement scope is defined in the engagement letter. Modern Appraisers does not: (a) provide legal advice; (b) negotiate with carriers on your behalf unless specifically engaged to do so; (c) make coverage determinations or sell insurance; (d) adjust claims on behalf of a carrier; or (e) guarantee a specific settlement, award, or claim outcome. See our Terms of Service for the full statement of our professional role.</p>
            </Clause>

            <Clause num="10" title="Confidentiality and Delivery Channel">
              <p>Deliverables and underlying file materials are shared with the engaging client and, with the client&apos;s direction, with counsel, carriers, opposing appraisers, umpires, or courts as reasonably necessary to pursue the matter. Please send sensitive documentation through secure channels we designate; do not transmit Social Security numbers or bank account information through unsecured email. We retain engagement files consistent with the retention schedule in our Privacy Policy.</p>
            </Clause>

            <Clause num="11" title="Changes to This Policy">
              <p>We may update this Fulfillment Policy from time to time. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. Engagements already in progress continue under the Policy in effect at the time of the engagement letter unless the parties agree in writing otherwise.</p>
            </Clause>

            <Clause num="12" title="Contact Us">
              <p>For questions about delivery, revisions, cancellation, or billing on an active engagement, contact us at:</p>
              <div className="mt-4 text-[color:var(--color-ink)] not-italic">
                <div className="font-semibold">Modern Appraisers</div>
                <div>a service of Modern Group LLC</div>
                <div className="mt-2">Clark County, Nevada, United States</div>
                <div className="mt-2">
                  <a href="tel:+17023215930" className="text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">(702) 321-5930</a>
                </div>
                <div>
                  <a href="mailto:info@modernappraisers.com" className="text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">info@modernappraisers.com</a>
                </div>
              </div>
            </Clause>

          </div>
        </Container>
      </section>

      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Ready to engage us?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Submit the claim and we&apos;ll send a scoped engagement letter within one business day.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <Link href="/terms" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Clause({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`clause-${num}`} className="scroll-mt-24">
      <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[color:var(--color-ink)]">
        <span className="text-[color:var(--color-accent)] mr-3 tabular-nums">{num}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base">
        {children}
      </div>
    </section>
  )
}
