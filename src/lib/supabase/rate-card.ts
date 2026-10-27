// Per-client billing rates. Null leaves mean "no rate set".
// Consumers must distinguish null from 0.
export interface ClientRateCard {
  primary: {
    acv:      { bare: number | null; withRta: number | null }
    dv:       { bare: number | null; withRta: number | null }
    estimate: { bare: number | null; withRta: number | null }
    storage:  { bare: number | null; withRta: number | null }
  }
  addOns: {
    desk: number | null
    lou: number | null
    full: number | null
    salvage: number | null
    specialty: number | null
    other: number | null
    umpire: number | null
    carfax: number | null
    windowSticker: number | null
    rush: number | null
    cancellation: number | null
  }
  time: {
    hourly: number | null
    mileage: number | null
  }
}

export const PRIMARY_RATE_KEYS = ['acv', 'dv', 'estimate', 'storage'] as const
export type PrimaryRateKey = typeof PRIMARY_RATE_KEYS[number]

export const PRIMARY_RATE_LABELS: Record<PrimaryRateKey, string> = {
  acv: 'ACV',
  dv: 'DV',
  estimate: 'Est Dispute',
  storage: 'Storage',
}

export const ADDON_RATE_KEYS = [
  'desk', 'lou', 'full', 'salvage', 'specialty', 'other', 'umpire',
  'carfax', 'windowSticker', 'rush', 'cancellation',
] as const
export type AddOnRateKey = typeof ADDON_RATE_KEYS[number]

export const ADDON_RATE_LABELS: Record<AddOnRateKey, string> = {
  desk: 'Desk',
  lou: 'LOU',
  full: 'FULL',
  salvage: 'Salvage',
  specialty: 'Specialty',
  other: 'Other',
  umpire: 'Umpire',
  carfax: 'Carfax',
  windowSticker: 'Window Sticker',
  rush: 'Rush Fee',
  cancellation: 'Cancellation Fee',
}

export function defaultRateCard(): ClientRateCard {
  return {
    primary: {
      acv:      { bare: null, withRta: null },
      dv:       { bare: null, withRta: null },
      estimate: { bare: null, withRta: null },
      storage:  { bare: null, withRta: null },
    },
    addOns: {
      desk: null, lou: null, full: null, salvage: null, specialty: null,
      other: null, umpire: null, carfax: null, windowSticker: null,
      rush: null, cancellation: null,
    },
    time: { hourly: null, mileage: null },
  }
}

// Coerce an unknown raw value (from jsonb) into a well-formed ClientRateCard.
// Missing keys get null; non-numeric values become null. Tolerant on purpose
// so legacy rows and future schema additions don't crash reads.
export function normalizeRateCard(raw: unknown): ClientRateCard {
  const base = defaultRateCard()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const parsed = Number(v)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const primary = (r.primary ?? {}) as Record<string, unknown>
  for (const k of PRIMARY_RATE_KEYS) {
    const slot = (primary[k] ?? {}) as Record<string, unknown>
    base.primary[k].bare = num(slot.bare)
    base.primary[k].withRta = num(slot.withRta)
  }

  const addOns = (r.addOns ?? {}) as Record<string, unknown>
  for (const k of ADDON_RATE_KEYS) {
    base.addOns[k] = num(addOns[k])
  }

  const time = (r.time ?? {}) as Record<string, unknown>
  base.time.hourly = num(time.hourly)
  base.time.mileage = num(time.mileage)

  return base
}

// Equality check used by dirty-tracking in the Rates tab. Simple structural
// compare — safe because every leaf is number | null.
export function rateCardEquals(a: ClientRateCard, b: ClientRateCard): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
