import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const vin = request.nextUrl.searchParams.get('vin')
  if (!vin || vin.length !== 17) {
    return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 })
  }

  const apiKey = process.env.MARKETCHECK_API_KEY
  const url = `https://mc-api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Marketcheck error: ${res.status}`)
    const data = await res.json()
    return NextResponse.json({
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      engine: data.engine || '',
      drivetrain: data.drivetrain || '',
      transmission: data.transmission || '',
      bodyStyle: data.body_style || '',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'VIN decode failed' },
      { status: 500 }
    )
  }
}
