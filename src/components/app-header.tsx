"use client"

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronDown, User as UserIcon, Settings } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'All Claims', href: '/claims' },
  { label: 'Reports', href: '/reports' },
  { label: 'Rules / Laws', href: '/rules-laws' },
]

export function AppHeader() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const displayLabel = profile?.name || profile?.email || ''

  return (
    <header className="no-print border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
        <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" priority /></Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/'
              ? pathname === '/' || pathname.startsWith('/claims/')
              : item.href === '/claims'
              ? pathname === '/claims'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
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
