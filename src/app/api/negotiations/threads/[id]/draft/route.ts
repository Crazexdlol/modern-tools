import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { generateDraft } from '@/lib/negotiations/draft'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id: threadId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { instructions?: string | null }
  const instructions = (body.instructions ?? '').trim() || null

  const supabase = createServiceClient()

  try {
    const result = await generateDraft({ supabase, profileId: caller!.userId, threadId, instructions })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
