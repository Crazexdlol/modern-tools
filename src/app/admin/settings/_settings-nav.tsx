"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Database, BookOpen, DollarSign, ShieldCheck, Tag, Activity, HelpCircle, Timer, Scale } from 'lucide-react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const SECTIONS = [
  { href: '/admin/settings/users',           label: 'Users',            Icon: Users,        superAdminOnly: false },
  { href: '/admin/settings/fee-catalog',     label: 'Fee Catalog',      Icon: DollarSign,   superAdminOnly: false },
  { href: '/admin/settings/status-phases',   label: 'Status Phases',    Icon: Tag,          superAdminOnly: false },
  { href: '/admin/settings/licensed-states', label: 'Licensed States',  Icon: ShieldCheck,  superAdminOnly: false },
  { href: '/admin/settings/guidelines',           label: 'Guidelines',           Icon: BookOpen,  superAdminOnly: false },
  { href: '/admin/settings/opposing-appraisers', label: 'Opposing Appraisers',  Icon: Scale,     superAdminOnly: false },
  { href: '/admin/settings/cycle-times',          label: 'Cycle Times',          Icon: Timer,     superAdminOnly: false },
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
      <div className="hp-eyebrow mb-3 px-3">Settings</div>
      <ul className="space-y-0.5">
        {visible.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] transition-colors ${
                  active
                    ? 'bg-slate-200 text-slate-900 font-semibold ring-1 ring-slate-300 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-slate-700' : 'text-slate-400'}`} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
