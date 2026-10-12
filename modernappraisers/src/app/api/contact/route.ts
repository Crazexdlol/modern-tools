import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional(), message: z.string().min(1).max(5000) })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log('[contact] (no RESEND_API_KEY set) would send:', parsed.data)
    return NextResponse.json({ ok: true, note: 'logged (no email sent)' })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(key)
  const { name, email, phone, message } = parsed.data
  await resend.emails.send({
    from: 'contact@modernappraisers.com',
    to: 'info@modernappraisers.com',
    replyTo: email,
    subject: `Contact form — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone ?? '-'}\n\n${message}`,
  })
  return NextResponse.json({ ok: true })
}
