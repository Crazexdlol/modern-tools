'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatHoursMinutes, laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

interface Day { date: string; activeSeconds: number; lastTickAt: string | null }
interface UserSummary { userId: string; name: string; email: string; isActive: boolean; days: Day[] }

export function UserActivityClient({ userId }: { userId: string }) {
  const [data, setData] = useState<UserSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/activity/summary/${userId}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((body: UserSummary) => { if (!cancelled) setData(body) })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load') })
    return () => { cancelled = true }
  }, [userId])

  const totals = useMemo(() => {
    if (!data) return null
    const today = laCalendarDate()
    const weekStart = mondayOf(today)
    const monthStart = `${today.slice(0, 7)}-01`
    const sixMonthsStart = laMinusDays(today, 180)
    let t = 0, w = 0, m = 0, s = 0
    for (const d of data.days) {
      if (d.date >= sixMonthsStart) s += d.activeSeconds
      if (d.date >= monthStart) m += d.activeSeconds
      if (d.date >= weekStart) w += d.activeSeconds
      if (d.date === today) t += d.activeSeconds
    }
    return { today: t, thisWeek: w, thisMonth: m, last6Months: s }
  }, [data])

  const last30 = useMemo(() => build30DaySeries(data?.days ?? []), [data])
  const monthlyTotals = useMemo(() => build6MonthTotals(data?.days ?? []), [data])

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
        Failed to load: {error}
      </div>
    )
  }
  if (!data || !totals) return <div className="text-sm text-gray-500">Loading…</div>

  const maxSec = Math.max(1, ...last30.map(d => d.activeSeconds))

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/settings/activity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Activity
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.name}</h1>
        <div className="text-sm text-gray-500">{data.email}{!data.isActive && ' — inactive'}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card label="Today"           value={formatHoursMinutes(totals.today)} />
        <Card label="This Week"       value={formatHoursMinutes(totals.thisWeek)} />
        <Card label="This Month"      value={formatHoursMinutes(totals.thisMonth)} />
        <Card label="Last 6 Months"   value={formatHoursMinutes(totals.last6Months)} />
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">Last 30 days</h2>
      <div className="mb-6 border border-gray-200 rounded p-3 bg-white">
        <div className="flex items-end gap-1 h-32">
          {last30.map(d => {
            const heightPct = d.activeSeconds === 0 ? 2 : Math.max(4, (d.activeSeconds / maxSec) * 100)
            return (
              <div
                key={d.date}
                title={`${d.date}: ${formatHoursMinutes(d.activeSeconds)}`}
                className="flex-1 bg-blue-500 rounded-t"
                style={{ height: `${heightPct}%` }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>{last30[0]?.date}</span>
          <span>{last30[last30.length - 1]?.date}</span>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">Monthly totals</h2>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr><th className="px-3 py-2 text-left font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Active time</th></tr>
          </thead>
          <tbody>
            {monthlyTotals.map(m => (
              <tr key={m.label} className="border-t border-gray-200">
                <td className="px-3 py-2">{m.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatHoursMinutes(m.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// Local: Monday-of-week for an LA date string. Duplicated here (rather than
// importing) because the formatters module's laMondayOf is server-safe but
// this file only needs the pure-string form.
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  const dow = d.getUTCDay()
  const daysBack = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function build30DaySeries(days: Day[]): { date: string; activeSeconds: number }[] {
  const byDate = new Map(days.map(d => [d.date, d.activeSeconds]))
  const today = laCalendarDate()
  const out: { date: string; activeSeconds: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = laMinusDays(today, i)
    out.push({ date: d, activeSeconds: byDate.get(d) ?? 0 })
  }
  return out
}

function build6MonthTotals(days: Day[]): { label: string; seconds: number }[] {
  const buckets = new Map<string, number>()
  for (const d of days) {
    const key = d.date.slice(0, 7)  // YYYY-MM
    buckets.set(key, (buckets.get(key) ?? 0) + d.activeSeconds)
  }
  const today = laCalendarDate()  // YYYY-MM-DD in LA
  const [yStr, mStr] = today.slice(0, 7).split('-')
  let year = parseInt(yStr, 10)
  let month = parseInt(mStr, 10)  // 1-12
  const out: { label: string; seconds: number }[] = []
  for (let i = 0; i < 6; i++) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    out.push({ label: monthLabel(key), seconds: buckets.get(key) ?? 0 })
    month--
    if (month === 0) { month = 12; year-- }
  }
  return out
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m, 10) - 1]
  return `${monthName} ${y}`
}
