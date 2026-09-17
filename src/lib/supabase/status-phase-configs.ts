import { createClient as createBrowserClient } from './client'

export interface StatusPhaseConfig {
  code: string
  label: string
  color: string          // 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple' | 'teal' | 'fuchsia'
  sortOrder: number
  archived: boolean
}

interface Row {
  code: string
  label: string
  color: string
  sort_order: number
  archived: boolean
}

// Module-level cache with 60s TTL + in-flight dedup. Configs rarely change,
// and without this the dashboard was firing N+1 identical queries (one per
// admin's PhaseSelector row) that could stack up 15+ seconds behind a cold
// Supabase connection. First caller triggers the fetch; concurrent callers
// await the same promise; subsequent callers within 60s reuse the result.

const TTL_MS = 60_000
interface CacheEntry { value: StatusPhaseConfig[]; ts: number }
const cache = new Map<'active' | 'all', CacheEntry | { promise: Promise<StatusPhaseConfig[]> }>()

async function actuallyFetch(includeArchived: boolean): Promise<StatusPhaseConfig[]> {
  const supabase = createBrowserClient()
  let q = supabase.from('status_phase_configs').select('*').order('sort_order', { ascending: true })
  if (!includeArchived) q = q.eq('archived', false)
  const { data, error } = await q
  if (error) { console.error('fetchStatusPhaseConfigs failed:', error); return [] }
  return (data as Row[]).map(r => ({
    code: r.code, label: r.label, color: r.color, sortOrder: r.sort_order, archived: r.archived,
  }))
}

/** Live-fetch active phase configs, sorted by sort_order. Cached 60s. */
export async function fetchStatusPhaseConfigs(opts: { includeArchived?: boolean } = {}): Promise<StatusPhaseConfig[]> {
  const key: 'active' | 'all' = opts.includeArchived ? 'all' : 'active'
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && 'value' in hit && now - hit.ts < TTL_MS) return hit.value
  if (hit && 'promise' in hit) return hit.promise
  const promise = actuallyFetch(!!opts.includeArchived)
  cache.set(key, { promise })
  const value = await promise
  cache.set(key, { value, ts: Date.now() })
  return value
}

/** Bust the cache — call after admin adds/edits/archives a phase. */
export function invalidateStatusPhaseConfigsCache(): void {
  cache.clear()
}

/**
 * Format elapsed time since phase was set. Rounds DOWN, no hours/minutes.
 *   < 30d       → "5d" (or "0d" for same-day)
 *   30d - 365d  → "3mo" (or "1y" at 365d)
 *   >= 365d     → "1y 2mo" (years + remaining months, dropping mo if 0)
 */
export function formatPhaseAge(setAt: string | null | undefined, now: Date = new Date()): string {
  if (!setAt) return ''
  const diffMs = now.getTime() - new Date(setAt).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return '0d'
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  const years = Math.floor(months / 12)
  const remainderMonths = months - years * 12
  if (remainderMonths === 0) return `${years}y`
  return `${years}y ${remainderMonths}mo`
}

/**
 * Map color name → Tailwind pill classes (bg + text + border).
 * All six phase colors are distinct hue families so no two phases can look
 * alike on the dashboard. Tailwind needs to see these classes as literal
 * strings at build time — do NOT construct them dynamically.
 */
export function phaseColorClasses(color: string): string {
  switch (color) {
    case 'green':   return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    case 'red':     return 'bg-red-50 text-red-800 border-red-200'
    case 'amber':   return 'bg-amber-50 text-amber-800 border-amber-200'
    case 'blue':    return 'bg-blue-50 text-blue-800 border-blue-200'
    case 'gray':    return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'purple':  return 'bg-violet-50 text-violet-800 border-violet-200'
    case 'teal':    return 'bg-teal-50 text-teal-800 border-teal-200'
    case 'fuchsia': return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200'
    default:        return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}
