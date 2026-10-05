import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { rateLimit } from '@/lib/rate-limit'
import { mirrorListings } from '@/lib/comps-db/mirror-listings'

// Module-level cache: which Auto.dev keys have hit their monthly quota.
// Resets when Vercel cycles the lambda (cold start).
const adKeyExhausted: Record<string, boolean> = {}

async function fetchAutoDev(url: string): Promise<Response | null> {
  const keys = [process.env.AUTODEV_API_KEY, process.env.AUTODEV_API_KEY_2].filter(
    (k): k is string => Boolean(k)
  )
  if (keys.length === 0) return null

  let lastRes: Response | null = null
  for (const key of keys) {
    if (adKeyExhausted[key]) continue
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    if (res.ok) return res
    // 402 Payment Required and 429 Too Many Requests indicate quota exhaustion.
    if (res.status === 402 || res.status === 429) {
      adKeyExhausted[key] = true
      lastRes = res
      continue
    }
    return res
  }
  return lastRes
}

function normalizeFuelType(raw: string): string {
  const s = (raw || '').toLowerCase()
  if (!s) return ''
  if (s.includes('plug-in') || s.includes('plug in') || s.includes('phev')) return 'Plug-in Hybrid'
  if (s.includes('hybrid') || s.includes('hev')) return 'Hybrid'
  if (s.includes('electric') || s.includes('bev') || s === 'ev') return 'Electric'
  if (s.includes('diesel')) return 'Diesel'
  if (s.includes('flex') || s.includes('e85')) return 'Flex Fuel'
  if (s.includes('gasoline') || s.includes('gas') || s.includes('petrol') || s.includes('unleaded')) return 'Gasoline'
  return ''
}

type AutoDevListing = {
  vin?: string
  createdAt?: string
  history?: {
    accidents?: boolean
    accidentCount?: number
    ownerCount?: number
    oneOwner?: boolean
  }
  vehicle?: {
    year?: number
    make?: string
    model?: string
    trim?: string
    series?: string
    drivetrain?: string
    transmission?: string
    engine?: string
    fuel?: string
  }
  retailListing?: {
    price?: number
    miles?: number
    dealer?: string
    city?: string
    state?: string
    zip?: string
    primaryImage?: string
    vdp?: string
  } | null
}

type NormalizedListing = {
  id: string
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  dealerName: string
  dealerPhone: string
  dealerCity: string
  dealerState: string
  dealerZip: string
  photoUrl: string
  heading: string
  distanceMi: number
  vdpUrl: string
  firstSeenAt: string | null
  priorAccident: boolean | null
  priorOwnerCount: number | null
  source: 'marketcheck' | 'autodev'
}

