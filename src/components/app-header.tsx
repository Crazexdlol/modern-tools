"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'All Claims', href: '/claims' },
  { label: 'Reports', href: '/reports' },
  { label: 'Rules / Laws', href: '/rules-laws' },
]

export function AppHeader() {
  const pathname = usePathname()
  // Show who is signed in — claims are shared team-wide, so it matters.
  const [userEmail, setUserEmail] = useState<string | null>(null)
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  return (
    <header className="no-print border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
        <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" priority /></Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            // '/claims' (All Claims list) and '/claims/[id]' (workspace) are
            // distinct: an open workspace highlights Dashboard.
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
        <div className="ml-auto flex items-center gap-4">
          {userEmail && <span className="text-xs text-gray-500">{userEmail}</span>}
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
