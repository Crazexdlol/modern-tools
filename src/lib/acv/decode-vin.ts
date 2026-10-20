// Shared VIN decoder. Used by:
//   - GET /api/acv/decode-vin (manual decode button in Claim Info)
//   - POST /api/acv/parse-claim (auto-fill vehicle specs when the assignment
//     sheet is missing make/model but has a valid VIN)
//
// Strategy: MarketCheck first (richer trim/engine/drivetrain data), fall
// back to NHTSA vPIC (free, no API key, less complete).

export interface VinDecodeResult {
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  bodyStyle: string
  vin: string
}

// VINs never contain I, O, or Q — these characters are banned by the VIN
// spec specifically to avoid confusion with 1, 0, and 9. The Modern
// Appraisers assignment-sheet PDF (and some human-typed VINs) still ship
// them as typos; replace them with the digits they're confused with so
// downstream decode calls don't 400.
export function sanitizeVin(vin: string): string {
  return vin.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '9')
}

function normalizeFuelType(raw: string): string {
  const s = (raw || '').toLowerCase()
  if (!s) return ''
  if (s.includes('plug-in') || s.includes('plug in') || s.includes('phev')) return 'Plug-in Hybrid'
  if (s.includes('hybrid') || s.includes('hev')) return 'Hybrid'
  if (s.includes('electric') || s.includes('bev') || s.includes('ev')) return 'Electric'
  if (s.includes('diesel')) return 'Diesel'
  if (s.includes('flex') || s.includes('e85')) return 'Flex Fuel'
  if (s.includes('gasoline') || s.includes('gas') || s.includes('petrol')) return 'Gasoline'
  return ''
}

// The dropdown options the Claim Info form offers for Body Type. Exported so
// the UI + the normalizer share the same source of truth. "Other" is a
// catch-all for values that don't map to a known body style (e.g. motorcycle,
// bus, unusual commercial body) — the user can type in the raw value then.
export const BODY_TYPE_OPTIONS = [
  'Sedan',
  'Coupe',
  'Hatchback',
  'Wagon',
  'Convertible',
  'SUV',
  'Crossover',
  'Pickup',
  'Van',
  'Minivan',
  'Other',
] as const

// Maps raw body-style strings from NHTSA / MarketCheck to one of
// BODY_TYPE_OPTIONS. NHTSA returns noisy multi-word strings like
// "Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]" that we collapse
// to "SUV". MarketCheck returns clean single words like "Hatchback" that
// pass through. Returns '' when there's no raw value OR no sensible match —
// callers should then preserve whatever the user already picked rather than
// blindly stamping "Other" over a manual selection.
export function normalizeBodyType(raw: string): string {
  const s = (raw || '').toLowerCase()
  if (!s) return ''
  if (s.includes('minivan')) return 'Minivan'
  if (s.includes('sport utility') || /\bsuv\b/.test(s)) return 'SUV'
  if (s.includes('crossover') || /\bcuv\b/.test(s)) return 'Crossover'
  if (s.includes('pickup') || s.includes('pick-up') || s.includes('truck')) return 'Pickup'
  if (s.includes('cargo van') || s.includes('passenger van') || /\bvan\b/.test(s)) return 'Van'
  if (s.includes('convertible') || s.includes('roadster') || s.includes('cabriolet')) return 'Convertible'
  if (s.includes('wagon')) return 'Wagon'
  if (s.includes('hatchback') || s.includes('liftback')) return 'Hatchback'
  if (s.includes('coupe')) return 'Coupe'
  if (s.includes('sedan') || s.includes('saloon')) return 'Sedan'
  return ''
}

async function decodeWithMarketCheck(vin: string, apiKey: string): Promise<VinDecodeResult | null> {
  const url = `https://mc-api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.year && !data.make) return null
  return {
    year: Number(data.year) || 0,
    make: data.make || '',
    model: data.model || '',
    trim: data.trim || '',
    engine: data.engine || '',
    drivetrain: data.drivetrain || '',
    transmission: data.transmission || '',
    fuelType: normalizeFuelType(data.fuel_type || data.powertrain_type || ''),
    bodyStyle: data.body_style || '',
    vin,
  }
}

async function decodeWithNHTSA(vin: string): Promise<VinDecodeResult | null> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const r = data.Results?.[0]
  if (!r || !r.ModelYear) return null

  const driveMap: Record<string, string> = {
    'FWD': 'FWD', 'RWD': 'RWD', 'AWD': 'AWD', '4WD': '4WD',
    'Front-Wheel Drive': 'FWD', 'Rear-Wheel Drive': 'RWD',
    'All-Wheel Drive': 'AWD', '4x4': '4WD',
  }

  const fuelRaw = [r.ElectrificationLevel, r.FuelTypePrimary, r.FuelTypeSecondary].filter(Boolean).join(' ')

  return {
    year: parseInt(r.ModelYear) || 0,
    make: r.Make || '',
    model: r.Model || '',
    trim: r.Trim || '',
    engine: [r.DisplacementL ? `${r.DisplacementL}L` : '', r.EngineCylinders ? `${r.EngineCylinders}cyl` : ''].filter(Boolean).join(' ') || '',
    drivetrain: driveMap[r.DriveType] || r.DriveType || '',
    transmission: r.TransmissionStyle || '',
    fuelType: normalizeFuelType(fuelRaw),
    bodyStyle: r.BodyClass || '',
    vin,
  }
}

// Full decode pipeline. Returns null on any invalid-input / all-sources-failed
// path so the caller can decide whether to surface an error (interactive
// GET /api/acv/decode-vin) or silently skip (parse-claim auto-decode).
//
// MarketCheck is the canonical source for every field EXCEPT bodyStyle —
// MarketCheck frequently returns year/make/model but no body_type (which
// then normalises to "" and leaves claim.bodyType blank). When that happens
// we fetch NHTSA strictly to backfill bodyStyle; every other field stays
// MarketCheck's value so comp search / listing match strings don't change.
// (Earlier attempt at full-merge was rolled back because NHTSA's trim/
// drivetrain values ("N", "4x2") polluted comp matching — see git history.)
export async function decodeVin(rawVin: string): Promise<VinDecodeResult | null> {
  if (!rawVin) return null
  const vin = sanitizeVin(rawVin)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return null
  const apiKey = process.env.MARKETCHECK_API_KEY
  try {
    let result = apiKey ? await decodeWithMarketCheck(vin, apiKey) : null
    if (!result) {
      result = await decodeWithNHTSA(vin)
      return result
    }
    // MarketCheck succeeded but may lack bodyStyle. Backfill from NHTSA.
    if (!result.bodyStyle || !result.bodyStyle.trim()) {
      try {
        const nhtsa = await decodeWithNHTSA(vin)
        if (nhtsa?.bodyStyle) result.bodyStyle = nhtsa.bodyStyle
      } catch { /* NHTSA fallback failed — fine, just leave bodyStyle empty */ }
    }
    return result
  } catch (err) {
    console.error('[decodeVin] threw:', err)
    return null
  }
}
