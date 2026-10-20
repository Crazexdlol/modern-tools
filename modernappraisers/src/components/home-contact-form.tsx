'use client'
import { useState } from 'react'

// Inline contact form that lives on the home page. Posts the same payload
// as /contact to /api/contact (Resend emails info@modernappraisers.com).
// Kept narrow and compact — this is the home-page strip, not the full
// contact page experience.

const SERVICES = [
  'Actual Cash Value',
  'Diminished Value',
  'Cost of Repair Dispute',
  'Umpire Services',
  'Desk / Subrogation Review',
  'Desk Appraisal',
  'Other',
]

export function HomeContactForm() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const payload = {
      name:             String(form.get('name') || '').trim(),
      email:            String(form.get('email') || '').trim(),
      phone:            String(form.get('phone') || '').trim() || undefined,
      company:          String(form.get('company') || '').trim() || undefined,
      insuranceCompany: String(form.get('insuranceCompany') || '').trim() || undefined,
      service:          String(form.get('service') || '').trim() || undefined,
      message:          String(form.get('message') || '').trim(),
    }
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not send message')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-8 text-center">
        <div className="text-xl font-bold text-[color:var(--color-ink)]">Thanks, we got your message.</div>
        <p className="mt-3 text-sm text-[color:var(--color-ink-muted)]">
          A member of our team will reach out within one business day.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6 md:p-8 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Your name"            name="name"             required />
        <Field label="Email"                name="email"            type="email" required />
        <Field label="Phone"                name="phone"            type="tel" />
        <Field label="Company / firm"       name="company"          />
        <Field label="Insurance company"    name="insuranceCompany" />
        <SelectField label="Service"        name="service"          options={SERVICES} />
      </div>
      <TextareaField label="How can we help?" name="message" required />
      {error && (
        <div className="rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
        <p className="text-xs text-[color:var(--color-ink-soft)]">
          We&apos;ll respond within one business day.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center h-11 px-6 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, name, type = 'text', required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}{required && ' *'}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        className="w-full h-11 px-3 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
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
        defaultValue=""
        className="w-full h-11 px-3 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
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
        rows={4}
        className="w-full px-3 py-2 bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      />
    </label>
  )
}
