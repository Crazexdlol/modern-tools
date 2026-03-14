import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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

  const apiKey = process.env.MARKETCHECK_API_KEY
  const endpoint = includeInactive ? 'inactive' : 'active'

  const baseParams: Record<string, string> = {
    api_key: apiKey!,
    year,
    make,
    model,
    rows: '50',
    sort_by: 'miles',
    sort_order: 'asc',
    ...(zip && !nationwide ? { zip, radius } : {}),
  }

  try {
    // Fetch multiple pages in parallel to get up to 200 results
    const pages = [0, 50, 100, 150]
    const fetches = pages.map((start) => {
      const params = new URLSearchParams({ ...baseParams, start: String(start) })
      return fetch(`https://mc-api.marketcheck.com/v2/search/car/${endpoint}?${params}`)
    })

    const responses = await Promise.all(fetches)
    const firstRes = responses[0]
    if (!firstRes.ok) throw new Error(`Marketcheck ${firstRes.status}`)

    const allListings: Record<string, unknown>[] = []
    for (const res of responses) {
      if (!res.ok) continue
      const data = await res.json()
      allListings.push(...(data.listings ?? []))
    }

    // Deduplicate by VIN and filter out $0 listings
    const seen = new Set<string>()
    const listings = allListings
      .filter((l) => l.price && Number(l.price) > 0)
      .filter((l) => {
        const vin = (l.vin as string) ?? ''
        if (!vin || seen.has(vin)) return false
        seen.add(vin)
        return true
      })
      .map((l) => {
        const dealer = (l.dealer as Record<string, unknown>) ?? {}
        const media = (l.media as Record<string, unknown>) ?? {}
        const build = (l.build as Record<string, unknown>) ?? {}
        const photoLinks = (media.photo_links as string[]) ?? []
        return {
          id: l.id ?? l.vin ?? String(Math.random()),
          vin: l.vin ?? '',
          price: l.price,
          miles: l.miles ?? (build.miles as number) ?? 0,
          year: l.year ?? (build.year as number) ?? 0,
          make: l.make ?? (build.make as string) ?? '',
          model: l.model ?? (build.model as string) ?? '',
          trim: l.trim ?? (build.trim as string) ?? '',
          engine: build.engine ?? l.engine ?? '',
          drivetrain: build.drivetrain ?? l.drivetrain ?? '',
          transmission: build.transmission ?? l.transmission ?? '',
          dealerName: dealer.name ?? '',
          dealerPhone: dealer.phone ?? '',
          dealerCity: dealer.city ?? '',
          dealerState: dealer.state ?? '',
          photoUrl: photoLinks[0] ?? '',
          heading: l.heading ?? '',
          distanceMi: l.dist ? Math.round(Number(l.dist)) : 0,
          vdpUrl: (l.vdp_url ?? l.ref_url ?? (dealer.website as string) ?? '') as string,
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
