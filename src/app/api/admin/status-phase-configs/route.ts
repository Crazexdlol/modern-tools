import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const ALLOWED_COLORS = ['green', 'red', 'amber', 'blue', 'gray']

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    code?: string
    label?: string
    color?: string
    sortOrder?: number
  } | null
  if (!body?.code || !body?.label) {
    return NextResponse.json({ error: 'code and label required' }, { status: 400 })
  }
  const color = ALLOWED_COLORS.includes(body.color ?? '') ? body.color! : 'gray'
  const service = createServiceClient()
  const { data, error } = await service.from('status_phase_configs').insert({
    code: body.code.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    label: body.label,
    color,
    sort_order: body.sortOrder ?? 999,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, entry: data })
}
