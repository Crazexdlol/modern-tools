'use client'

import type { DashboardCode, DashboardConfig } from '@/hooks/use-user-dashboards'

interface Props {
  dashboards: DashboardConfig[]           // all 5 stages, sorted
  assignedCodes: Set<DashboardCode>       // the subset granted to this user
  activeTab: DashboardCode
  isAdmin: boolean
  countsByCode: Record<DashboardCode, number>
  onTabChange: (code: DashboardCode) => void
}

// Each stage gets a tiny colored dot so you can glance-identify them without
// the whole pill being tinted. Keeps the active-pill style clean (one color).
const DOT_COLOR: Record<string, string> = {
  slate:  'bg-slate-400',
  blue:   'bg-blue-500',
  amber:  'bg-amber-500',
  purple: 'bg-purple-500',
  green:  'bg-emerald-500',
}

/**
 * Dashboard workflow tabs — pill bar above the ClaimsTable.
 *
 * Visual spec:
 *   - Active tab: dark gray-900 filled pill, white text, white count badge.
 *   - Assigned, inactive: transparent, gray text, light-gray count badge.
 *   - Unassigned (admin only): same shape but with muted text + badge, plus
 *     a small "View only" tag next to the tab bar.
 *   - Count badges are ALWAYS rendered (even at 0) so pill widths stay even.
 *   - A colored dot in front of each label makes the stage glanceable.
 */
export function DashboardTabs({
  dashboards,
  assignedCodes,
  activeTab,
  isAdmin,
  countsByCode,
  onTabChange,
}: Props) {
  const visible = isAdmin ? dashboards : dashboards.filter(d => assignedCodes.has(d.code))
  if (visible.length === 0) {
    return (
      <div className="mb-3 text-sm text-gray-500 border border-gray-200 rounded-xl px-4 py-3 bg-white">
        No dashboards assigned. Ask an admin to grant access.
      </div>
    )
  }
  const activeIsUnassigned = isAdmin && !assignedCodes.has(activeTab)

  return (
    <div className="mb-4 flex items-center gap-3 flex-wrap">
      <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
        {visible.map(d => {
          const isActive = d.code === activeTab
          const isAssigned = assignedCodes.has(d.code)
          const count = countsByCode[d.code] ?? 0
          const dot = DOT_COLOR[d.color] ?? DOT_COLOR.slate

          const pillCls = isActive
            ? 'bg-gray-900 text-white'
            : (isAssigned
              ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50')
          const badgeCls = isActive
            ? 'bg-white/15 text-white'
            : (isAssigned
              ? 'bg-gray-100 text-gray-700'
              : 'bg-gray-50 text-gray-400')
          const dotCls = isActive ? 'bg-white/70' : dot

          return (
            <button
              key={d.code}
              type="button"
              onClick={() => onTabChange(d.code)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${pillCls}`}
              title={d.description ?? d.label}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} aria-hidden />
              <span>{d.label}</span>
              <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${badgeCls}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
      {activeIsUnassigned && (
        <span className="inline-flex items-center text-[11px] uppercase tracking-wider font-semibold text-gray-500 border border-gray-200 rounded-md px-2 py-1 bg-gray-50">
          View only
        </span>
      )}
    </div>
  )
}
