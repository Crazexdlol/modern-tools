import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'

// VINs never contain I, O, or Q — auto-correct common typos
function sanitizeVin(vin: string): string {
  return vin.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/Q/g, '9')
}

async function decodeWithMarketCheck(vin: string, apiKey: string) {
  const url = `https://mc-api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.year && !data.make) return null
  return {
    year: data.year,
    make: data.make,
    model: data.model,
    trim: data.trim,
    engine: data.engine || '',
    drivetrain: data.drivetrain || '',
    transmission: data.transmission || '',
    fuelType: normalizeFuelType(data.fuel_type || data.powertrain_type || ''),
    bodyStyle: data.body_style || '',
  }
}

async function decodeWithNHTSA(vin: string) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const r = data.Results?.[0]
  if (!r || !r.ModelYear) return null

  const driveMap: Record<string, string> = {
    'FWD': 'FWD', 'RWD': 'RWD', 'AWD': 'AWD', '4WD': '4WD',
    'Front-Wheel Drive': 'FWD', 'Rear-Wheel Drive': 'RWD',
    'All-Wheel Drive': 'AWD', '4x4': '4WD',
  }

  const fuelRaw = [r.ElectrificationLevel, r.FuelTypePrimary, r.FuelTypeSecondary].filter(Boolean).join(' ')

  return {
    year: parseInt(r.ModelYear) || 0,
    make: r.Make || '',
    model: r.Model || '',
    trim: r.Trim || '',
    engine: [r.DisplacementL ? `${r.DisplacementL}L` : '', r.EngineCylinders ? `${r.EngineCylinders}cyl` : ''].filter(Boolean).join(' ') || '',
    drivetrain: driveMap[r.DriveType] || r.DriveType || '',
    transmission: r.TransmissionStyle || '',
    fuelType: normalizeFuelType(fuelRaw),
    bodyStyle: r.BodyClass || '',
  }
}

function normalizeFuelType(raw: string): string {
  const s = (raw || '').toLowerCase()
  if (!s) return ''
  if (s.includes('plug-in') || s.includes('plug in') || s.includes('phev')) return 'Plug-in Hybrid'
  if (s.includes('hybrid') || s.includes('hev')) return 'Hybrid'
  if (s.includes('electric') || s.includes('bev') || s.includes('ev')) return 'Electric'
  if (s.includes('diesel')) return 'Diesel'
  if (s.includes('flex') || s.includes('e85')) return 'Flex Fuel'
  if (s.includes('gasoline') || s.includes('gas') || s.includes('petrol')) return 'Gasoline'
  return ''
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  let vin = request.nextUrl.searchParams.get('vin')
  if (!vin || vin.length !== 17) {
    return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 })
  }

  vin = sanitizeVin(vin)
  const apiKey = process.env.MARKETCHECK_API_KEY

  try {
    // Try MarketCheck first, fall back to NHTSA
    let result = apiKey ? await decodeWithMarketCheck(vin, apiKey) : null
    if (!result) {
      result = await decodeWithNHTSA(vin)
    }
    if (!result) {
      return NextResponse.json({ error: 'Could not decode VIN' }, { status: 422 })
    }
    return NextResponse.json({ ...result, vin })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'VIN decode failed' },
      { status: 500 }
    )
  }
}
