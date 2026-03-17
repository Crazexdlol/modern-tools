import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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

  const params = new URLSearchParams({
    api_key: apiKey!,
    year,
    make,
    model,
    rows: '50',
    sort_by: 'price',
    sort_order: 'asc',
    carfax_clean_title: 'false',
    seller_type: 'dealer',
    ...(zip && !nationwide ? { zip, radius } : {}),
    ...(trim ? { trim } : {}),
  })

  try {
    const url = `https://mc-api.marketcheck.com/v2/search/car/active?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Marketcheck ${res.status}`)
    const data = await res.json()

    const listings = (data.listings ?? []).filter((l: Record<string, unknown>) => l.price && Number(l.price) > 0).map((l: Record<string, unknown>) => {
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
    })

    return NextResponse.json({ listings, numFound: data.num_found ?? listings.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
