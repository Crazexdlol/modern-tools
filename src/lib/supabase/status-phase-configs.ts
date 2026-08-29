import { createClient as createBrowserClient } from './client'

export interface StatusPhaseConfig {
  code: string
  label: string
  color: string          // 'green' | 'red' | 'amber' | 'blue' | 'gray'
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

/** Live-fetch active phase configs, sorted by sort_order. */
export async function fetchStatusPhaseConfigs(opts: { includeArchived?: boolean } = {}): Promise<StatusPhaseConfig[]> {
  const supabase = createBrowserClient()
  let q = supabase.from('status_phase_configs').select('*').order('sort_order', { ascending: true })
  if (!opts.includeArchived) q = q.eq('archived', false)
  const { data, error } = await q
  if (error) { console.error('fetchStatusPhaseConfigs failed:', error); return [] }
  return (data as Row[]).map(r => ({
    code: r.code, label: r.label, color: r.color, sortOrder: r.sort_order, archived: r.archived,
  }))
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

/** Map color name → Tailwind pill classes (bg + text + border). */
export function phaseColorClasses(color: string): string {
  switch (color) {
    case 'green':  return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    case 'red':    return 'bg-red-50 text-red-800 border-red-200'
    case 'amber':  return 'bg-amber-50 text-amber-800 border-amber-200'
    case 'blue':   return 'bg-blue-50 text-blue-800 border-blue-200'
    case 'gray':   return 'bg-gray-100 text-gray-700 border-gray-200'
    default:       return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}
