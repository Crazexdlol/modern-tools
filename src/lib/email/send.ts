import { Resend } from 'resend'

// Generic transactional email sender. Server-only — never import from a
// client component. Lazily constructs the Resend client so that routes which
// never call this don't crash in environments without RESEND_API_KEY set.
//
// Keep this module intentionally thin. Feature-specific wrappers (reminders,
// broadcast, future auto-triggers) live next to the feature and compose
// `sendEmail()` with their own subject/body templates.

type EmailPayload = {
  to: string | string[]
  subject: string
  text: string
  html?: string
  // Optional per-call override. Prefer leaving this blank so that the
  // single configured RESEND_FROM / fallback is used everywhere.
  from?: string
  // Optional reply-to override. Useful when a broadcast should route replies
  // to a real human mailbox rather than the no-reply sender.
  replyTo?: string
}

type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

const DEFAULT_FROM = 'HamsPortal <notifications@hamsportal.com>'

let client: Resend | null = null
function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    client = new Resend(key)
  }
  return client
}

export function emailFromAddress(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  try {
    const { data, error } = await getClient().emails.send({
      from: payload.from ?? emailFromAddress(),
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
