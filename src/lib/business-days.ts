// Business-day utilities computed in America/New_York (Modern Appraisers'
// operating timezone) so a claim assigned Friday 5pm ET doesn't get its
// first nag Monday morning (which is what happened when we normalized in
// UTC — Fri 5pm ET = Sat 22:00 UTC, so the day-boundary walk started
// from Saturday and only counted Monday as one business day).
//
// Used by the auto-status-request cron: threshold 2 = "48 business hours",
// threshold 1 = "24 business hours" (i.e., one weekday has elapsed).

const ET_TZ = 'America/New_York'

// Return { year, month, day, weekday } for `d` interpreted in ET.
// weekday: 0=Sun ... 6=Sat, matching Date.prototype.getDay semantics.
function etParts(d: Date): { y: number; m: number; day: number; wd: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  let y = 0, m = 0, day = 0
  let weekday = ''
  for (const p of parts) {
    if (p.type === 'year')    y = Number(p.value)
    else if (p.type === 'month') m = Number(p.value)
    else if (p.type === 'day')   day = Number(p.value)
    else if (p.type === 'weekday') weekday = p.value
  }
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { y, m, day, wd: wdMap[weekday] ?? 0 }
}

// Count Monday–Friday day-boundary crossings between two dates as they
// fall on the ET calendar. `businessDaysBetween(Fri 5pm ET, Mon 9am ET)`
// returns 1 (Monday) — Sat/Sun contribute nothing.
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  const start = etParts(from)
  const end = etParts(to)
  // Walk day-by-day starting at ET-midnight of `start`. We increment a
  // scratch Date in UTC (adding one whole day at a time is timezone-safe
  // for day-count purposes as long as we only care about the ET wall-clock
  // date). Because DST shifts are ±1 hour but we add 24h, the ET day
  // number always advances by exactly 1 across the loop.
  const cursor = new Date(Date.UTC(start.y, start.m - 1, start.day, 12, 0, 0))
  const endCal = new Date(Date.UTC(end.y, end.m - 1, end.day, 12, 0, 0))
  let count = 0
  while (cursor < endCal) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const wd = etParts(cursor).wd
    if (wd >= 1 && wd <= 5) count++
  }
  return count
}

// True if `d` lands on Sat or Sun in ET (used by the cron to skip-early
// when it happens to fire on a weekend).
export function isWeekendET(d: Date): boolean {
  const wd = etParts(d).wd
  return wd === 0 || wd === 6
}
