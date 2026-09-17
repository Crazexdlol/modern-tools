import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { rateLimit } from '@/lib/rate-limit'

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

export async function GET(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const limit = rateLimit(`search-autodev:${caller!.userId}`, 3000, 3600)
  if (!limit.ok) {
    console.warn(`[search-autodev] rate limit tripped for ${caller!.userId}, retry in ${limit.resetInSeconds}s`)
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

  if (!year || !make || !model || (!zip && !nationwide)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.AUTODEV_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AUTODEV_API_KEY not set' }, { status: 500 })
  }

  const params = new URLSearchParams({
    'vehicle.year': year,
    'vehicle.make': make,
    'vehicle.model': model,
    limit: '100',
    page: '1',
    ...(zip && !nationwide ? { zip, distance: radius } : {}),
  })

  try {
    const res = await fetch(`https://api.auto.dev/listings?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Auto.dev ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 }
      )
    }

    const json = await res.json()
    const data: AutoDevListing[] = json?.data ?? []

    const seen = new Set<string>()
    const listings = data
      .filter((l) => l.retailListing && Number(l.retailListing.price ?? 0) > 0)
      .filter((l) => {
        const vin = l.vin ?? ''
        if (!vin || seen.has(vin)) return false
        seen.add(vin)
        return true
      })
      .map((l) => {
        const v = l.vehicle ?? {}
        const r = l.retailListing!
        const heading =
          v.series ||
          [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ').trim()
        return {
          id: l.vin ?? String(Math.random()),
          vin: l.vin ?? '',
          price: r.price ?? 0,
          miles: r.miles ?? 0,
          year: v.year ?? 0,
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
          photoUrl: r.primaryImage ?? '',
          heading,
          distanceMi: 0,
          vdpUrl: r.vdp ?? '',
          source: 'autodev',
        }
      })

    return NextResponse.json({ listings, numFound: listings.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
