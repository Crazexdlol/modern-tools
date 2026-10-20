import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({
  name:             z.string().min(1),
  email:            z.string().email(),
  phone:            z.string().optional(),
  company:          z.string().optional(),
  insuranceCompany: z.string().optional(),
  service:          z.string().optional(),
  message:          z.string().min(1).max(5000),
})

type Submission = z.infer<typeof Schema>

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Branded HTML email body — Times New Roman, dark header, blue accent, clean
// label/value rows for every filled field. Optional fields with no value are
// skipped entirely so the recipient doesn't see empty rows.
function renderEmailHtml(s: Submission): string {
  // No horizontal separators between rows — Gmail doubles them inconsistently
  // across row counts. Padding alone separates each field, which reads cleaner
  // and is bulletproof across every email client.
  const row = (label: string, value: string | undefined) => {
    const v = (value || '').trim()
    if (!v) return ''
    return `
      <tr>
        <td style="padding:14px 0;color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;vertical-align:top;width:180px;font-family:'Times New Roman',Times,serif;font-weight:bold;">${escapeHtml(label)}</td>
        <td style="padding:14px 0;color:#0a0a0a;font-size:15px;font-family:'Times New Roman',Times,serif;line-height:1.5;">${escapeHtml(v)}</td>
      </tr>`
  }
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Times New Roman',Times,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;background:#f5f5f5;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-collapse:collapse;">
        <tr>
          <td style="background:#0a0a0a;padding:28px 32px;border-bottom:4px solid #2563eb;">
            <div style="color:#ffffff;font-size:26px;font-weight:bold;letter-spacing:-0.01em;font-family:'Times New Roman',Times,serif;">Modern Appraisers</div>
            <div style="color:#b3b3b3;font-size:13px;margin-top:6px;font-family:'Times New Roman',Times,serif;">New contact-form submission from modernappraisers.com</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${row('Name', s.name)}
              ${row('Company', s.company)}
              ${row('Insurance Company', s.insuranceCompany)}
              ${row('Email', s.email)}
              ${row('Phone', s.phone)}
              ${row('Service Requested', s.service)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <div style="color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:bold;font-family:'Times New Roman',Times,serif;margin-bottom:14px;">Message</div>
            <div style="padding:20px 24px;background:#f8f8f8;border-left:4px solid #2563eb;color:#0a0a0a;font-size:15px;line-height:1.65;white-space:pre-wrap;font-family:'Times New Roman',Times,serif;">${escapeHtml(s.message)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;background:#f8f8f8;border-top:1px solid #e5e5e5;color:#8a8a8a;font-size:12px;text-align:center;font-family:'Times New Roman',Times,serif;line-height:1.5;">
            Reply to this email to respond directly to ${escapeHtml(s.name)} at ${escapeHtml(s.email)}.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Plain-text fallback for mail clients that can't render HTML. Kept in sync
// with the HTML version so recipients get the same content either way.
function renderEmailText(s: Submission): string {
  const line = (label: string, v: string | undefined) => {
    const value = (v || '').trim()
    return value ? `${label}: ${value}\n` : ''
  }
  return (
    `New contact-form submission from modernappraisers.com\n\n` +
    line('Name', s.name) +
    line('Company', s.company) +
    line('Insurance Company', s.insuranceCompany) +
    line('Email', s.email) +
    line('Phone', s.phone) +
    line('Service Requested', s.service) +
    `\nMessage:\n${s.message}\n`
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const data = parsed.data

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[contact] RESEND_API_KEY missing; submission accepted but not emailed')
    return NextResponse.json({ ok: true, note: 'logged (no email sent)' })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(key)
  const subject = `Contact form, ${data.name}${data.company ? ` (${data.company})` : ''}`

  await resend.emails.send({
    from: 'Modern Appraisers <website@modernappraisers.com>',
    to: 'info@modernappraisers.com',
    replyTo: data.email,
    subject,
    html: renderEmailHtml(data),
    text: renderEmailText(data),
  })
  return NextResponse.json({ ok: true })
}
