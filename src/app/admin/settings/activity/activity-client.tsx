'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Circle } from 'lucide-react'
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
  avgSessionSeconds: number | null
  sessions30d: number | null
}

type SortKey = 'name' | 'today' | 'thisWeek' | 'thisMonth' | 'last6Months' | 'lastActiveAt' | 'avgSessionSeconds'

// A user is "online now" if their last heartbeat landed within the last
// 2 minutes (one tick + buffer). Keeps the roster conservative so a stale
// tab doesn't show someone as online for 5+ minutes.
const ONLINE_WINDOW_MS = 2 * 60 * 1000

export function ActivityClient() {
  const [users, setUsers] = useState<SummaryUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/activity/summary')
        .then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((body: { users: SummaryUser[] }) => {
          if (!cancelled) {
            setUsers(body.users)
            setNowTick(Date.now())
          }
        })
        .catch(e => {
          if (!cancelled) setError(e.message || 'Failed to load')
        })
    }
    load()
    // Refresh every 60 s so the online-now roster stays live without the
    // user hitting reload. Matches the heartbeat cadence.
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const onlineNow = useMemo(() => {
    if (!users) return []
    return users
      .filter(u => u.lastActiveAt && (nowTick - new Date(u.lastActiveAt).getTime()) <= ONLINE_WINDOW_MS)
      .sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''))
  }, [users, nowTick])

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
      if (sortKey === 'avgSessionSeconds') {
        const av = a.avgSessionSeconds ?? -1
        const bv = b.avgSessionSeconds ?? -1
        return (av - bv) * dir
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

      {users && (
        <div className="mb-4 border border-gray-200 rounded px-3 py-2 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Circle className={`w-2.5 h-2.5 ${onlineNow.length > 0 ? 'fill-emerald-500 text-emerald-500' : 'fill-gray-300 text-gray-300'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Online now ({onlineNow.length})
            </span>
          </div>
          {onlineNow.length === 0 ? (
            <div className="text-xs text-gray-400 italic">Nobody has pinged within the last 2 minutes.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {onlineNow.map(u => (
                <Link
                  key={u.userId}
                  href={`/admin/settings/activity/${u.userId}`}
                  className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 rounded hover:bg-emerald-200"
                >
                  <Circle className="w-1.5 h-1.5 fill-emerald-600 text-emerald-600" />
                  {u.name}
                </Link>
              ))}
            </div>
          )}
        </div>
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
                <Th onClick={() => toggleSort('avgSessionSeconds')} align="right">Avg Session (30d){arrow('avgSessionSeconds')}</Th>
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
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.avgSessionSeconds === null
                      ? '—'
                      : u.sessions30d && u.sessions30d > 0
                        ? `${formatHoursMinutes(u.avgSessionSeconds)} (${u.sessions30d})`
                        : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatRelativeTime(u.lastActiveAt)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No users match the current filter.</td></tr>
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
