"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Database, BookOpen, DollarSign, ShieldCheck, Tag, Activity, Timer, Scale, BarChart3, Ticket, Mail, Wrench, Calculator, TrendingUp, Briefcase } from 'lucide-react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

// Admin section — order per Henry 2026-10-12. Visible to every admin.
const ADMIN_SECTIONS = [
  { href: '/admin/settings/users',                label: 'Users',                Icon: Users },
  { href: '/admin/settings/clients',              label: 'Clients',              Icon: Briefcase },
  { href: '/admin/settings/opposing-appraisers',  label: 'Opposing Appraisers',  Icon: Scale },
  { href: '/admin/settings/notifications',        label: 'Notifications',        Icon: Mail },
  { href: '/admin/settings/guidelines',           label: 'Guidelines',           Icon: BookOpen },
  { href: '/admin/settings/settlement-analytics', label: 'Settlement Analytics', Icon: TrendingUp },
  { href: '/admin/settings/tools',                label: 'Tool Settings',        Icon: Wrench },
  { href: '/admin/settings/status-phases',        label: 'Status Phases',        Icon: Tag },
  { href: '/admin/settings/licensed-states',      label: 'Licensed States',      Icon: ShieldCheck },
  { href: '/admin/settings/fee-catalog',          label: 'Fee Catalog',          Icon: DollarSign },
  { href: '/admin/settings/cycle-times',          label: 'Cycle Times',          Icon: Timer },
  { href: '/admin/settings/data-reports',         label: 'Data Reports',         Icon: BarChart3 },
  { href: '/admin/settings/data',                 label: 'Data',                 Icon: Database },
]

// Super Admin section — rendered under its own eyebrow heading when the
// current profile is super-admin. Hidden entirely otherwise.
const SUPER_ADMIN_SECTIONS = [
  { href: '/admin/settings/accounting', label: 'Accounting', Icon: Calculator },
  { href: '/admin/settings/activity',   label: 'Activity',   Icon: Activity },
  { href: '/admin/settings/tickets',    label: 'Tickets',    Icon: Ticket },
]

export function SettingsNav() {
  const pathname = usePathname()
  const { profile } = useCurrentProfile()
  const isSuperAdmin = profile?.isSuperAdmin === true

  const renderLink = ({ href, label, Icon }: { href: string; label: string; Icon: typeof Users }) => {
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
  }

  return (
    <nav className="w-56 shrink-0">
      <div className="hp-eyebrow mb-3 px-3">Settings</div>
      <ul className="space-y-0.5">
        {ADMIN_SECTIONS.map(renderLink)}
      </ul>

      {isSuperAdmin && (
        <>
          <div className="hp-eyebrow mt-6 mb-3 px-3 text-amber-700">Super Admin</div>
          <ul className="space-y-0.5">
            {SUPER_ADMIN_SECTIONS.map(renderLink)}
          </ul>
        </>
      )}
    </nav>
  )
}
