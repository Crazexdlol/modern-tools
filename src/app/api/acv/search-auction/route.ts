import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const p = request.nextUrl.searchParams
  const year = p.get('year')
  const make = p.get('make')
  const model = p.get('model')
  const trim = p.get('trim') || ''
  const zip = p.get('zip') || ''
  const radius = p.get('radius') || '150'
  const nationwide = p.get('nationwide') === 'true'

  if (!year || !make || !model || (!zip && !nationwide)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY

  const baseParams: Record<string, string> = {
    api_key: apiKey!,
    year,
    make,
    model,
    rows: '50',
    sort_by: 'price',
    sort_order: 'asc',
    seller_type: 'dealer',
    ...(zip && !nationwide ? { zip, radius } : {}),
    ...(trim ? { trim } : {}),
  }

  const mapListing = (l: Record<string, unknown>) => {
    const dealer = (l.dealer as Record<string, unknown>) ?? {}
    const media = (l.media as Record<string, unknown>) ?? {}
    const build = (l.build as Record<string, unknown>) ?? {}
    const photoLinks = (media.photo_links as string[]) ?? []
    return {
      id: l.id,
      vin: l.vin,
      price: l.price,
      miles: l.miles ?? 0,
      year: build.year ?? l.year,
      make: build.make ?? l.make,
      model: build.model ?? l.model,
      trim: build.trim ?? l.trim ?? '',
      heading: l.heading ?? '',
      vdpUrl: l.vdp_url ?? '',
      source: l.source ?? '',
      exteriorColor: l.exterior_color ?? '',
      bodyType: build.body_type ?? '',
      transmission: build.transmission ?? '',
      drivetrain: build.drivetrain ?? '',
      engine: build.engine ?? '',
      dealerName: dealer.name ?? '',
      dealerCity: dealer.city ?? '',
      dealerState: dealer.state ?? '',
      dealerPhone: dealer.phone ?? '',
      photoUrl: photoLinks[0] ?? '',
      photoCount: photoLinks.length,
      dom: l.dom ?? 0,
      dist: l.dist ?? 0,
    }
  }

  try {
    // Search both active and inactive (sold) listings with non-clean titles
    // to maximize results for accident-history vehicles
    const [activeRes, inactiveRes] = await Promise.all([
      fetch(`https://mc-api.marketcheck.com/v2/search/car/active?${new URLSearchParams({
        ...baseParams,
        carfax_clean_title: 'false',
      })}`),
      fetch(`https://mc-api.marketcheck.com/v2/search/car/inactive?${new URLSearchParams({
        ...baseParams,
        carfax_clean_title: 'false',
      })}`),
    ])

    const allRaw: Record<string, unknown>[] = []
    for (const res of [activeRes, inactiveRes]) {
      if (!res.ok) continue
      const data = await res.json()
      allRaw.push(...(data.listings ?? []))
    }

    // Deduplicate by VIN, filter $0
    const seen = new Set<string>()
    let listings = allRaw
      .filter((l) => l.price && Number(l.price) > 0)
      .filter((l) => {
        const vin = (l.vin as string) ?? ''
        if (!vin || seen.has(vin)) return false
        seen.add(vin)
        return true
      })
      .map(mapListing)

    // If strict carfax filter returned too few, retry without it to broaden results
    if (listings.length < 3) {
      const fallbackRes = await fetch(
        `https://mc-api.marketcheck.com/v2/search/car/active?${new URLSearchParams(baseParams)}`
      )
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json()
        const fallbackRaw: Record<string, unknown>[] = fallbackData.listings ?? []
        const fallbackListings = fallbackRaw
          .filter((l) => l.price && Number(l.price) > 0)
          .filter((l) => {
            const vin = (l.vin as string) ?? ''
            if (!vin || seen.has(vin)) return false
            seen.add(vin)
            return true
          })
          .map(mapListing)
        listings = [...listings, ...fallbackListings]
      }
    }

    return NextResponse.json({ listings, numFound: listings.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
