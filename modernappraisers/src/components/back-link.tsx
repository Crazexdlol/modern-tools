import Link from 'next/link'

// Small back-nav link at the top of each service detail page. Default
// target is /services (the hub); callers can override with `href` + `label`
// for other return paths (e.g., RTA sub-services back to /righttoappraisal).

export function BackLink({
  href = '/services',
  label = 'Back to Services',
}: {
  href?: string
  label?: string
}) {
  return (
    <div className="pt-6 pb-2">
      <Link
        href={href}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-accent)] transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {label}
      </Link>
    </div>
  )
}
