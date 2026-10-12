import Link from 'next/link'
import { Container } from './container'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[color:var(--color-border)] py-10">
      <Container className="flex flex-wrap items-center justify-between gap-6 text-sm text-[color:var(--color-ink-soft)]">
        <div>© {new Date().getFullYear()} Modern Appraisers. Independent vehicle appraisals since 1999.</div>
        <nav className="flex items-center gap-6">
          <Link href="/services" className="hover:text-[color:var(--color-ink)]">Services</Link>
          <Link href="/about" className="hover:text-[color:var(--color-ink)]">About</Link>
          <Link href="/contact" className="hover:text-[color:var(--color-ink)]">Contact</Link>
          <Link href="/login" className="hover:text-[color:var(--color-ink)]">Sign in</Link>
        </nav>
      </Container>
    </footer>
  )
}
