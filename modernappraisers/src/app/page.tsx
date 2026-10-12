import Link from 'next/link'
import { Container } from '@/components/container'

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-20 pb-24 border-b border-[color:var(--color-border)]">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Independent appraisal · Est. 1999</p>
              <h1 className="text-[clamp(40px,6vw,72px)] leading-[1.02] tracking-[-0.03em] font-bold text-[color:var(--color-ink)]">
                Settle for<br/>
                <span className="text-[color:var(--color-accent)]">what you&apos;re owed.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
                Independent vehicle appraisals that recover the real value of your claim — not what the insurance company says it&apos;s worth. Typical recovery $3K–$6K per case.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim →</Link>
                <Link href="/services" className="inline-flex items-center h-11 px-5 rounded-md border border-[color:var(--color-border-strong)] text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]">How it works</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 border-t border-[color:var(--color-border)] pt-6">
              <Stat label="Recovered for clients" value="$980K+" />
              <Stat label="Typical per-claim result" value="$3K–6K" />
              <Stat label="Years of experience" value="26" />
              <Stat label="States covered" value="50" />
            </div>
          </div>
        </Container>
      </section>

      {/* Services */}
      <section className="py-20">
        <Container>
          <div className="flex items-baseline justify-between mb-10">
            <h2 className="text-3xl font-bold tracking-tight">What we do</h2>
            <Link href="/services" className="text-sm font-semibold text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">All services →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceCard title="Actual Cash Value (ACV)" copy="Independent valuation when your car is a total loss and the insurer&apos;s offer undershoots the market." href="/services/acv" />
            <ServiceCard title="Diminished Value (DV)"   copy="Recover the lost resale value of your vehicle after a collision was repaired." href="/services/diminished-value" />
            <ServiceCard title="Estimate Dispute"        copy="When the repair estimate doesn&apos;t match the real cost — we document the gap." href="/services/estimate-dispute" />
            <ServiceCard title="Appraisal Clause"        copy="Third-party dispute resolution under your policy&apos;s standard appraisal clause." href="/services/appraisal-clause" />
          </div>
        </Container>
      </section>

      {/* CTA band */}
      <section className="py-20 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-subtle)]">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">Low-ball offer? Let&apos;s take a look.</h2>
            <p className="mt-4 text-lg text-[color:var(--color-ink-muted)]">Submit your claim online in under three minutes. We&apos;ll follow up within one business day.</p>
            <div className="mt-6"><Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim</Link></div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)]">{label}</div>
    </div>
  )
}

function ServiceCard({ title, copy, href }: { title: string; copy: string; href: string }) {
  return (
    <Link href={href} className="group block p-6 bg-white border border-[color:var(--color-border)] rounded-[10px] hover:border-[color:var(--color-ink)] transition-colors">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{copy}</p>
      <span className="mt-4 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Learn more →</span>
    </Link>
  )
}
