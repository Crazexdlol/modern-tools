import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { decodeVin, sanitizeVin } from '@/lib/acv/decode-vin'

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const raw = request.nextUrl.searchParams.get('vin')
  if (!raw || raw.length !== 17) {
    return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 })
  }
  const vin = sanitizeVin(raw)
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
    return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 })
  }
  try {
    const result = await decodeVin(vin)
    if (!result) {
      return NextResponse.json({ error: 'Could not decode VIN' }, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'VIN decode failed' },
      { status: 500 }
    )
  }
}
