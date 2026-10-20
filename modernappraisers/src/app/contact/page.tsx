'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Container } from '@/components/container'

// Carrier-side contact page. Dark theme + scrubbed owner-facing copy.
// Form posts to /api/contact (Resend) so submissions work locally.

export default function ContactPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form)),
      })
      if (!res.ok) throw new Error('Failed to send')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <section className="pt-12 sm:pt-20 pb-10 sm:pb-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl text-center mx-auto">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Contact Us</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Contact Us
            </h1>
            <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Independent documentation, fast turnarounds, and reports that hold up for every party on the claim. We&apos;ll get back to you within one business day.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 max-w-5xl mx-auto">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[color:var(--color-ink)]">Get in touch</h2>
              <p className="mt-4 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
                Modern Appraisers brings over 27 years of combined independent vehicle appraisal experience across every claim type.
              </p>
              <p className="mt-4 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
                Our team specializes in standard autos, motorcycles, trucks, trailers, RVs, buses, boats, classics, and exotics.
              </p>
              <div className="mt-10 space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-1">Phone</div>
                  <a href="tel:+17023215930" className="text-xl font-bold text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">(702) 321-5930</a>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-1">Email</div>
                  <a href="mailto:info@modernappraisers.com" className="text-xl font-bold text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">info@modernappraisers.com</a>
                </div>
              </div>
            </div>

            <div>
              {sent ? (
                <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-8 text-center">
                  <div className="text-xl font-bold tracking-tight text-[color:var(--color-ink)]">Thanks, we got your message.</div>
                  <p className="mt-3 text-base text-[color:var(--color-ink-muted)]">A member of our team will reach out within one business day.</p>
                  <div className="mt-6">
                    <Link href="/" className="inline-flex items-center text-sm font-semibold text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">← Back to home</Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <TextField label="Your name"             name="name"             required />
                  <TextField label="Company / firm"        name="company"          />
                  <TextField label="Insurance company"     name="insuranceCompany" />
                  <TextField label="Email"                 name="email"            type="email" required />
                  <TextField label="Phone"                 name="phone"            type="tel" />
                  <SelectField
                    label="Service requested"
                    name="service"
                    options={['Actual Cash Value', 'Diminished Value', 'Cost of Repair Dispute', 'Umpire Services', 'Desk / Subrogation Review', 'Desk Appraisal', 'Other']}
                  />
                  <TextareaField label="Message" name="message" required />
                  {error && <div className="text-sm text-red-400">{error}</div>}
                  <div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy ? 'Sending…' : 'Send message'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function TextField({ label, name, type = 'text', required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}{required && ' *'}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        className="w-full h-11 px-3 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      />
    </label>
  )
}

function SelectField({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}
      </span>
      <select
        name={name}
        className="w-full h-11 px-3 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      >
        <option value="">Select a service…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function TextareaField({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}{required && ' *'}
      </span>
      <textarea
        name={name}
        required={required}
        rows={5}
        className="w-full px-3 py-2 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      />
    </label>
  )
}
