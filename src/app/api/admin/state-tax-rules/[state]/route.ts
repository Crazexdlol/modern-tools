import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ state: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { state } = await params
  const body = await request.json().catch(() => null) as {
    rule?: string
    rate?: number | null
    notes?: string | null
  } | null
  if (!body || (body.rule === undefined && body.rate === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.rule !== undefined) patch.rule = body.rule
  if (body.rate !== undefined) patch.rate = body.rate
  if (body.notes !== undefined) patch.notes = body.notes

  const service = createServiceClient()
  const { error } = await service
    .from('state_tax_rules')
    .upsert(
      { state: state.toUpperCase(), ...patch },
      { onConflict: 'state' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
