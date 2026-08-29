import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    state?: string
    required?: boolean
    forbidden?: boolean
    notes?: string | null
  } | null
  if (!body?.state || body.state.length !== 2) {
    return NextResponse.json({ error: 'state (2-char code) required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.from('licensed_states').insert({
    state: body.state.toUpperCase(),
    required: body.required ?? true,
    forbidden: body.forbidden ?? false,
    notes: body.notes ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, entry: data })
}
