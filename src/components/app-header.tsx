"use client"

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronDown, User as UserIcon, Settings } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { fetchDueForRemarketingCount } from '@/lib/supabase/clients'
import { useActiveCompany } from '@/hooks/use-active-company'
import { CompanySwitcher } from '@/components/company-switcher'

interface NavItem {
  label: string
  href: string
  marketingOnly?: boolean
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'All Claims', href: '/claims', adminOnly: true },
  { label: 'Reports', href: '/reports' },
  { label: 'Rules / Laws', href: '/rules-laws' },
  { label: 'Marketing', href: '/marketing', marketingOnly: true },
  { label: 'Help', href: '/help' },
]

export function AppHeader() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
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
  const { activeCompany } = useActiveCompany()
  // Header uses the -on-dark variant of the logo (white/light elements so the
  // dark bg-gray-950 header renders it cleanly). Each company ships a
  // logo-on-dark.png next to logo.png; the derived path just swaps the suffix.
  const baseLogoPath = activeCompany?.logoPath ?? '/companies/modern-appraisers/logo.png'
  const headerLogoPath = baseLogoPath.replace(/\.png$/, '-on-dark.png')
  const headerCompanyName = activeCompany?.name ?? 'Modern Appraisers'

  return (
    <header className="no-print border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
        <Link href="/"><Image src={headerLogoPath} alt={headerCompanyName} width={160} height={48} className="h-9 w-auto" priority /></Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            // Marketing tab is flag-only — admin role does NOT grant implicit
            // access. Enforced server-side by RLS + the /marketing page guard;
            // this just hides the link when the flag is off.
            if (item.marketingOnly && profile?.marketingAccess !== true) {
              return null
            }
            // All Claims is admin-only — appraisers only see their assigned
            // claims via the Dashboard. Route also self-redirects (see
            // src/app/claims/page.tsx) as a defence-in-depth.
            if (item.adminOnly && profile?.role !== 'admin') {
              return null
            }
            const active = item.href === '/'
              ? pathname === '/' || pathname.startsWith('/claims/')
              : item.href === '/claims'
              ? pathname === '/claims'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {item.label}
                {item.marketingOnly && dueCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold" title={`${dueCount} client${dueCount === 1 ? '' : 's'} due for remarketing`}>
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CompanySwitcher />
          {displayLabel && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
              >
                {displayLabel}
                <ChevronDown className="w-3 h-3" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                  <Link href="/my-profile" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    <UserIcon className="w-4 h-4" /> My Profile
                  </Link>
                  <Link href="/profile" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    <Settings className="w-4 h-4" /> Account &amp; Password
                  </Link>
                  {profile?.role === 'admin' && (
                    <Link href="/admin/settings" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  )}
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1">
                    <LogoutButton />
                  </div>
                </div>
              )}
            </div>
          )}
          {!displayLabel && <LogoutButton />}
        </div>
      </div>
    </header>
  )
}
