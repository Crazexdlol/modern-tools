"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Database, BookOpen, DollarSign } from 'lucide-react'

const SECTIONS = [
  { href: '/admin/settings/users',       label: 'Users',       Icon: Users },
  { href: '/admin/settings/fee-catalog', label: 'Fee Catalog', Icon: DollarSign },
  { href: '/admin/settings/guidelines',  label: 'Guidelines',  Icon: BookOpen },
  { href: '/admin/settings/data',        label: 'Data',        Icon: Database },
]

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav className="w-56 shrink-0">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
        Settings
      </div>
      <ul className="space-y-1">
        {SECTIONS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
