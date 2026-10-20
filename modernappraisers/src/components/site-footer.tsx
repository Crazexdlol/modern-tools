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
