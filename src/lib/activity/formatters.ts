// Formatters for the activity dashboard. Kept client-safe (no fs / server deps).

// Formats a seconds duration as "Xh Ym" (or "Xm" if under an hour, or "—" if zero).
export function formatHoursMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const totalMinutes = Math.floor(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Formats an ISO timestamp as "2 min ago", "3 hours ago", "yesterday",
// "5 days ago", "never" (null input).
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diffMs = Date.now() - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 30) return `${diffDay} days ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`
  const diffYear = Math.floor(diffDay / 365)
  return `${diffYear} year${diffYear === 1 ? '' : 's'} ago`
}

// LA-calendar-date helper. Returns YYYY-MM-DD for the given timestamp,
// as observed in America/Los_Angeles. Used both server-side (activity_date
// column bucket) and client-side (rendering month labels, etc.).
export function laCalendarDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

// Given an LA calendar date string YYYY-MM-DD, return the LA date for
// Monday of that week. Used by the summary API to compute weekStart.
export function laMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  const dow = d.getUTCDay()  // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBack = (dow + 6) % 7  // Mon=0, Tue=1, ..., Sun=6
  d.setUTCDate(d.getUTCDate() - daysBack)
  return laCalendarDate(d)
}

// Given an LA calendar date string, return the 1st of its month, YYYY-MM-01.
export function laMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

// Given an LA calendar date string, return the LA date 180 days earlier.
export function laMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-08:00`)
  d.setUTCDate(d.getUTCDate() - days)
  return laCalendarDate(d)
}
