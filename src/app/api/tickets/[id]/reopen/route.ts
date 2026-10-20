import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// POST /api/tickets/[id]/reopen
// Lets the user who originally submitted a ticket flip it back from
// resolved/dismissed to open — the "it says resolved but it isn't actually
// fixed" escape hatch. The admin's existing resolution_note is preserved,
// so when they look at the admin tickets page they'll see status=open with
// a resolution_note attached (= user reopened).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: ticket, error: fetchErr } = await service
    .from('tickets')
    .select('id, submitted_by, status')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (ticket.submitted_by !== userData.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (ticket.status !== 'resolved' && ticket.status !== 'dismissed') {
    return NextResponse.json({ error: 'ticket is not resolved' }, { status: 409 })
  }

  const { error: updateErr } = await service
    .from('tickets')
    .update({ status: 'open', resolved_at: null })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
