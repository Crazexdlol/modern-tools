import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// POST /api/opposing-appraisers/[id]/add-claim-types
// Body: { claimTypes: string[] }
//
// Unions `claimTypes` into the OA's `claim_types` list. Open to any
// authenticated user (not just admins) because the auto-add fires on every
// claim-side OA assignment — appraisers assigning an OA to their claim need
// to be able to trigger it. The union is strictly additive and bounded to a
// small enum of ClaimType codes, so there's no self-grant risk.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const body = await request.json().catch(() => null) as { claimTypes?: unknown } | null
  const incoming = Array.isArray(body?.claimTypes)
    ? body!.claimTypes.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length < 32)
    : []
  if (incoming.length === 0) return NextResponse.json({ ok: true, unchanged: true })

  const service = createServiceClient()
  const { data: row, error: readErr } = await service
    .from('opposing_appraisers')
    .select('claim_types')
    .eq('id', id)
    .maybeSingle()
  // Pre-migration (column missing) → silent no-op; the UX nicety just doesn't fire.
  if (readErr && readErr.code === '42703') return NextResponse.json({ ok: true, unchanged: true })
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 })
  if (!row) return NextResponse.json({ error: 'Opposing appraiser not found' }, { status: 404 })

  const existing = Array.isArray((row as { claim_types?: unknown }).claim_types)
    ? (row as { claim_types: string[] }).claim_types
    : []
  const merged = Array.from(new Set([...existing, ...incoming]))
  if (merged.length === existing.length) return NextResponse.json({ ok: true, unchanged: true })

  const { error: writeErr } = await service
    .from('opposing_appraisers')
    .update({ claim_types: merged })
    .eq('id', id)
  if (writeErr && writeErr.code === '42703') return NextResponse.json({ ok: true, unchanged: true })
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, claimTypes: merged })
}
