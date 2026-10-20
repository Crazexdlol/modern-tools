import Link from 'next/link'
import { Container } from './container'

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-[color:var(--color-bg-subtle)] text-[color:var(--color-ink)] pt-14 pb-8 border-t border-[color:var(--color-border)]">
      <Container>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          <div>
            <div className="font-bold text-xl tracking-tight text-[color:var(--color-ink)] mb-3">Modern Appraisers</div>
            <p className="text-sm text-[color:var(--color-ink-muted)] max-w-sm leading-relaxed">
              Independent third-party vehicle appraisal firm. Documented, defensible valuations and dispute-resolution services across every claim type, backed by 27+ years of appraisal experience.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-3">Services</div>
            <ul className="space-y-2 text-sm text-[color:var(--color-ink-muted)]">
              <li><Link href="/actualcashvalue" className="hover:text-[color:var(--color-accent)]">Actual Cash Value</Link></li>
              <li><Link href="/diminishedvalue" className="hover:text-[color:var(--color-accent)]">Diminished Value</Link></li>
              <li><Link href="/services" className="hover:text-[color:var(--color-accent)]">All Services</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-3">Contact</div>
            <ul className="space-y-2 text-sm text-[color:var(--color-ink-muted)]">
              <li><a href="tel:+17023215930" className="hover:text-[color:var(--color-accent)]">(702) 321-5930</a></li>
              <li><a href="mailto:info@modernappraisers.com" className="hover:text-[color:var(--color-accent)]">info@modernappraisers.com</a></li>
            </ul>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://www.instagram.com/modernappraisers/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Modern Appraisers on Instagram"
                className="inline-flex items-center justify-center w-9 h-9 rounded-sm border border-[color:var(--color-border)] text-[color:var(--color-ink-muted)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] transition-colors"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.5 1 .5.5.8.9 1 1.5.2.4.4 1 .4 2.2.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-1 1.5-.5.5-.9.8-1.5 1-.4.2-1 .4-2.2.4-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.5-1-.5-.5-.8-.9-1-1.5-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.3-1.8.4-2.2.2-.6.5-1 1-1.5.5-.5.9-.8 1.5-1 .4-.2 1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1zm0 2c-3.2 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.4-.6.8-.8 1.2-.1.4-.3 1-.4 2.1C2.7 10 2.7 10.3 2.7 12s0 2 .1 3.2c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.4.4.8.6 1.2.8.4.2 1 .3 2.1.4 1.2.1 1.5.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.4.6-.8.8-1.2.2-.4.3-1 .4-2.1.1-1.2.1-1.5.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.2-.4-.4-.8-.6-1.2-.8-.4-.2-1-.3-2.1-.4-1.2-.1-1.5-.1-4.7-.1zM12 6.9a5.1 5.1 0 110 10.2 5.1 5.1 0 010-10.2zm0 2a3.1 3.1 0 100 6.2 3.1 3.1 0 000-6.2zm5.3-3.4a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"/>
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/modernappraisers"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Modern Appraisers on LinkedIn"
                className="inline-flex items-center justify-center w-9 h-9 rounded-sm border border-[color:var(--color-border)] text-[color:var(--color-ink-muted)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] transition-colors"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3v9zM6.5 8.3a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5zM19 19h-3v-4.5c0-1.1 0-2.5-1.5-2.5s-1.75 1.2-1.75 2.4V19H9.75v-9h2.9v1.2h.05A3.2 3.2 0 0115.5 9.7c3.1 0 3.5 2 3.5 4.6V19z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-[color:var(--color-border)] flex flex-wrap items-center justify-between gap-4 text-xs text-[color:var(--color-ink-soft)]">
          <div>Copyright © {new Date().getFullYear()} Modern Appraisers is part of Modern Group LLC.</div>
          <nav className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-[color:var(--color-accent)]">Terms of Service</Link>
            <Link href="/privacy-policy" className="hover:text-[color:var(--color-accent)]">Privacy Policy</Link>
            <Link href="/fulfillment-policy" className="hover:text-[color:var(--color-accent)]">Fulfillment Policy</Link>
          </nav>
        </div>
      </Container>
    </footer>
  )
}
