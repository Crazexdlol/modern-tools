import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const ALLOWED_KEYS = new Set(['allow_regular_create_claims'])

export async function PATCH(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { key?: string; value?: unknown } | null
  if (!body?.key || body.value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }
  if (!ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json({ error: `Unknown key: ${body.key}` }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('site_settings')
    .upsert({
      key: body.key,
      value: body.value,
      updated_at: new Date().toISOString(),
      updated_by: caller!.userId,
    }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
