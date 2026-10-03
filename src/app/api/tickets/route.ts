import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TICKET_SUBJECTS, type TicketSubject } from '@/lib/supabase/tickets'

export const runtime = 'nodejs'

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

  const subject = (TICKET_SUBJECTS as readonly string[]).includes(body.subject ?? '')
    ? (body.subject as TicketSubject)
    : null
  if (!subject) {
    return NextResponse.json({ error: 'subject invalid' }, { status: 400 })
  }

  const description = (body.description ?? '').trim()
  if (!description || description.length > 4000) {
    return NextResponse.json(
      { error: 'description required (<=4000 chars)' },
      { status: 400 },
    )
  }

  const { error } = await supabase.from('tickets').insert({
    submitted_by: userData.user.id,
    subject,
    description,
  })

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'migration pending' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