function normalizeMarketcheck(items: Record<string, unknown>[]): NormalizedListing[] {
  const out: NormalizedListing[] = []
  for (const l of items) {
    const dealer = (l.dealer as Record<string, unknown>) ?? {}
    const media = (l.media as Record<string, unknown>) ?? {}
    const build = (l.build as Record<string, unknown>) ?? {}
    const photoLinks = (media.photo_links as string[]) ?? []
    out.push({
      id: (l.id as string) ?? (l.vin as string) ?? String(Math.random()),
      vin: (l.vin as string) ?? '',
      price: Number(l.price ?? 0),
      miles: Number((l.miles as number) ?? (build.miles as number) ?? 0),
      year: Number((l.year as number) ?? (build.year as number) ?? 0),
      make: (l.make as string) ?? (build.make as string) ?? '',
      model: (l.model as string) ?? (build.model as string) ?? '',
      trim: (l.trim as string) ?? (build.trim as string) ?? '',
      engine: ((build.engine as string) ?? (l.engine as string) ?? '') as string,
      drivetrain: ((build.drivetrain as string) ?? (l.drivetrain as string) ?? '') as string,
      transmission: ((build.transmission as string) ?? (l.transmission as string) ?? '') as string,
      fuelType: normalizeFuelType(
        (build.fuel_type as string) ?? (l.fuel_type as string) ?? (build.powertrain_type as string) ?? ''
      ),
      dealerName: (dealer.name as string) ?? '',
      dealerPhone: (dealer.phone as string) ?? '',
      dealerCity: (dealer.city as string) ?? '',
      dealerState: (dealer.state as string) ?? '',
      dealerZip: (dealer.zip as string) ?? '',
      photoUrl: photoLinks[0] ?? '',
      heading: (l.heading as string) ?? '',
      distanceMi: l.dist ? Math.round(Number(l.dist)) : 0,
      vdpUrl: ((l.vdp_url as string) ?? (l.ref_url as string) ?? (dealer.website as string) ?? '') as string,
      firstSeenAt:
        (l.first_seen_at_date as string) ??
        (typeof l.first_seen_at === 'number' ? new Date((l.first_seen_at as number) * 1000).toISOString() : null),
      // MarketCheck doesn't expose accident history on their free tier —
      // carfax_clean_title means "not a branded title" which is NOT the same
      // as "no accidents." Leaving null is more honest than lying.
      priorAccident: null,
      // Only derivable when carfax_1_owner is explicitly true. False means
      // "more than one owner" with no exact count; leave null in that case.
      priorOwnerCount: l.carfax_1_owner === true ? 1 : null,
      source: 'marketcheck',
    })
  }
  return out
}

