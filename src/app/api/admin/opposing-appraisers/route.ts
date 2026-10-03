import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET — list all opposing appraisers, sorted by name.
// Excludes archived rows unless ?includeArchived=1.
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get('includeArchived') === '1'

  const service = createServiceClient()
  let query = service
    .from('opposing_appraisers')
    .select('*')
    .order('name', { ascending: true })

  if (!includeArchived) {
    query = query.is('archived_at', null)
  }

  const { data, error } = await query

  if (error) {
    // 42P01 = table doesn't exist yet (migration not run).
    if (error.code === '42P01') return NextResponse.json({ opposingAppraisers: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ opposingAppraisers: data ?? [] })
}

// POST — create a new opposing appraiser. Admin only.
export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    name?: string
    company?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
  } | null

  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('opposing_appraisers')
    .insert({
      name: body.name.trim(),
      company: body.company?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: caller!.userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Table not found — run the opposing-appraisers migration first.' }, { status: 503 })
    }
    // 23505 = unique violation (duplicate active row).
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An active opposing appraiser with this name and company already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, opposingAppraiser: data })
}
