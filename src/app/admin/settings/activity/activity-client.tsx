'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatHoursMinutes, formatRelativeTime } from '@/lib/activity/formatters'

interface SummaryUser {
  userId: string
  name: string
  email: string
  isActive: boolean
  today: number
  thisWeek: number
  thisMonth: number
  last6Months: number
  lastActiveAt: string | null
}

type SortKey = 'name' | 'today' | 'thisWeek' | 'thisMonth' | 'last6Months' | 'lastActiveAt'

export function ActivityClient() {
  const [users, setUsers] = useState<SummaryUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    fetch('/api/activity/summary')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: { users: SummaryUser[] }) => {
        if (!cancelled) setUsers(body.users)
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'Failed to load')
      })
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(() => {
    if (!users) return null
    const filtered = showInactive ? users : users.filter(u => u.isActive)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'lastActiveAt') {
        if (a.lastActiveAt && b.lastActiveAt) return a.lastActiveAt.localeCompare(b.lastActiveAt) * dir
        if (a.lastActiveAt) return -1 * dir
        if (b.lastActiveAt) return 1 * dir
        return 0
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
    })
  }, [users, showInactive, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Show inactive users
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
          Failed to load activity: {error}
        </div>
      )}

      {!users && !error && (
        <div className="text-sm text-gray-500">Loading…</div>
      )}

      {sorted && (
        <div className="overflow-x-auto border border-gray-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <Th onClick={() => toggleSort('name')}>User{arrow('name')}</Th>
                <Th onClick={() => toggleSort('today')} align="right">Today{arrow('today')}</Th>
                <Th onClick={() => toggleSort('thisWeek')} align="right">This Week{arrow('thisWeek')}</Th>
                <Th onClick={() => toggleSort('thisMonth')} align="right">This Month{arrow('thisMonth')}</Th>
                <Th onClick={() => toggleSort('last6Months')} align="right">Last 6 Months{arrow('last6Months')}</Th>
                <Th onClick={() => toggleSort('lastActiveAt')} align="right">Last Active{arrow('lastActiveAt')}</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(u => (
                <tr key={u.userId} className={`border-t border-gray-200 hover:bg-blue-50 ${!u.isActive ? 'text-gray-400' : ''}`}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/settings/activity/${u.userId}`} className="text-blue-600 hover:underline">
                      {u.name}
                    </Link>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.today)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.thisWeek)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.thisMonth)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(u.last6Months)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatRelativeTime(u.lastActiveAt)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No users match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left', onClick }: { children: React.ReactNode; align?: 'left' | 'right'; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-medium cursor-pointer select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}
