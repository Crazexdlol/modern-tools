import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MAX_TICKET_SUBJECT_LEN, rowToTicket } from '@/lib/supabase/tickets'

export const runtime = 'nodejs'

// GET /api/tickets
// Returns the current user's own tickets, newest first. RLS policy
// `tickets_select_own` scopes rows to submitted_by = auth.uid(), so the
// user client needs no extra filter.
export async function GET() {
  const supabase = await createClient()
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ tickets: [] })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ tickets: (data ?? []).map(rowToTicket) })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { subject?: string; description?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const subject = (body.subject ?? '').trim()
  if (!subject || subject.length > MAX_TICKET_SUBJECT_LEN) {
    return NextResponse.json(
      { error: `subject required (<=${MAX_TICKET_SUBJECT_LEN} chars)` },
      { status: 400 },
    )
  }

  const description = (body.description ?? '').trim()
  if (!description || description.length > 4000) {
    return NextResponse.json(
      { error: 'description required (<=4000 chars)' },
      { status: 400 },
    )
  }

  // Insert and return the row so the client can show "Ticket #1234" in the
  // success message. `.select()` without a column list returns whichever
  // columns exist — tolerant to pre-migration state (no `number` column yet),
  // in which case `number` on the response is simply null.
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      submitted_by: userData.user.id,
      subject,
      description,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'migration pending' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const number = data && typeof (data as { number?: unknown }).number === 'number'
    ? (data as { number: number }).number
    : null
  return NextResponse.json({ ok: true, number }, { status: 201 })
}
