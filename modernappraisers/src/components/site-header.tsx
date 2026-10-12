import Link from 'next/link'
import { Container } from './container'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-[color:var(--color-border)]">
      <Container className="h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-base tracking-tight text-[color:var(--color-ink)]">
          Modern Appraisers
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[color:var(--color-ink-muted)]">
          <Link href="/services" className="hover:text-[color:var(--color-ink)]">Services</Link>
          <Link href="/about" className="hover:text-[color:var(--color-ink)]">About</Link>
          <Link href="/contact" className="hover:text-[color:var(--color-ink)]">Contact</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">
            Sign in
          </Link>
          <Link href="/submit" className="inline-flex items-center h-9 px-4 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">
            Submit a Claim
          </Link>
        </div>
      </Container>
    </header>
  )
}
