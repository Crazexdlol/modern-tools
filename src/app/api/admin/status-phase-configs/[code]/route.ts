import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// Keep in sync with phaseColorClasses + status-phases-client.tsx COLORS +
// the POST route's ALLOWED_COLORS.
const ALLOWED_COLORS = [
  'red', 'orange', 'amber', 'yellow',
  'green', 'teal', 'blue', 'purple',
  'fuchsia', 'gray',
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { code } = await params
  const body = await request.json().catch(() => null) as {
    label?: string
    color?: string
    sortOrder?: number
    archived?: boolean
    pausesCycleTime?: boolean
  } | null
  if (
    !body ||
    (body.label === undefined &&
      body.color === undefined &&
      body.sortOrder === undefined &&
      body.archived === undefined &&
      body.pausesCycleTime === undefined)
  ) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) patch.label = body.label
  if (body.color !== undefined) patch.color = ALLOWED_COLORS.includes(body.color) ? body.color : 'gray'
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder
  if (body.archived !== undefined) patch.archived = body.archived
  if (body.pausesCycleTime !== undefined) patch.pauses_cycle_time = body.pausesCycleTime

  let { error } = await service.from('status_phase_configs').update(patch).eq('code', code)
  if (error && error.code === '42703') {
    // pauses_cycle_time column not migrated yet — strip it and retry so
    // other field edits still land.
    delete patch.pauses_cycle_time
    ;({ error } = await service.from('status_phase_configs').update(patch).eq('code', code))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { code } = await params
  const service = createServiceClient()

  // Refuse hard delete if any claim references this phase — force archive instead
  const { data: inUse } = await service
    .from('acv_history')
    .select('id')
    .eq('status_phase', code)
    .limit(1)

  if (inUse && inUse.length > 0) {
    // Count for a more precise message
    const { count } = await service
      .from('acv_history')
      .select('id', { count: 'exact', head: true })
      .eq('status_phase', code)
    return NextResponse.json(
      { error: `Phase in use on ${count ?? 'some'} claim(s); archive instead of deleting.` },
      { status: 409 },
    )
  }

  const { error } = await service.from('status_phase_configs').delete().eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
