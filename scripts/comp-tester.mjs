#!/usr/bin/env node
// Comp Finder Tester v2 — Henry 2026-10-16.
//
// Local standalone test harness for the ACV comp finder. Does NOT touch the
// hams codebase or auth. Starts an HTTP server on localhost:3999 with a
// browser UI + proxies to MarketCheck + Auto.dev using keys from .env.local.
//
// Usage:
//   node scripts/comp-tester.mjs
//   → open http://localhost:3999 in your browser
//
// Two modes:
//   1. 'radius'     — current hams flow: MC query with zip+radius, 4 pages × 50.
//                      Capped by MC plan (currently 500 mi; downgraded plan: 100 mi).
//   2. 'nationwide' — new downgraded-plan flow: MC nationwide query, lat/lon
//                      haversine distance computed server-side using the claim's
//                      zip. Any radius value works, no plan cap.
//
// Nationwide mode also applies a mileage filter: comps with mileage within
// ±X% of the subject vehicle mileage. If no comps pass, falls back to no
// mileage filter (Henry: "whatever comps are available pull up").

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envPath = join(__dirname, '..', '.env.local')
try {
  const envTxt = await readFile(envPath, 'utf8')
  for (const line of envTxt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
} catch (e) {
  console.error('[comp-tester] could not read .env.local:', e.message)
  process.exit(1)
}

const MC_KEY = process.env.MARKETCHECK_API_KEY
const AD_KEY = process.env.AUTODEV_API_KEY
const AD_KEY_2 = process.env.AUTODEV_API_KEY_2
const PORT = 3999
const HTML_PATH = join(__dirname, 'comp-tester.html')

if (!MC_KEY) {
  console.error('[comp-tester] MARKETCHECK_API_KEY missing from .env.local')
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────────────
// Geo helpers
// ──────────────────────────────────────────────────────────────────────────

// Great-circle distance in miles between two lat/lon points.
function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Cached zip → {lat, lon, city, state}. First lookup hits zippopotam.us
// (free, no key); subsequent same-zip lookups are instant.
const zipCache = new Map()
async function zipToCoords(zip) {
  if (!zip) return null
  if (zipCache.has(zip)) return zipCache.get(zip)
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`)
    if (!res.ok) { zipCache.set(zip, null); return null }
    const data = await res.json()
    const place = (data.places || [])[0]
    if (!place) { zipCache.set(zip, null); return null }
    const result = {
      lat: Number(place.latitude),
      lon: Number(place.longitude),
      city: place['place name'],
      state: place['state abbreviation'],
    }
    zipCache.set(zip, result)
    return result
  } catch {
    zipCache.set(zip, null)
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MarketCheck + Auto.dev fetchers
// ──────────────────────────────────────────────────────────────────────────

async function hitMarketcheck(params, pageStart) {
  const includeInactive = params.includeInactive === 'true'
  const mcParams = { ...params }
  delete mcParams.includeInactive
  const qs = new URLSearchParams({
    api_key: MC_KEY,
    rows: '50',
    sort_by: 'miles',
    sort_order: 'asc',
    start: String(pageStart),
    ...mcParams,
  })
  const endpoint = includeInactive ? 'inactive' : 'active'
  const url = `https://mc-api.marketcheck.com/v2/search/car/${endpoint}?${qs}`
  const t0 = Date.now()
  const res = await fetch(url)
  const ms = Date.now() - t0
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { pageStart, status: res.status, ms, error: body.slice(0, 300), listings: [], num_found: null }
  }
  const data = await res.json()
  return {
    pageStart,
    status: 200,
    ms,
    listings: data.listings || [],
    num_found: data.num_found ?? null,
  }
}

async function hitAutodev(params) {
  if (!AD_KEY && !AD_KEY_2) return { status: 'skipped', listings: [], ms: 0 }
  const qs = new URLSearchParams()
  qs.set('vehicle.year', params.year)
  qs.set('vehicle.make', params.make)
  qs.set('vehicle.model', params.model)
  qs.set('limit', '100')
  qs.set('page', '1')
  if (params.zip) qs.set('zip', params.zip)
  if (params.distance) qs.set('distance', params.distance)
  if (params.drivetrain) qs.set('vehicle.drivetrain', params.drivetrain)
  if (params.transmission) qs.set('vehicle.transmission', params.transmission)
  const url = `https://api.auto.dev/listings?${qs}`
  const t0 = Date.now()
  for (const key of [AD_KEY, AD_KEY_2].filter(Boolean)) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
      const ms = Date.now() - t0
      if (res.ok) {
        const data = await res.json()
        return { status: 200, ms, listings: data.data || [] }
      }
      if (res.status !== 402 && res.status !== 429) {
        const body = await res.text().catch(() => '')
        return { status: res.status, ms, error: body.slice(0, 200), listings: [] }
      }
    } catch (e) {
      return { status: 'exception', ms: Date.now() - t0, error: e.message, listings: [] }
    }
  }
  return { status: 'all-keys-exhausted', ms: Date.now() - t0, listings: [] }
}

