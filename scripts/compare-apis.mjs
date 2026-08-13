// One-off comparison of MarketCheck vs Auto.dev coverage across 25 VINs and 3 radii.
// Usage: node scripts/compare-apis.mjs
// Requires: dev server running at http://localhost:3000, AUTODEV_API_KEY in .env.local.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const BASE = 'http://localhost:3000'
const ZIP = '89111' // Las Vegas
const RADII = [50, 150, 0] // 0 = nationwide
const AUTODEV_KEY = env.AUTODEV_API_KEY

// Diverse seed list — common, luxury, EV, truck, hybrid, old/new, etc.
const SEEDS = [
  { year: 2022, make: 'Toyota', model: 'Camry' },
  { year: 2021, make: 'Honda', model: 'Civic' },
  { year: 2020, make: 'Ford', model: 'F-150' },
  { year: 2021, make: 'Chevrolet', model: 'Silverado 1500' },
  { year: 2022, make: 'Tesla', model: 'Model 3' },
  { year: 2020, make: 'BMW', model: '3 Series' },
  { year: 2021, make: 'Lexus', model: 'RX 350' },
  { year: 2022, make: 'Hyundai', model: 'Elantra' },
  { year: 2021, make: 'Jeep', model: 'Wrangler' },
  { year: 2020, make: 'Subaru', model: 'Outback' },
  { year: 2023, make: 'Toyota', model: 'RAV4' },
  { year: 2022, make: 'Honda', model: 'CR-V' },
  { year: 2021, make: 'Ford', model: 'Explorer' },
  { year: 2020, make: 'Nissan', model: 'Altima' },
  { year: 2022, make: 'Kia', model: 'Sorento' },
  { year: 2021, make: 'Mazda', model: 'CX-5' },
  { year: 2020, make: 'Volkswagen', model: 'Jetta' },
  { year: 2021, make: 'Audi', model: 'A4' },
  { year: 2022, make: 'Acura', model: 'MDX' },
  { year: 2021, make: 'Cadillac', model: 'Escalade' },
  { year: 2020, make: 'Dodge', model: 'Charger' },
  { year: 2022, make: 'GMC', model: 'Sierra 1500' },
  { year: 2021, make: 'Chrysler', model: 'Pacifica' },
  { year: 2018, make: 'Toyota', model: 'Prius' },
  { year: 2024, make: 'Ford', model: 'Mustang' },
]

async function pullSeedVin(seed) {
  const params = new URLSearchParams({
    'vehicle.year': String(seed.year),
    'vehicle.make': seed.make,
    'vehicle.model': seed.model,
    limit: '1',
  })
  const r = await fetch(`https://api.auto.dev/listings?${params}`, {
    headers: { Authorization: `Bearer ${AUTODEV_KEY}` },
  })
  if (!r.ok) return null
  const j = await r.json()
  return j?.data?.[0]?.vin ?? null
}

async function decode(vin) {
  const r = await fetch(`${BASE}/api/acv/decode-vin?vin=${vin}`)
  return r.ok ? await r.json() : null
}

async function search(decoded, radius) {
  const isNationwide = radius === 0
  const params = new URLSearchParams({
    year: String(decoded.year),
    make: decoded.make,
    model: decoded.model,
    radius: String(radius),
    ...(isNationwide ? { nationwide: 'true' } : { zip: ZIP }),
  })
  const r = await fetch(`${BASE}/api/acv/search-comps?${params}`)
  return r.ok ? await r.json() : { listings: [], sources: {} }
}

function isAccurate(l, decoded) {
  const yearOk = Number(l.year) === Number(decoded.year)
  const makeOk = String(l.make || '').toLowerCase() === String(decoded.make || '').toLowerCase()
  const decodedFirstWord = String(decoded.model || '').toLowerCase().split(/\s+/)[0]
  const modelOk = String(l.model || '').toLowerCase().includes(decodedFirstWord)
  return yearOk && makeOk && modelOk
}

const radiusLabel = (r) => (r === 0 ? 'nationwide' : `${r}mi`)

async function main() {
  if (!AUTODEV_KEY) {
    console.error('AUTODEV_API_KEY not found in .env.local')
    process.exit(1)
  }

  console.log('Step 1/3: Seeding VINs from Auto.dev...')
  const vins = []
  for (const seed of SEEDS) {
    process.stdout.write(`  ${seed.year} ${seed.make} ${seed.model}... `)
    const vin = await pullSeedVin(seed)
    if (vin) {
      vins.push(vin)
      console.log(`✓ ${vin}`)
    } else {
      console.log('✗ no listing')
    }
  }
  console.log(`Got ${vins.length} VINs.\n`)

  console.log('Step 2/3: Decoding + searching at each radius...')
  const rows = []
  for (const vin of vins) {
    const decoded = await decode(vin)
    if (!decoded) {
      console.log(`  ${vin}: decode failed`)
      continue
    }
    const label = `${decoded.year} ${decoded.make} ${decoded.model}`
    process.stdout.write(`  ${label.padEnd(35)} `)
    for (const radius of RADII) {
      const data = await search(decoded, radius)
      const all = data.listings ?? []
      const mc = all.filter((l) => l.source === 'marketcheck')
      const ad = all.filter((l) => l.source === 'autodev')
      const mcAcc = mc.length ? mc.filter((l) => isAccurate(l, decoded)).length / mc.length : 0
      const adAcc = ad.length ? ad.filter((l) => isAccurate(l, decoded)).length / ad.length : 0
      rows.push({
        vehicle: label,
        radius: radiusLabel(radius),
        mc: mc.length,
        ad: ad.length,
        total: all.length,
        mcAcc: mc.length ? `${(mcAcc * 100).toFixed(0)}%` : '—',
        adAcc: ad.length ? `${(adAcc * 100).toFixed(0)}%` : '—',
      })
      process.stdout.write(`[${radiusLabel(radius)}: MC=${mc.length}/AD=${ad.length}] `)
    }
    process.stdout.write('\n')
  }

  console.log('\nStep 3/3: Results\n')
  console.table(rows)

  // Per-radius summary
  console.log('\n=== Per-radius totals ===')
  for (const r of RADII) {
    const sub = rows.filter((row) => row.radius === radiusLabel(r))
    const mcSum = sub.reduce((s, x) => s + x.mc, 0)
    const adSum = sub.reduce((s, x) => s + x.ad, 0)
    const totalSum = sub.reduce((s, x) => s + x.total, 0)
    const adUnique = totalSum - mcSum
    const pct = mcSum > 0 ? ((adUnique / mcSum) * 100).toFixed(1) : 'N/A'
    console.log(
      `${radiusLabel(r).padEnd(12)} MC=${mcSum.toString().padStart(4)} AD=${adSum.toString().padStart(4)} combined-deduped=${totalSum.toString().padStart(4)}  → AD added ${adUnique} new (${pct}% over MC alone)`
    )
  }

  console.log('\n=== Accuracy (avg across vehicles where source returned ≥1) ===')
  for (const r of RADII) {
    const sub = rows.filter((row) => row.radius === radiusLabel(r))
    const mcAccs = sub.filter((x) => x.mcAcc !== '—').map((x) => parseInt(x.mcAcc))
    const adAccs = sub.filter((x) => x.adAcc !== '—').map((x) => parseInt(x.adAcc))
    const avg = (a) => (a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(0) : '—')
    console.log(`${radiusLabel(r).padEnd(12)} MC avg accuracy=${avg(mcAccs)}%  AD avg accuracy=${avg(adAccs)}%`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
