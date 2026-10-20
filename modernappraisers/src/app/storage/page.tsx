import Link from 'next/link'
import { Container } from '@/components/container'
import { BackLink } from '@/components/back-link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Storage Charges | Modern Appraisers' }

export default function StoragePage() {
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
              Storage Charges
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Storage invoices from body shops, tow yards, and salvage facilities can inflate quickly, administrative fees, environmental surcharges, non-market per-diem rates, extended holds. We audit the invoice, benchmark against local market and state regulatory caps, and document which charges are recoverable from the at-fault party.
            </p>
            <div className="mt-10 flex items-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <Link href="/contact" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Contact Us</Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Rate benchmarks */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Rate benchmarks + state caps</h2>
            <p className="mt-5 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              National per-diem storage rates typically run <strong>$25 to $75/day</strong> depending on facility type, region, and vehicle size. Some states cap rates statutorily; others leave it to local market.
            </p>
            <div className="mt-10 overflow-hidden rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-bg-subtle)]">
                  <tr>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">State</th>
                    <th className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)]">Statutory rate / cap</th>
                  </tr>
                </thead>
                <tbody>
                  <StateRow s="California" r="$35 to $45/day (Bureau of Automotive Repair guidance); CHP-approved rates for private-property tow" />
                  <StateRow s="Texas" r="$22.85/day (vehicles ≤25 ft); $39.99/day (>25 ft) per Vehicle Storage Facility rules (2024)" />
                  <StateRow s="New York" r="$35/day (passenger <4,500 lbs); $50/day (heavy 10,000, 18,000 lbs) per proposed 2025 regs" />
                  <StateRow s="Florida / Illinois / Colorado" r="Typical market range $25 to $40/day (not statutory caps)" />
                  <StateRow s="Metro premiums" r="NYC, LA, SF Bay: $50 to $75/day. Rural: $20 to $35/day. Indoor climate-controlled: 25 to 50% premium." />
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      {/* Common inflation patterns */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Common inflation patterns</h2>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
              <InflationItem title="Undisclosed admin fees" body="$15 to $50 per vehicle, often charged per transaction or per day without disclosure." />
              <InflationItem title="Environmental surcharges" body='"$10 to $25/day" with no basis in vehicle type or actual environmental handling.' />
              <InflationItem title="Facility maintenance surcharge" body="Variable, sometimes 10 to 15% of base rate, rarely justified." />
              <InflationItem title="Key / gate card fees" body="Charged separately from per-diem for routine access." />
              <InflationItem title="After-hours release fees" body="$25 to $75 for vehicle retrieval outside standard business hours." />
              <InflationItem title="Double-day billing" body="Charging both entry and release day as full days when released same-day." />
              <InflationItem title="Partial-day as full day" body="Charging a half-day stay as a full day without actual-hours documentation." />
              <InflationItem title="Post-authorization delay" body="Continuing charges after carrier authorized release, due to facility-caused delay." />
            </div>
          </div>
        </Container>
      </section>

      {/* Who pays */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Who pays, and for how long</h2>
            <div className="mt-10 space-y-5">
              <WhoBox
                title="Insured's own carrier (collision coverage)"
                body="If the insured carries collision coverage: carrier pays reasonable storage during covered loss. For total losses, carrier pays through settlement date plus 3 to 5 business days for vehicle transfer / title work (state-dependent)."
              />
              <WhoBox
                title="At-fault carrier (third-party liability)"
                body="Liable for ordinary and reasonable storage charges caused by the at-fault party's negligence. Burden on claimant to prove reasonableness (local market rate, not inflated). No obligation beyond reasonable settlement period."
              />
              <WhoBox
                title="Vehicle owner (post-settlement)"
                body="Once settlement is paid, owner responsible for all storage after settlement date, including delays caused by failure to authorize release or pick up salvage."
              />
              <WhoBox
                title="Lienholder complications"
                body="Mechanic's lien or storage lien can attach after unpaid charges. Insurance carriers must coordinate with lien holders to release vehicle; paying storage sometimes releases a lien."
              />
            </div>
          </div>
        </Container>
      </section>

      {/* Audit methodology */}
      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Our audit methodology</h2>
            <div className="mt-10 space-y-5">
              <MethodStep num="01" name="Rate benchmarking" body="Call 3, 5 competing facilities in the same metro to confirm market rate. Cross-reference against state regulatory caps. Flag unexplained premiums >25% above local average." />
              <MethodStep num="02" name="Duration audit" body="Calculate total days held (inclusive). Map against tow date, estimate date, authorization date, settlement date. Isolate who caused each delay, carrier, facility, or owner." />
              <MethodStep num="03" name="Reasonableness threshold" body="Body shop: >10 days = red flag (3, 7 normal). Salvage: >5 days = red flag (1, 3 normal). Settlement hold: 5-day grace post-settlement is standard; >10 days requires documented reason." />
              <MethodStep num="04" name="Documentation audit" body="Verify storage ledger (date-in/date-out per day), release authorization, carrier communication trail, final invoice reconciliation. Missing documentation often reveals the inflation." />
              <MethodStep num="05" name="Subrogation determination" body="Separate recoverable charges (storage during accident-caused repair/hold) from non-recoverable (owner-caused delays, post-settlement). Document for subrogation counsel." />
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Storage bill to audit?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">Submit the invoice and timeline. We follow up within one business day with the audit scope and fee.</p>
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

function StateRow({ s, r }: { s: string; r: string }) {
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-5 py-4 font-semibold text-[color:var(--color-ink)] align-top whitespace-nowrap">{s}</td>
      <td className="px-5 py-4 text-[color:var(--color-ink-muted)] align-top">{r}</td>
    </tr>
  )
}

function InflationItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-5">
      <h3 className="text-sm font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function WhoBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
      <h3 className="text-lg font-bold text-[color:var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
    </div>
  )
}

function MethodStep({ num, name, body }: { num: string; name: string; body: string }) {
  return (
    <div className="flex gap-5">
      <div className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--color-accent)] text-white font-bold flex items-center justify-center text-sm">{num}</div>
      <div>
        <h3 className="text-base font-bold text-[color:var(--color-ink)]">{name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{body}</p>
      </div>
    </div>
  )
}
