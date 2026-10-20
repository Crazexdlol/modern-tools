'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatHoursMinutes, laCalendarDate, laMinusDays } from '@/lib/activity/formatters'

interface Day { date: string; activeSeconds: number; lastTickAt: string | null }
interface Session { startedAt: string; endedAt: string; activeSeconds: number }
interface UserSummary {
  userId: string
  name: string
  email: string
  isActive: boolean
  days: Day[]
  sessions: Session[]
  ticksForDate: string
  ticks: string[]  // ISO strings, minute precision
}

type RangeMode = 30 | 90

export function UserActivityClient({ userId }: { userId: string }) {
  const [data, setData] = useState<UserSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rangeMode, setRangeMode] = useState<RangeMode>(30)
  const [timelineDate, setTimelineDate] = useState<string>(laCalendarDate())

  useEffect(() => {
    let cancelled = false
    const q = timelineDate !== laCalendarDate() ? `?date=${timelineDate}` : ''
    const load = () => {
      fetch(`/api/activity/summary/${userId}${q}`)
        .then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((body: UserSummary) => { if (!cancelled) setData(body) })
        .catch(e => { if (!cancelled) setError(e.message || 'Failed to load') })
    }
    load()
    // Auto-refresh every 60 s so viewing a user's page while they're actively
    // working shows new ticks without the admin having to hit reload. Matches
    // the heartbeat cadence.
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [userId, timelineDate])

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

  const sessionStats = useMemo(() => {
    if (!data?.sessions) return null
    const n = data.sessions.length
    if (n === 0) return { count: 0, avgSeconds: 0, longestSeconds: 0 }
    const totalSec = data.sessions.reduce((acc, s) => acc + s.activeSeconds, 0)
    const longest = data.sessions.reduce((acc, s) => Math.max(acc, s.activeSeconds), 0)
    return { count: n, avgSeconds: Math.round(totalSec / n), longestSeconds: longest }
  }, [data])

  const dailySeries = useMemo(() => buildDailySeries(data?.days ?? [], rangeMode), [data, rangeMode])
  const monthlyTotals = useMemo(() => build6MonthTotals(data?.days ?? []), [data])
  const hourlySeries = useMemo(() => buildHourlySeries(data?.ticks ?? [], timelineDate), [data?.ticks, timelineDate])

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 text-red-800 text-sm px-3 py-2">
        Failed to load: {error}
      </div>
    )
  }
  if (!data || !totals) return <div className="text-sm text-gray-500">Loading…</div>

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

      {sessionStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <Card label="Sessions (last 30d)" value={String(sessionStats.count)} />
          <Card label="Avg session length"  value={sessionStats.count ? formatHoursMinutes(sessionStats.avgSeconds) : '—'} />
          <Card label="Longest session"     value={sessionStats.count ? formatHoursMinutes(sessionStats.longestSeconds) : '—'} />
        </div>
      )}

      <div className="flex items-end justify-between mb-2 gap-3">
        <h2 className="text-sm font-medium text-gray-700">Hours per day</h2>
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
          {([30, 90] as RangeMode[]).map(r => (
            <button
              key={r}
              onClick={() => setRangeMode(r)}
              className={`px-3 py-1 text-xs rounded ${rangeMode === r ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Last {r} days
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6 border border-gray-200 rounded p-3 bg-white">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              interval={rangeMode === 30 ? 2 : 7}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v: number) => `${Math.round(v / 3600 * 10) / 10}h`}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={((v: unknown) => [formatHoursMinutes(Number(v)), 'Active']) as never}
              labelFormatter={((l: unknown) => String(l)) as never}
            />
            <Bar dataKey="seconds" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-end justify-between mb-2 gap-3">
        <h2 className="text-sm font-medium text-gray-700">When during the day</h2>
        <input
          type="date"
          value={timelineDate}
          max={laCalendarDate()}
          onChange={(e) => setTimelineDate(e.target.value || laCalendarDate())}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="mb-6 border border-gray-200 rounded p-3 bg-white">
        {hourlySeries.every(h => h.minutes === 0) ? (
          <div className="text-xs text-gray-400 italic py-8 text-center">No ticks recorded on {timelineDate}.</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v: number) => `${v}m`}
                tickLine={false}
                axisLine={false}
                width={32}
                domain={[0, 60]}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={((v: unknown) => [`${v} min`, 'Active']) as never}
                labelFormatter={((l: unknown) => `${l}:00 PT`) as never}
              />
              <Bar dataKey="minutes" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
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

// Monday-of-week for an LA date string.
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  const dow = d.getUTCDay()
  const daysBack = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

// Build N-day daily series (today-N+1 ... today).
function buildDailySeries(days: Day[], count: number): { date: string; label: string; seconds: number }[] {
  const byDate = new Map(days.map(d => [d.date, d.activeSeconds]))
  const today = laCalendarDate()
  const out: { date: string; label: string; seconds: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = laMinusDays(today, i)
    const monthDay = d.slice(5)  // "MM-DD"
    out.push({ date: d, label: monthDay, seconds: byDate.get(d) ?? 0 })
  }
  return out
}

// 24-hour bar: how many minutes of activity landed in each hour of the day.
function buildHourlySeries(ticks: string[], _date: string): { hour: string; minutes: number }[] {
  // Zero-fill all 24 hours.
  const buckets = new Array<number>(24).fill(0)
  for (const t of ticks) {
    // Interpret the tick as LA wall-clock time.
    const d = new Date(t)
    // Pull the LA hour via Intl.
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(d))
    if (hour >= 0 && hour <= 23) buckets[hour] += 1  // one minute per tick
  }
  return buckets.map((minutes, i) => ({ hour: String(i).padStart(2, '0'), minutes }))
}

function build6MonthTotals(days: Day[]): { label: string; seconds: number }[] {
  const buckets = new Map<string, number>()
  for (const d of days) {
    const key = d.date.slice(0, 7)  // YYYY-MM
    buckets.set(key, (buckets.get(key) ?? 0) + d.activeSeconds)
  }
  const today = laCalendarDate()
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
