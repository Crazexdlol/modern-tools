import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = ['needs_response', 'responded', 'ignored', 'spam', 'unmatched', 'closed_claim'] as const
type Status = typeof ALLOWED[number]

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { status?: string }
  const status = body.status as Status | undefined
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const patch: Record<string, unknown> = { status }
  if (status === 'responded') patch.last_outbound_at = new Date().toISOString()
  const { error } = await supabase.from('email_threads').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