function normalizeAutodev(items: AutoDevListing[]): NormalizedListing[] {
  const out: NormalizedListing[] = []
  for (const l of items) {
    if (!l.retailListing) continue
    const v = l.vehicle ?? {}
    const r = l.retailListing
    const heading =
      v.series ||
      [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ').trim()
    out.push({
      id: l.vin ?? String(Math.random()),
      vin: l.vin ?? '',
      price: Number(r.price ?? 0),
      miles: Number(r.miles ?? 0),
      year: Number(v.year ?? 0),
      make: v.make ?? '',
      model: v.model ?? '',
      trim: v.trim ?? '',
      engine: v.engine ?? '',
      drivetrain: v.drivetrain ?? '',
      transmission: v.transmission ?? '',
      fuelType: normalizeFuelType(v.fuel ?? ''),
      dealerName: r.dealer ?? '',
      dealerPhone: '',
      dealerCity: r.city ?? '',
      dealerState: r.state ?? '',
      dealerZip: r.zip ?? '',
      photoUrl: r.primaryImage ?? '',
      heading,
      distanceMi: 0,
      vdpUrl: r.vdp ?? '',
      firstSeenAt: l.createdAt ?? null,
      priorAccident:
        typeof l.history?.accidents === 'boolean'
          ? l.history.accidents
          : typeof l.history?.accidentCount === 'number'
            ? l.history.accidentCount > 0
            : null,
      priorOwnerCount: typeof l.history?.ownerCount === 'number' ? l.history.ownerCount : null,
      source: 'autodev',
    })
  }
  return out
}

export async function GET(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const limit = rateLimit(`search-comps:${caller!.userId}`, 3000, 3600)
  if (!limit.ok) {
    console.warn(`[search-comps] rate limit tripped for ${caller!.userId}, retry in ${limit.resetInSeconds}s`)
    return NextResponse.json(
      { error: `Rate limit exceeded, try again in ${limit.resetInSeconds} seconds` },
      { status: 429 },
    )
  }
  const p = request.nextUrl.searchParams
  const year = p.get('year')
  const make = p.get('make')
  const model = p.get('model')
  const zip = p.get('zip') || ''
  const radius = p.get('radius') || '150'
  const nationwide = radius === '0' || p.get('nationwide') === 'true'
  const includeInactive = p.get('includeInactive') === 'true'

  if (!year || !make || !model || (!zip && !nationwide)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const trim = p.get('trim') || ''
  const drivetrain = p.get('drivetrain') || ''
  const transmission = p.get('transmission') || ''
  const engine = p.get('engine') || ''

  const genericTrims = ['base', 'standard', 'n/a', 'other', '']
  const trimParam = genericTrims.includes(trim.toLowerCase().trim()) ? '' : trim

  const mcKey = process.env.MARKETCHECK_API_KEY
  const endpoint = includeInactive ? 'inactive' : 'active'

  const mcParams: Record<string, string> = {
    api_key: mcKey ?? '',
    year,
    make,
    model,
    rows: '50',
    sort_by: 'miles',
    sort_order: 'asc',
    ...(zip && !nationwide ? { zip, radius } : {}),
    ...(trimParam ? { trim: trimParam } : {}),
    ...(drivetrain ? { drivetrain } : {}),
    ...(transmission ? { transmission } : {}),
    ...(engine ? { engine } : {}),
  }

  const mcPages = [0, 50, 100, 150]

  const adUrl = `https://api.auto.dev/listings?${new URLSearchParams({
    'vehicle.year': year,
    'vehicle.make': make,
    'vehicle.model': model,
    limit: '100',
    page: '1',
    ...(zip && !nationwide ? { zip, distance: radius } : {}),
    ...(drivetrain ? { 'vehicle.drivetrain': drivetrain } : {}),
    ...(transmission ? { 'vehicle.transmission': transmission } : {}),
  })}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (msg: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'))
      }

      let mcOk = false
      let adOk = false
      // Mirror writes run concurrently with the stream but we await them before
      // closing the controller so Vercel doesn't freeze the lambda mid-write.
      // User-visible output is unaffected — write() happens before the mirror
      // promise is kicked off.
      const mirrorPromises: Promise<unknown>[] = []

      const mcTasks = mcKey
        ? mcPages.map(async (start) => {
            try {
              const params = new URLSearchParams({ ...mcParams, start: String(start) })
              const res = await fetch(`https://mc-api.marketcheck.com/v2/search/car/${endpoint}?${params}`)
              if (!res.ok) return
              const data = await res.json()
              const items = (data.listings ?? []) as Record<string, unknown>[]
              const normalized = normalizeMarketcheck(items)
              mcOk = true
              write({ type: 'listings', source: 'marketcheck', listings: normalized })
              // Mirror into the comparable-vehicles DB. Stored as generic
              // dealer-scrape rows (data_provider='scrape', source=dealer_domain)
              // — see src/lib/comps-db/mirror-listings.ts.
              mirrorPromises.push(
                mirrorListings(normalized, { active: !includeInactive }).catch((err) => {
                  console.error('[comps-mirror mc]', err instanceof Error ? err.message : err)
                }),
              )
            } catch {
              // skip failed page
            }
          })
        : []

      const adTask = !includeInactive
        ? (async () => {
            try {
              const res = await fetchAutoDev(adUrl)
              if (!res || !res.ok) return
              const data = await res.json()
              const items = (data?.data ?? []) as AutoDevListing[]
              const normalized = normalizeAutodev(items)
              adOk = true
              write({ type: 'listings', source: 'autodev', listings: normalized })
              // Mirror Auto.dev results the same way as MarketCheck —
              // stored as generic scrape rows, deduped by listing_url.
              mirrorPromises.push(
                mirrorListings(normalized, { active: true }).catch((err) => {
                  console.error('[comps-mirror ad]', err instanceof Error ? err.message : err)
                }),
              )
            } catch {
              // skip
            }
          })()
        : null

      await Promise.allSettled([...mcTasks, ...(adTask ? [adTask] : [])])

      if (!mcOk && !adOk) {
        write({ type: 'error', error: 'All listing sources failed' })
      } else {
        write({ type: 'done', sources: { marketcheck: mcOk, autodev: adOk } })
      }

      // Keep the lambda alive until background mirror writes finish. The
      // user has already received every NDJSON frame including 'done' at
      // this point — this just lets the background DB writes complete.
      await Promise.allSettled(mirrorPromises)

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
