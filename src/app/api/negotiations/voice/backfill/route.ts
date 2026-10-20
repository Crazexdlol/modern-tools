import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { runSentBackfill } from '@/lib/imap/backfill'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const ownerEmail = process.env.BLUEHOST_IMAP_USER || ''
  if (!ownerEmail) return NextResponse.json({ error: 'BLUEHOST_IMAP_USER not set' }, { status: 500 })

  const body = (await request.json().catch(() => ({}))) as { daysBack?: number; maxMessages?: number }
  const daysBack = clamp(Number(body.daysBack) || 365, 30, 3650)      // 30 days .. 10 years
  const maxMessages = clamp(Number(body.maxMessages) || 1000, 50, 3000)

  const supabase = createServiceClient()
  const result = await runSentBackfill({ supabase, daysBack, maxMessages, ownerEmail })
  return NextResponse.json({ ok: result.errors.length === 0, ...result })
}

// GET returns current corpus stats so the UI can display size/date range.
export async function GET() {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse
  const ownerEmail = (process.env.BLUEHOST_IMAP_USER || '').toLowerCase()
  const supabase = createServiceClient()

  const { count } = await supabase
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .ilike('folder', '%sent%')
    .eq('from_addr', ownerEmail)

  const { data: oldest } = await supabase
    .from('email_messages')
    .select('sent_at')
    .ilike('folder', '%sent%')
    .eq('from_addr', ownerEmail)
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: newest } = await supabase
    .from('email_messages')
    .select('sent_at')
    .ilike('folder', '%sent%')
    .eq('from_addr', ownerEmail)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    sentCount: count ?? 0,
    oldestSentAt: oldest?.sent_at ?? null,
    newestSentAt: newest?.sent_at ?? null,
  })
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
