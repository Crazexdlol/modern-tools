import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const year = p.get('year')
  const make = p.get('make')
  const model = p.get('model')
  const zip = p.get('zip') || ''
  const radius = p.get('radius') || '150'

  if (!year || !make || !model || !zip) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY

  const params = new URLSearchParams({
    api_key: apiKey!,
    year,
    make,
    model,
    zip,
    radius,
    rows: '50',
    sort_by: 'price',
    sort_order: 'asc',
  })

  const mapListings = (data: Record<string, unknown>) => {
    return (data.listings as Record<string, unknown>[] ?? []).filter((l: Record<string, unknown>) => l.price && Number(l.price) > 0).map((l: Record<string, unknown>) => {
      const dealer = (l.dealer as Record<string, unknown>) ?? {}
      const media = (l.media as Record<string, unknown>) ?? {}
      const build = (l.build as Record<string, unknown>) ?? {}
      const photoLinks = (media.photo_links as string[]) ?? []
      return {
        id: l.id ?? l.vin ?? String(Math.random()),
        vin: (l.vin ?? '') as string,
        price: l.price as number,
        miles: (l.miles ?? (build.miles as number) ?? 0) as number,
        year: (l.year ?? (build.year as number) ?? 0) as number,
        make: (l.make ?? (build.make as string) ?? '') as string,
        model: (l.model ?? (build.model as string) ?? '') as string,
        trim: (l.trim ?? (build.trim as string) ?? '') as string,
        engine: (build.engine ?? l.engine ?? '') as string,
        drivetrain: (build.drivetrain ?? l.drivetrain ?? '') as string,
        transmission: (build.transmission ?? l.transmission ?? '') as string,
        dealerName: (dealer.name ?? '') as string,
        dealerPhone: (dealer.phone ?? '') as string,
        dealerCity: (dealer.city ?? '') as string,
        dealerState: (dealer.state ?? '') as string,
        photoUrl: (photoLinks[0] ?? '') as string,
        heading: (l.heading ?? '') as string,
        distanceMi: l.dist ? Math.round(Number(l.dist)) : 0,
        vdpUrl: (l.vdp_url ?? l.ref_url ?? (dealer.website as string) ?? '') as string,
      }
    })
  }

  try {
    // Search both active and inactive in parallel
    const [activeRes, inactiveRes] = await Promise.all([
      fetch(`https://mc-api.marketcheck.com/v2/search/car/active?${params}`),
      fetch(`https://mc-api.marketcheck.com/v2/search/car/inactive?${params}`),
    ])

    if (!activeRes.ok && !inactiveRes.ok) throw new Error(`Marketcheck ${activeRes.status}`)

    const activeListings = activeRes.ok ? mapListings(await activeRes.json()) : []
    const inactiveListings = inactiveRes.ok ? mapListings(await inactiveRes.json()) : []

    // Combine and deduplicate by VIN
    const seen = new Set<string>()
    const listings = [...activeListings, ...inactiveListings].filter((l) => {
      if (!l.vin || seen.has(l.vin)) return false
      seen.add(l.vin)
      return true
    })

    return NextResponse.json({ listings, numFound: listings.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
