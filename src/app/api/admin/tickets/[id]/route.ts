import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import type { TicketStatus } from '@/lib/supabase/tickets'

export const runtime = 'nodejs'

const VALID_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'dismissed']

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireSuperAdmin()
  if (errorResponse) return errorResponse

  const { id } = await params

  let body: { status?: string; resolutionNote?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as TicketStatus)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
    if (body.status === 'resolved' || body.status === 'dismissed') {
      update.resolved_at = new Date().toISOString()
    } else {
      update.resolved_at = null
    }
  }

  if ('resolutionNote' in body) {
    const note = body.resolutionNote
    if (note !== null && typeof note === 'string' && note.length > 4000) {
      return NextResponse.json({ error: 'resolutionNote too long' }, { status: 400 })
    }
    update.resolution_note = note ?? null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('tickets').update(update).eq('id', id)

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'migration pending' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
