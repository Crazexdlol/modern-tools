import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'

async function getAvgPrice(
  make: string,
  model: string,
  year: number,
  zip: string,
  apiKey: string
): Promise<number | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    make,
    model,
    year: String(year),
    zip,
    radius: '300',
    rows: '20',
  })
  const res = await fetch(
    `https://mc-api.marketcheck.com/v2/search/car/active?${params}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const listings = data.listings ?? []
  if (listings.length === 0) return null
  const prices = listings
    .map((l: Record<string, unknown>) => Number(l.price))
    .filter((p: number) => p > 0)
  return prices.length > 0
    ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length
    : null
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const p = request.nextUrl.searchParams
  const make = p.get('make')
  const model = p.get('model')
  const year = Number(p.get('year'))
  const zip = p.get('zip')

  if (!make || !model || !year || !zip) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY!

  try {
    const [avgCurrent, avgPrevYear] = await Promise.all([
      getAvgPrice(make, model, year, zip, apiKey),
      getAvgPrice(make, model, year - 1, zip, apiKey),
    ])

    let depreciationPerYear = 0
    if (avgCurrent !== null && avgPrevYear !== null) {
      depreciationPerYear = avgCurrent - avgPrevYear
    }

    return NextResponse.json({ avgCurrent, avgPrevYear, depreciationPerYear })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
