import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const year = p.get('year')
  const make = p.get('make')
  const model = p.get('model')
  const trim = p.get('trim') || ''
  const zip = p.get('zip') || ''
  const radius = p.get('radius') || '150'
  const nationwide = radius === '0' || p.get('nationwide') === 'true'
  const includeInactive = p.get('includeInactive') === 'true'

  if (!year || !make || !model || (!zip && !nationwide)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY
  const endpoint = includeInactive ? 'inactive' : 'active'

  const params = new URLSearchParams({
    api_key: apiKey!,
    year,
    make,
    model,
    rows: '30',
    sort_by: 'price',
    sort_order: 'asc',
    ...(zip && !nationwide ? { zip, radius } : {}),
    ...(trim ? { trim } : {}),
  })

  try {
    const url = `https://mc-api.marketcheck.com/v2/search/car/${endpoint}?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Marketcheck ${res.status}`)
    const data = await res.json()

    const listings = (data.listings ?? []).filter((l: Record<string, unknown>) => l.price && Number(l.price) > 0).map((l: Record<string, unknown>) => {
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
        vdpUrl: l.vdp_url ?? '',
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
