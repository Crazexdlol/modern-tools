'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Container } from '@/components/container'

// Public claim-submission form. Posts to /api/claims which relays into HAMS
// as a new unassigned claim on the "New Assignments" dashboard. Supports file
// uploads (photos, PDFs) which are stored in the HAMS claim-documents bucket
// and attached to the created claim.

const SERVICES = [
  'Right To Appraisal',
  'Actual Cash Value',
  'Diminished Value',
  'Cost of Repair Dispute',
  'Umpire Services',
  'Desk / Subrogation Review',
  'Desk Appraisal',
  'Other',
]

const MAX_FILES = 15
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,image/tiff,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function SubmitClaimPage() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: true; maNumber: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [specialty, setSpecialty] = useState(false)
  const [vin, setVin] = useState('')

  const vinInvalid = !specialty && vin.length > 0 && vin.length !== 17
  const totalBytes = files.reduce((a, f) => a + f.size, 0)
  const filesTooBig = totalBytes > MAX_TOTAL_BYTES
  const tooManyFiles = files.length > MAX_FILES

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    // Replace rather than append — the input is single-use per interaction.
    setFiles(picked)
  }
  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    // Replace the file input's values with our React-managed list so removed
    // files are honored. (The <input> only knows about the last picker open.)
    form.delete('documents')
    for (const f of files) form.append('documents', f, f.name)
    try {
      const res = await fetch('/api/claims', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Could not submit the claim')
      }
      setResult({ ok: true, maNumber: json.maNumber ?? null })
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
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Assign a claim</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Submit a Claim
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              Independent appraisal assignments welcomed from carriers, vehicle owners, attorneys, adjusters, claims managers, and TPAs. Submit the claim below and we&apos;ll follow up within one business day with next steps, timeline, and a fee quote.
            </p>
          </div>
        </Container>
      </section>

      {/* Compact "Services we provide" strip — links to the full services page. */}
      <section className="py-10 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[color:var(--color-ink)]">Services we provide</h2>
              <p className="mt-2 text-sm text-[color:var(--color-ink-muted)]">
                Full suite of independent appraisal and dispute-resolution services across every claim type.
              </p>
            </div>
            <Link
              href="/services"
              className="inline-flex items-center h-11 px-6 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors shrink-0"
            >
              View all services →
            </Link>
          </div>
        </Container>
      </section>

      <section className="py-20 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-2xl mx-auto">
            {result ? (
              <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-8 text-center">
                <div className="text-2xl font-bold tracking-tight text-[color:var(--color-ink)]">Thanks, we got your claim.</div>
                {result.maNumber && (
                  <p className="mt-3 text-base text-[color:var(--color-ink-muted)]">
                    Reference number: <span className="font-semibold text-[color:var(--color-accent)]">MA #{result.maNumber}</span>
                  </p>
                )}
                <p className="mt-3 text-base text-[color:var(--color-ink-muted)]">
                  A member of our team will reach out within one business day with next steps, timeline, and a fee quote.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                  <Link href="/" className="inline-flex items-center h-11 px-5 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Back to home</Link>
                  <Link href="/contact" className="inline-flex items-center h-11 px-5 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Contact us</Link>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-[color:var(--color-ink)]">Claim details</h2>
                <p className="text-sm text-[color:var(--color-ink-muted)] mb-8">
                  Fill in the details below. Attach any assignment sheets, estimates, or damage photos and we&apos;ll have them queued on the claim when it lands.
                </p>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Field label="Your name"                   name="name"             required />
                  <Field label="Company / firm"              name="company"          />
                  <Field label="Insurance company"           name="insuranceCompany" />
                  <Field label="Email"                       name="email"            type="email" required />
                  <Field label="Phone"                       name="phone"            type="tel" />
                  <Field label="Claim #"                     name="claim"            />
                  <Field label="Insured / claimant name"     name="insured"          />
                  <Field label="Vehicle (year, make, model)" name="vehicle"          />
                  <div>
                    <label className="block">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
                        VIN *
                      </span>
                      <input
                        type="text"
                        name="vin"
                        value={vin}
                        onChange={e => setVin(e.target.value.toUpperCase())}
                        required={!specialty}
                        maxLength={17}
                        pattern={specialty ? undefined : '[A-HJ-NPR-Z0-9]{17}'}
                        title={specialty ? 'Any VIN length accepted for specialty vehicles' : 'VIN must be exactly 17 characters (A-Z, 0-9; no I, O, Q)'}
                        className={`w-full h-11 px-3 bg-[color:var(--color-bg-elevated)] border rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 ${vinInvalid ? 'border-red-500/60' : 'border-[color:var(--color-border)] focus:border-[color:var(--color-accent)]'}`}
                      />
                      {vinInvalid && (
                        <p className="mt-1 text-xs text-red-300">VIN must be exactly 17 characters — currently {vin.length}.</p>
                      )}
                    </label>
                    <label className="mt-2 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="specialty"
                        checked={specialty}
                        onChange={e => setSpecialty(e.target.checked)}
                        className="h-4 w-4 rounded-sm accent-[color:var(--color-accent)]"
                      />
                      <span className="text-xs text-[color:var(--color-ink-muted)]">
                        Classic or specialty vehicle (VIN may be shorter than 17 characters)
                      </span>
                    </label>
                  </div>
                  <Field label="Date of loss"                name="dateOfLoss"       type="date" min="1900-01-01" max="2099-12-31" />
                  <SelectField
                    label="Service requested"
                    name="service"
                    options={SERVICES}
                    required
                  />
                  <TextareaField label="Claim context / what you need" name="message" required />

                  {/* File picker */}
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
                      Attach files (optional)
                    </span>
                    <label className="block cursor-pointer">
                      <input
                        type="file"
                        name="documents"
                        multiple
                        accept={ACCEPT}
                        onChange={handleFiles}
                        className="block w-full text-sm text-[color:var(--color-ink-muted)] file:mr-4 file:py-2.5 file:px-5 file:rounded-sm file:border-2 file:border-[color:var(--color-accent)] file:text-sm file:font-semibold file:bg-transparent file:text-[color:var(--color-accent)] hover:file:bg-[color:var(--color-accent)] hover:file:text-white file:transition-colors file:cursor-pointer"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-[color:var(--color-ink-soft)]">
                      PDFs, photos, Word, Excel, text. Up to {MAX_FILES} files, {MAX_FILE_BYTES / 1024 / 1024} MB each, {MAX_TOTAL_BYTES / 1024 / 1024} MB total.
                    </p>
                    {files.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {files.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm px-3 py-2 text-sm">
                            <span className="truncate text-[color:var(--color-ink)]">{f.name}</span>
                            <span className="shrink-0 text-xs text-[color:var(--color-ink-soft)] tabular-nums">{formatBytes(f.size)}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="shrink-0 text-xs font-semibold text-[color:var(--color-ink-soft)] hover:text-red-400"
                              aria-label={`Remove ${f.name}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(filesTooBig || tooManyFiles) && (
                      <p className="mt-2 text-xs text-red-300">
                        {tooManyFiles ? `Too many files (max ${MAX_FILES}).` : `Total upload exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB.`}
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {error}
                    </div>
                  )}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={busy || vinInvalid || filesTooBig || tooManyFiles}
                      className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy ? 'Submitting…' : 'Submit Claim'}
                    </button>
                  </div>
                </form>

                <p className="mt-8 text-sm text-[color:var(--color-ink-muted)] text-center">
                  Prefer to talk?{' '}
                  <a href="tel:+17023215930" className="font-semibold text-[color:var(--color-accent)] hover:underline">(702) 321-5930</a>{' '}
                  or email{' '}
                  <a href="mailto:info@modernappraisers.com" className="font-semibold text-[color:var(--color-accent)] hover:underline">info@modernappraisers.com</a>.
                </p>
              </>
            )}
          </div>
        </Container>
      </section>

      <section className="py-16 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-base text-[color:var(--color-ink-muted)]">
              Need to check on an existing claim?{' '}
              <Link href="/contact" className="font-semibold text-[color:var(--color-accent)] hover:underline">Contact our team.</Link>
            </p>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Field({ label, name, type = 'text', required = false, min, max }: { label: string; name: string; type?: string; required?: boolean; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}{required && ' *'}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        min={min}
        max={max}
        className="w-full h-11 px-3 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      />
    </label>
  )
}

function SelectField({ label, name, options, required = false }: { label: string; name: string; options: string[]; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-muted)] mb-2">
        {label}{required && ' *'}
      </span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full h-11 px-3 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
      >
        <option value="" disabled>Select a service…</option>
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
