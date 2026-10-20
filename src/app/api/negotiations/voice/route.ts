import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { buildVoiceProfile, loadVoiceProfile } from '@/lib/negotiations/voice'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET() {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse
  const supabase = createServiceClient()
  const profile = await loadVoiceProfile(supabase, caller!.userId)
  return NextResponse.json({ profile })
}

export async function POST() {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse
  const ownerEmail = process.env.BLUEHOST_IMAP_USER || ''
  if (!ownerEmail) return NextResponse.json({ error: 'BLUEHOST_IMAP_USER not set' }, { status: 500 })
  const supabase = createServiceClient()
  try {
    const { profile, usedMessages } = await buildVoiceProfile({ supabase, profileId: caller!.userId, ownerEmail })
    return NextResponse.json({ ok: true, profile, usedMessages })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
