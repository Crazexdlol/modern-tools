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

// Tailwind color map — same palette family as the dashboard_configs seed.
// Keys are the color names in dashboard_configs.color.
const COLOR_ACTIVE: Record<string, string> = {
  slate:  'border-slate-900 text-slate-900 bg-white',
  blue:   'border-blue-700 text-blue-700 bg-white',
  amber:  'border-amber-700 text-amber-700 bg-white',
  purple: 'border-purple-700 text-purple-700 bg-white',
  green:  'border-emerald-700 text-emerald-700 bg-white',
}
const COLOR_INACTIVE_ASSIGNED = 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
const COLOR_INACTIVE_UNASSIGNED = 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'

/**
 * Dashboard workflow tabs. Rendered above the ClaimsTable, aligned with the
 * MA# column. Each tab shows the stage label + a count badge.
 *
 * Rules:
 *   - Appraisers see only tabs in `assignedCodes`. Others are hidden entirely.
 *   - Admins see all 5 tabs. Unassigned ones are dimmed (muted text, lighter
 *     count badge). Clicking a dimmed tab still works + a "View only" chip
 *     appears next to the active tab label so Henry knows he's peeking.
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
      <div className="mb-3 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-2 bg-white">
        No dashboards assigned. Ask an admin to grant access.
      </div>
    )
  }

  const activeIsUnassigned = isAdmin && !assignedCodes.has(activeTab)

  return (
    <div className="mb-3 flex items-center gap-2 overflow-x-auto">
      <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
        {visible.map(d => {
          const isActive = d.code === activeTab
          const isAssigned = assignedCodes.has(d.code)
          const base = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition border-b-2'
          const cls = isActive
            ? (COLOR_ACTIVE[d.color] ?? COLOR_ACTIVE.slate)
            : (isAssigned ? COLOR_INACTIVE_ASSIGNED : COLOR_INACTIVE_UNASSIGNED)
          const count = countsByCode[d.code] ?? 0
          return (
            <button
              key={d.code}
              type="button"
              onClick={() => onTabChange(d.code)}
              className={`${base} ${cls}`}
              title={d.description ?? d.label}
            >
              <span>{d.label}</span>
              {count > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-gray-900 text-white' : (isAssigned ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400')
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>
      {activeIsUnassigned && (
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 border border-gray-200 rounded-md px-2 py-1 bg-gray-50">
          View only
        </span>
      )}
    </div>
  )
}
