import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const year = p.get('year')
  const make = p.get('make')
  const model = p.get('model')
  const trim = p.get('trim') || ''
  const zip = p.get('zip')
  const radius = p.get('radius') || '150'
  const includeInactive = p.get('includeInactive') === 'true'

  if (!year || !make || !model || !zip) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY
  const endpoint = includeInactive ? 'inactive' : 'active'

  const params = new URLSearchParams({
    api_key: apiKey!,
    year,
    make,
    model,
    zip,
    radius,
    rows: '30',
    sort_by: 'price',
    sort_order: 'asc',
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
        miles: l.miles ?? 0,
        year: l.year ?? 0,
        make: l.make ?? '',
        model: l.model ?? '',
        trim: l.trim ?? '',
        engine: build.engine ?? l.engine ?? '',
        drivetrain: build.drivetrain ?? l.drivetrain ?? '',
        transmission: build.transmission ?? l.transmission ?? '',
        dealerName: dealer.name ?? '',
        dealerPhone: dealer.phone ?? '',
        dealerCity: dealer.city ?? '',
        dealerState: dealer.state ?? '',
        photoUrl: photoLinks[0] ?? '',
        heading: l.heading ?? '',
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
