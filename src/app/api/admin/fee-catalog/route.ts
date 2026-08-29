import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    code?: string
    label?: string
    unit?: 'flat' | 'per_mile'
    sortOrder?: number
  } | null

  if (!body?.code || !body?.label) {
    return NextResponse.json({ error: 'code and label required' }, { status: 400 })
  }
  const unit = body.unit === 'per_mile' ? 'per_mile' : 'flat'

  const service = createServiceClient()
  const { data, error } = await service.from('fee_catalog').insert({
    code: body.code,
    label: body.label,
    unit,
    sort_order: body.sortOrder ?? 999,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, entry: data })
}