// MC returns dealer latitude/longitude as STRINGS. Coerce to number;
// returns null if NaN or missing. Same helper used for Auto.dev dealers.
function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeMcListing(l, originCoords) {
  const b = l.build || {}
  const d = l.dealer || {}
  const media = l.media || {}
  const dealerLat = toNum(d.latitude)
  const dealerLon = toNum(d.longitude)
  // Prefer MC's own distance_miles when the search had zip+radius; otherwise
  // compute haversine from our origin to the dealer's lat/lon.
  let distanceMi = toNum(d.distance_miles)
  if (distanceMi === null && originCoords && dealerLat != null && dealerLon != null) {
    distanceMi = haversineMi(originCoords.lat, originCoords.lon, dealerLat, dealerLon)
  }
  return {
    source: 'marketcheck',
    vin: l.vin || null,
    price: Number(l.price) || 0,
    mileage: Number(l.miles) || 0,
    year: b.year || l.year || null,
    make: b.make || l.make || null,
    model: b.model || l.model || null,
    trim: b.trim || l.trim || null,
    engine: b.engine || null,
    transmission: b.transmission || null,
    drivetrain: b.drivetrain || null,
    bodyType: b.body_type || null,
    distanceMi: distanceMi != null ? Math.round(distanceMi) : null,
    dealerLat, dealerLon,
    dealerName: d.name || null,
    dealerCity: d.city || null,
    dealerState: d.state || null,
    dealerZip: d.zip || null,
    link: l.vdp_url || null,
    photo: Array.isArray(media.photo_links) ? media.photo_links[0] : null,
  }
}

function normalizeAdListing(l, originCoords) {
  const v = l.vehicle || {}
  const d = l.dealer || {}
  const dealerLat = toNum(d.latitude)
  const dealerLon = toNum(d.longitude)
  let distanceMi = toNum(l.distance)
  if (distanceMi === null && originCoords && dealerLat != null && dealerLon != null) {
    distanceMi = haversineMi(originCoords.lat, originCoords.lon, dealerLat, dealerLon)
  }
  return {
    source: 'autodev',
    vin: v.vin || null,
    price: Number(l.price) || Number(l.priceUnformatted) || 0,
    mileage: Number(l.mileage) || Number(l.mileageUnformatted) || 0,
    year: v.year || null,
    make: v.make || null,
    model: v.model || null,
    trim: v.trim || null,
    engine: v.engine || null,
    transmission: v.transmission || null,
    drivetrain: v.drivetrain || null,
    bodyType: v.bodyStyle || null,
    distanceMi: distanceMi != null ? Math.round(distanceMi) : null,
    dealerLat, dealerLon,
    dealerName: d.name || null,
    dealerCity: d.city || null,
    dealerState: d.state || null,
    dealerZip: d.postalCode || null,
    link: l.clickoffUrl || l.detailUrl || null,
    photo: Array.isArray(l.photoUrls) ? l.photoUrls[0] : null,
  }
}

