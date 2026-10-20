"use client"

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronDown, User as UserIcon, Settings, Lock } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { fetchDueForRemarketingCount } from '@/lib/supabase/clients'
import { useActiveCompany } from '@/hooks/use-active-company'
import { CompanySwitcher } from '@/components/company-switcher'
import { RemindersHeaderButton } from '@/components/reminders/reminders-header-button'
import { ClaimSearchButton } from '@/components/claim-search-button'

interface NavItem {
  label: string
  href: string
  marketingOnly?: boolean
  negotiationsOnly?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Closed Claims', href: '/claims', adminOnly: true },
  { label: 'Reports', href: '/reports' },
  { label: 'Rules / Laws', href: '/rules-laws' },
  { label: 'Marketing', href: '/marketing', marketingOnly: true },
  { label: 'Negotiations', href: '/negotiations', negotiationsOnly: true },
]

// `locked` renders the same chrome (logo, nav labels, user menu) but every
// nav tab is inert with a lock icon, and the action widgets on the right
// (company switcher, reminders bell, claim search) are suppressed. Used by
// the status-request lockout gate so the user sees the familiar app shell
// but can only click Logout / their profile dropdown.
export function AppHeader({ locked = false }: { locked?: boolean } = {}) {
  const pathname = usePathname()
  // When the user opens a claim from the Closed Claims list, the link carries
  // `?from=closed` so the top-nav highlight stays on "Closed Claims" instead
  // of defaulting to Dashboard. Read it from window.location on the client
  // rather than via useSearchParams() — the hook requires a Suspense boundary
  // during static prerender, and AppHeader is embedded in statically-rendered
  // pages like /claims. The ClaimWorkspace's URL sync preserves existing
  // query params when it writes `?tab=`, so this survives tab clicks + reload.
  const [fromClosedList, setFromClosedList] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setFromClosedList(pathname.startsWith('/claims/') && params.get('from') === 'closed')
  }, [pathname])
  const { profile, loading: profileLoading } = useCurrentProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [dueCount, setDueCount] = useState<number>(0)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Fetch due-count once the marketing_access profile flag is known. Non-marketing
  // callers get 0 back thanks to RLS + graceful fallback.
  useEffect(() => {
    if (!profile) return
    if (profile.marketingAccess !== true) { setDueCount(0); return }
    fetchDueForRemarketingCount().then(setDueCount)
  }, [profile?.id, profile?.marketingAccess])

  const displayLabel = profile?.name || profile?.email || ''
  const { activeCompany, loading: companyLoading } = useActiveCompany()
  // Header uses the -on-dark variant of the logo (white/light elements so the
  // dark bg-gray-950 header renders it cleanly). Each company ships a
  // logo-on-dark.png next to logo.png; the derived path just swaps the suffix.
  const headerLogoPath = activeCompany
    ? activeCompany.logoPath.replace(/\.png$/, '-on-dark.png')
    : null
  const headerCompanyName = activeCompany?.name ?? ''

  // Hold the dynamic header content (logo, nav items gated by role, user
  // menu) until BOTH profile and company have resolved. Otherwise refresh
  // shows a staggered pop-in: logo placeholder → logo, then gated nav items
  // appear one tick later. One readiness gate = one synchronized reveal.
  const headerReady = !profileLoading && !companyLoading

  return (
    <header className="no-print bg-slate-950 sticky top-0 z-30">
      <div className="mx-auto px-6 h-16 max-w-[1920px] flex items-center gap-10">
        {headerReady && headerLogoPath ? (
          locked ? (
            <div className="shrink-0" aria-label={headerCompanyName}>
              <Image src={headerLogoPath} alt={headerCompanyName} width={200} height={56} className="h-10 w-auto" priority />
            </div>
          ) : (
            <Link href="/" className="shrink-0" aria-label={`${headerCompanyName} home`}>
              <Image src={headerLogoPath} alt={headerCompanyName} width={200} height={56} className="h-10 w-auto" priority />
            </Link>
          )
        ) : (
          <div className="h-10 w-40" aria-hidden />
        )}
        <nav className="flex items-center gap-1">
          {headerReady && NAV_ITEMS.map(item => {
            if (item.marketingOnly && profile?.marketingAccess !== true) return null
            if (item.negotiationsOnly && profile?.negotiationsAccess !== true) return null
            if (item.adminOnly && profile?.role !== 'admin') return null
            if (locked) {
              return (
                <span
                  key={item.href}
                  title="Locked — post a status update to restore access"
                  className="relative inline-flex items-center gap-1.5 h-16 px-3.5 text-[14.5px] font-medium text-slate-600 cursor-not-allowed select-none"
                  aria-disabled="true"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden />
                  {item.label}
                </span>
              )
            }
            const active = item.href === '/'
              ? (pathname === '/' || pathname.startsWith('/claims/')) && !fromClosedList
              : item.href === '/claims'
              ? pathname === '/claims' || fromClosedList
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative inline-flex items-center gap-1.5 h-16 px-3.5 text-[14.5px] font-medium transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
                {item.marketingOnly && dueCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums" title={`${dueCount} client${dueCount === 1 ? '' : 's'} due for remarketing`}>
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white rounded-full" aria-hidden />
                )}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {headerReady && (
            <>
              {!locked && <CompanySwitcher />}
              {!locked && <RemindersHeaderButton />}
              {!locked && <ClaimSearchButton />}
              {displayLabel ? (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="group inline-flex items-center gap-2 h-9 px-3 rounded-md text-[13.5px] font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-slate-200 text-[12px] font-semibold">
                      {(profile?.name || profile?.email || '?').trim().split(/\s+/).map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('') || '?'}
                    </span>
                    <span className="hidden sm:inline">{displayLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                  </button>
                  {menuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl py-1.5 z-20 ring-1 ring-slate-200"
                      style={{ boxShadow: 'var(--hp-elev-pop)' }}
                    >
                      <Link href="/my-profile" onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
                        <UserIcon className="w-4 h-4 text-slate-500" /> My Profile
                      </Link>
                      {profile?.role === 'admin' && (
                        <Link href="/admin/settings" onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
                          <Settings className="w-4 h-4 text-slate-500" /> Settings
                        </Link>
                      )}
                      <div className="border-t border-slate-100 my-1.5" />
                      <div className="px-2 pb-1">
                        <LogoutButton />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <LogoutButton />
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
