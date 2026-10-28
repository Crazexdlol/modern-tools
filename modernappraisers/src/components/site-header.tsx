'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Container } from './container'
import { StateMegaMenu } from './states/state-mega-menu'
import { StateMobileMenu } from './states/state-mobile-menu'

// Site-wide top nav. Desktop: inline links + Submit a Claim CTA.
// Mobile (< lg): hamburger button that opens a full-height drawer with the
// same links. Drawer closes on route change and on Escape.

// Nav items BEFORE the States We Serve mega-menu, in the order they render.
const NAV_LINKS_LEFT = [
  { href: '/',           label: 'Home' },
  { href: '/about',      label: 'About Us' },
  { href: '/services',   label: 'Services' },
]
// Nav items AFTER the States We Serve mega-menu.
const NAV_LINKS_RIGHT = [
  { href: '/vehicles',   label: 'Property Types' },
  { href: '/faq',        label: 'FAQ' },
  { href: '/contact',    label: 'Contact Us' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close the drawer whenever the route changes (user clicked a link).
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock body scroll while the drawer is open so background doesn't scroll
  // underneath it, and close on Escape.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-30 bg-[color:var(--color-bg)]/95 backdrop-blur-sm border-b border-[color:var(--color-border)]">
        <Container className="h-16 lg:h-24 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center shrink-0" aria-label="Modern Appraisers home">
            <Image
              src="/logo-ma.png"
              alt="Modern Appraisers"
              width={1983}
              height={793}
              priority
              className="h-14 lg:h-24 w-auto"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[color:var(--color-ink-muted)]">
            {NAV_LINKS_LEFT.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-[color:var(--color-accent)]">{l.label}</Link>
            ))}
            <StateMegaMenu />
            {NAV_LINKS_RIGHT.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-[color:var(--color-accent)]">{l.label}</Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/submitaclaim"
              className="hidden sm:inline-flex items-center h-10 px-4 lg:px-5 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors"
            >
              Submit a Claim
            </Link>

            {/* Hamburger — hidden on lg+ where the inline nav is visible */}
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-sm text-[color:var(--color-ink)] hover:text-[color:var(--color-accent)]"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </Container>
      </header>

      {/* Mobile drawer — rendered as a sibling of <header> (not inside it) so
          the sticky header's stacking context doesn't trap it below sibling
          page content on iOS Safari. z-50 keeps it above everything. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-[color:var(--color-bg)] flex flex-col">
          <div className="h-16 shrink-0 border-b border-[color:var(--color-border)] flex items-center justify-between px-5">
            <Link href="/" className="flex items-center shrink-0" aria-label="Modern Appraisers home">
              <Image
                src="/logo-ma.png"
                alt="Modern Appraisers"
                width={1983}
                height={793}
                className="h-14 w-auto"
              />
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-sm text-[color:var(--color-ink)] hover:text-[color:var(--color-accent)]"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-5 py-8 flex flex-col gap-1 text-xl font-semibold text-[color:var(--color-ink)]">
            {NAV_LINKS_LEFT.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="py-3 border-b border-[color:var(--color-border)] hover:text-[color:var(--color-accent)]"
              >
                {l.label}
              </Link>
            ))}
            <div className="py-3 border-b border-[color:var(--color-border)]">
              <StateMobileMenu onNavigate={() => setOpen(false)} />
            </div>
            {NAV_LINKS_RIGHT.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="py-3 border-b border-[color:var(--color-border)] hover:text-[color:var(--color-accent)]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/submitaclaim"
              className="mt-6 inline-flex items-center justify-center h-12 rounded-sm bg-[color:var(--color-accent)] text-white text-base font-semibold hover:bg-[color:var(--color-accent-ink)]"
            >
              Submit a Claim
            </Link>
            <a
              href="tel:+17023215930"
              className="mt-3 text-center text-sm text-[color:var(--color-ink-muted)]"
            >
              Or call <span className="font-semibold text-[color:var(--color-accent)]">(702) 321-5930</span>
            </a>
          </nav>
        </div>
      )}
    </>
  )
}
