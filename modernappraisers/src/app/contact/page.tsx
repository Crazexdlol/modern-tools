'use client'
import { useState } from 'react'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'

export default function ContactPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/contact', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)), headers: { 'Content-Type': 'application/json' } })
    setBusy(false)
    if (!res.ok) { setError('Something went wrong. Please email us directly.'); return }
    setSent(true)
  }

  return (
    <main className="py-20">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Contact</p>
            <h1 className="text-5xl font-bold tracking-tight mb-6">Get in touch.</h1>
            <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-xl">Have questions before submitting a claim? Reach out. Most replies go out within one business day.</p>

            {!sent ? (
              <form onSubmit={handleSubmit} className="mt-10 space-y-5 max-w-lg">
                <Field label="Name" required><Input name="name" required /></Field>
                <Field label="Email" required><Input type="email" name="email" required /></Field>
                <Field label="Phone"><Input type="tel" name="phone" /></Field>
                <Field label="What can we help with?" required><Textarea name="message" required rows={5} /></Field>
                {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
                <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</Button>
              </form>
            ) : (
              <div className="mt-10 p-6 border border-emerald-200 bg-emerald-50 rounded-[10px] max-w-lg">
                <h2 className="font-semibold">Thanks — message sent.</h2>
                <p className="mt-2 text-sm text-[color:var(--color-ink-muted)]">We&apos;ll get back to you within one business day.</p>
              </div>
            )}
          </div>

          <aside className="pt-24 lg:pt-32 space-y-6 text-sm text-[color:var(--color-ink-muted)]">
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Phone</div><a className="text-[color:var(--color-ink)] font-semibold" href="tel:+1-XXX-XXX-XXXX">(XXX) XXX-XXXX</a></div>
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Email</div><a className="text-[color:var(--color-ink)] font-semibold" href="mailto:info@modernappraisers.com">info@modernappraisers.com</a></div>
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Hours</div>Mon–Fri · 9am–6pm PT</div>
          </aside>
        </div>
      </Container>
    </main>
  )
}