// Hams-style client filter: drop no-VIN + no-price + dedup by VIN
function applyBaseFilter(listings) {
  const seen = new Set()
  const kept = []
  const dropped = { noVin: 0, noPrice: 0, dupVin: 0 }
  for (const l of listings) {
    if (!l.vin) { dropped.noVin++; continue }
    if (!l.price || l.price <= 0) { dropped.noPrice++; continue }
    if (seen.has(l.vin)) { dropped.dupVin++; continue }
    seen.add(l.vin)
    kept.push(l)
  }
  return { kept, dropped }
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP server
// ──────────────────────────────────────────────────────────────────────────

createServer(async (req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) {
    try {
      const html = await readFile(HTML_PATH, 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch (e) {
      res.writeHead(500); res.end('could not read comp-tester.html: ' + e.message)
    }
    return
  }

  if (req.url.startsWith('/search?')) {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const p = url.searchParams
    const input = {
      mode: p.get('mode') || 'radius',  // 'radius' | 'nationwide'
      year: p.get('year') || '',
      make: p.get('make') || '',
      model: p.get('model') || '',
      trim: p.get('trim') || '',
      drivetrain: p.get('drivetrain') || '',
      transmission: p.get('transmission') || '',
      engine: p.get('engine') || '',
      zip: p.get('zip') || '',
      radius: Number(p.get('radius') || '150'),  // in nationwide mode: post-filter radius
      includeInactive: p.get('includeInactive') || 'false',
      vehicleMileage: Number(p.get('vehicleMileage') || '0'),  // subject vehicle mileage
      mileagePct: Number(p.get('mileagePct') || '30'),  // ±% tolerance
      fallbackOnEmpty: p.get('fallbackOnEmpty') === 'true',
    }

    // Resolve claim zip → origin coords (needed in nationwide mode).
    const origin = input.zip ? await zipToCoords(input.zip) : null

    // Build MC query params per mode.
    const mcQueryParams = {
      year: input.year, make: input.make, model: input.model,
    }
    const genericTrims = ['base', 'standard', 'n/a', 'other', '']
    const trimParam = genericTrims.includes(input.trim.toLowerCase().trim()) ? '' : input.trim
    if (trimParam) mcQueryParams.trim = trimParam
    if (input.drivetrain) mcQueryParams.drivetrain = input.drivetrain
    if (input.transmission) mcQueryParams.transmission = input.transmission
    if (input.engine) mcQueryParams.engine = input.engine
    if (input.includeInactive === 'true') mcQueryParams.includeInactive = 'true'
    if (input.mode === 'radius' && input.zip) {
      mcQueryParams.zip = input.zip
      // In radius mode, cap at 100 to simulate downgraded plan; use original
      // radius if > 100 hams would reject.
      mcQueryParams.radius = String(input.radius)
    }
    // nationwide mode: no zip/radius sent → MC returns from everywhere

    const t0 = Date.now()
    const [p0, p1, p2, p3, ad] = await Promise.all([
      hitMarketcheck(mcQueryParams, 0),
      hitMarketcheck(mcQueryParams, 50),
      hitMarketcheck(mcQueryParams, 100),
      hitMarketcheck(mcQueryParams, 150),
      input.mode === 'radius' && input.zip
        ? hitAutodev({ ...input, distance: input.radius })
        : hitAutodev({ ...input, distance: '' }),  // nationwide for AD too
    ])
    const totalMs = Date.now() - t0

    const mcPages = [p0, p1, p2, p3]
    const rawMc = mcPages.flatMap(pg => pg.listings).map(l => normalizeMcListing(l, origin))
    const rawAd = (ad.listings || []).map(l => normalizeAdListing(l, origin))
    const rawAll = [...rawMc, ...rawAd]

    // Stage 1: base filter (no-VIN, no-price, dup-VIN)
    const stage1 = applyBaseFilter(rawAll)

    // Stage 2: distance filter (only meaningful in nationwide mode OR if user
    // explicitly wants to tighten MC's radius result).
    const needsDistanceFilter = input.mode === 'nationwide' && origin
    let afterDistance = stage1.kept
    let droppedByDistance = 0
    if (needsDistanceFilter) {
      afterDistance = stage1.kept.filter(l => {
        if (l.distanceMi == null) return false  // can't check → drop
        return l.distanceMi <= input.radius
      })
      droppedByDistance = stage1.kept.length - afterDistance.length
    }

    // Stage 3: mileage filter (±X% of subject vehicle mileage).
    let afterMileage = afterDistance
    let droppedByMileage = 0
    let fallbackApplied = false
    if (input.vehicleMileage > 0 && input.mileagePct > 0) {
      const lo = input.vehicleMileage * (1 - input.mileagePct / 100)
      const hi = input.vehicleMileage * (1 + input.mileagePct / 100)
      const strictMatches = afterDistance.filter(l => l.mileage >= lo && l.mileage <= hi)
      if (strictMatches.length === 0 && input.fallbackOnEmpty) {
        fallbackApplied = true
        afterMileage = afterDistance  // show everything
      } else {
        afterMileage = strictMatches
        droppedByMileage = afterDistance.length - strictMatches.length
      }
    }

    // Sort final list by distance ascending (closest first).
    const final = [...afterMileage].sort((a, b) => {
      const ad = a.distanceMi == null ? Infinity : a.distanceMi
      const bd = b.distanceMi == null ? Infinity : b.distanceMi
      return ad - bd
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      input,
      origin,
      mcQueryParams,
      totalMs,
      marketcheck: {
        numFoundTotal: p0.num_found,
        pages: mcPages.map(pg => ({
          start: pg.pageStart, status: pg.status, ms: pg.ms,
          returned: pg.listings.length, error: pg.error,
        })),
        totalReturned: rawMc.length,
      },
      autodev: {
        status: ad.status, ms: ad.ms, returned: rawAd.length, error: ad.error,
      },
      pipeline: {
        rawTotal: rawAll.length,
        afterBase: stage1.kept.length,
        droppedBase: stage1.dropped,
        afterDistance: afterDistance.length,
        droppedByDistance,
        afterMileage: afterMileage.length,
        droppedByMileage,
        fallbackApplied,
      },
      listings: final,
    }))
    return
  }

  res.writeHead(404); res.end('404')
}).listen(PORT, () => {
  console.log(`\n  Comp Finder Tester v2 listening at:  http://localhost:${PORT}`)
  console.log('  Modes: radius (current hams) | nationwide (new downgraded-plan)')
  console.log('  Press Ctrl+C to stop.\n')
})
