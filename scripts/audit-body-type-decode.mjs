// Audit the VIN decoder's bodyType output against a sample of real claim VINs
// from acv_history. For each VIN: pulls what MarketCheck + NHTSA return, runs
// `normalizeBodyType()` the same way the live code does, and reports.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... MARKETCHECK_API_KEY=... node scripts/audit-body-type-decode.mjs
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ektglhdstobaipdqssjx.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MC_KEY = process.env.MARKETCHECK_API_KEY

if (!SB_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!MC_KEY) { console.error('Set MARKETCHECK_API_KEY'); process.exit(1) }

// Mirror of src/lib/acv/decode-vin.ts normalizeBodyType() so this script matches
// what the live code actually does.
function normalizeBodyType(raw) {
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

async function marketcheck(vin) {
  const url = `https://mc-api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${MC_KEY}`
  const r = await fetch(url)
  if (!r.ok) return { body: '', year: 0, make: '', model: '' }
  const d = await r.json()
  return { body: d.body_style || '', year: Number(d.year) || 0, make: d.make || '', model: d.model || '' }
}

async function nhtsa(vin) {
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`)
  if (!r.ok) return { body: '' }
  const d = await r.json()
  return { body: d.Results?.[0]?.BodyClass || '' }
}

const supabase = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })

// Pull a varied set: one claim per unique make, up to 15 makes, prefer recent.
const { data: rows, error } = await supabase
  .from('acv_history')
  .select('ma_number, vin, claim, vehicle')
  .not('vin', 'is', null)
  .order('created_at', { ascending: false })
  .limit(400)

if (error) { console.error(error); process.exit(1) }

const seen = new Set()
const picks = []
for (const r of rows ?? []) {
  const vin = (r.vin || '').trim()
  if (vin.length !== 17) continue
  const make = (r.claim?.make || '').toLowerCase()
  const model = (r.claim?.model || '').toLowerCase()
  const key = `${make}|${model}`
  if (seen.has(key)) continue
  seen.add(key)
  picks.push({ ma: r.ma_number, vin, vehicle: r.vehicle || `${r.claim?.year ?? ''} ${r.claim?.make ?? ''} ${r.claim?.model ?? ''}` })
  if (picks.length >= 10) break
}

console.log(`\nTesting ${picks.length} VINs:\n`)
console.log('MA#         VIN                 Vehicle                             MC body        NHTSA body             normalize()')
console.log('─'.repeat(140))

const flagged = []
for (const p of picks) {
  const [mc, nh] = await Promise.all([marketcheck(p.vin), nhtsa(p.vin)])
  // Mirror decodeVin: MarketCheck primary, NHTSA backfills only if MC body empty.
  const rawBody = mc.body?.trim() || nh.body
  const normalized = normalizeBodyType(rawBody)
  // Flag heuristic: Kia Soul / Honda Fit / Mini Clubman / Suzuki Jimny are
  // known to come back as "SUV"/"Crossover" from MarketCheck when actual
  // listings are Hatchback/Wagon.
  const vehicle = (p.vehicle || '').toLowerCase()
  const likelyMisclassified =
    (vehicle.includes('soul') && (normalized === 'SUV' || normalized === 'Crossover')) ||
    (vehicle.includes('fit') && normalized !== 'Hatchback') ||
    (vehicle.includes('clubman') && normalized !== 'Wagon')
  const flag = likelyMisclassified ? '  ⚠ FLAG' : ''
  console.log(
    `${(p.ma || '').padEnd(10)}  ${p.vin}  ${(p.vehicle || '').slice(0, 36).padEnd(36)}  ${(mc.body || '—').slice(0, 14).padEnd(14)} ${(nh.body || '—').slice(0, 22).padEnd(22)} ${normalized.padEnd(12)}${flag}`,
  )
  if (likelyMisclassified) flagged.push({ ...p, raw: rawBody, normalized })
}

console.log('\n── Summary ──')
console.log(`Flagged (likely misclassified body type): ${flagged.length}`)
for (const f of flagged) console.log(`  ${f.ma}  ${f.vehicle}  → "${f.normalized}" (raw: "${f.raw}")`)
console.log('\nThe auto-widen fix (just deployed) will now show comps for every flagged VIN with a banner noting the body-type gate was dropped.')
