import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { fetchStaffRecipients, fetchStaffRecipientsByIds } from '@/lib/email/recipients'
import { sendEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

interface BroadcastBody {
  subject?: string
  body?: string
  // When present + non-empty, limits the broadcast to these profile ids.
  // Ids are re-filtered server-side so an inactive user or non-staff role
  // can't be reached by posting an arbitrary uuid.
  recipientIds?: string[]
}

// Admin-only. Sends a plain-text broadcast email to every active user whose
// role is admin or appraiser. One Resend call per recipient so a partial
// failure in the middle of the list doesn't block the rest; the response
// returns per-recipient outcomes for the UI to surface.
export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = (await request.json().catch(() => null)) as BroadcastBody | null
  const subject = body?.subject?.trim() ?? ''
  const text = body?.body?.trim() ?? ''
  if (!subject || !text) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: 'subject too long (max 200 chars)' }, { status: 400 })
  }
  if (text.length > 20000) {
    return NextResponse.json({ error: 'body too long (max 20,000 chars)' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email sending is not configured. Set RESEND_API_KEY in Vercel.' },
      { status: 503 },
    )
  }

  const requestedIds = Array.isArray(body?.recipientIds) ? body.recipientIds.filter((v) => typeof v === 'string') : []
  const recipients = requestedIds.length > 0
    ? await fetchStaffRecipientsByIds(requestedIds)
    : await fetchStaffRecipients()
  if (recipients.length === 0) {
    const msg = requestedIds.length > 0
      ? 'None of the selected recipients are active admin or appraiser profiles'
      : 'No active admin or appraiser profiles found'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const results = await Promise.all(
    recipients.map(async (r) => {
      const res = await sendEmail({ to: r.email, subject, text })
      return res.ok
        ? { email: r.email, name: r.name, role: r.role, ok: true as const, id: res.id }
        : { email: r.email, name: r.name, role: r.role, ok: false as const, error: res.error }
    }),
  )

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent
  return NextResponse.json({ sent, failed, total: results.length, results })
}
