"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Database, BookOpen, DollarSign, ShieldCheck, Tag, Activity, HelpCircle } from 'lucide-react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const SECTIONS = [
  { href: '/admin/settings/users',           label: 'Users',            Icon: Users,        superAdminOnly: false },
  { href: '/admin/settings/fee-catalog',     label: 'Fee Catalog',      Icon: DollarSign,   superAdminOnly: false },
  { href: '/admin/settings/status-phases',   label: 'Status Phases',    Icon: Tag,          superAdminOnly: false },
  { href: '/admin/settings/licensed-states', label: 'Licensed States',  Icon: ShieldCheck,  superAdminOnly: false },
  { href: '/admin/settings/guidelines',      label: 'Guidelines',       Icon: BookOpen,     superAdminOnly: false },
  { href: '/admin/settings/help',            label: 'Help Articles',    Icon: HelpCircle,   superAdminOnly: true  },
  { href: '/admin/settings/data',            label: 'Data',             Icon: Database,     superAdminOnly: false },
  { href: '/admin/settings/activity',        label: 'Activity',         Icon: Activity,     superAdminOnly: true  },
]

export function SettingsNav() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
  const visible = SECTIONS.filter(s => !s.superAdminOnly || profile?.isSuperAdmin === true)
  return (
    <nav className="w-56 shrink-0">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
        Settings
      </div>
      <ul className="space-y-1">
        {visible.map(({ href, label, Icon }) => {
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
