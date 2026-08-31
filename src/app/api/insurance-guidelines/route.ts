import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'
import { normalizeCompanyKey } from '@/lib/supabase/insurance-guidelines'

export const runtime = 'nodejs'

// GET — list every guideline. Any authenticated caller.
export async function GET() {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const service = createServiceClient()
  const { data, error } = await service
    .from('insurance_guidelines')
    .select('*')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guidelines: data ?? [] })
}

// POST — create or update. Upserts by name_key (case-insensitive company name).
// Admin only.
// Body: { name: string, guidelines: string, id?: string }
export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    id?: string
    name?: string
    guidelines?: string
  } | null
  if (!body || typeof body.name !== 'string' || typeof body.guidelines !== 'string') {
    return NextResponse.json({ error: 'name and guidelines are required' }, { status: 400 })
  }
  const name = body.name.trim()
  if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  const nameKey = normalizeCompanyKey(name)

  const service = createServiceClient()
  const nowIso = new Date().toISOString()

  // If body.id is given, update that exact row (allows renames without
  // hitting the unique constraint if the new name matches the old row).
  if (body.id) {
    const { error } = await service
      .from('insurance_guidelines')
      .update({
        name,
        name_key: nameKey,
        guidelines: body.guidelines,
        updated_at: nowIso,
        updated_by: caller!.userId,
      })
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: body.id })
  }

  // No id → SELECT by name_key first to decide update vs. insert. The old
  // upsert-with-random-uuid would have reassigned the existing row's id
  // to a new UUID on collision, breaking any subsequent ?id= edit.
  const { data: existing, error: selErr } = await service
    .from('insurance_guidelines')
    .select('id')
    .eq('name_key', nameKey)
    .maybeSingle()
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 })

  if (existing) {
    const existingId = (existing as { id: string }).id
    const { error } = await service
      .from('insurance_guidelines')
      .update({
        name,
        name_key: nameKey,
        guidelines: body.guidelines,
        updated_at: nowIso,
        updated_by: caller!.userId,
      })
      .eq('id', existingId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: existingId })
  }

  const id = crypto.randomUUID()
  const { error } = await service.from('insurance_guidelines').insert({
    id,
    name,
    name_key: nameKey,
    guidelines: body.guidelines,
    created_at: nowIso,
    updated_at: nowIso,
    created_by: caller!.userId,
    updated_by: caller!.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id })
}
