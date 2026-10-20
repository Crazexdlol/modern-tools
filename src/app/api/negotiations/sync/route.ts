import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { runSync } from '@/lib/imap/sync'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const ownerEmail = process.env.BLUEHOST_IMAP_USER || ''
  if (!ownerEmail) {
    return NextResponse.json({
      ok: false,
      configMissing: ['BLUEHOST_IMAP_USER'],
      error: 'IMAP not configured — set BLUEHOST_IMAP_* env vars',
    }, { status: 200 })
  }

  const supabase = createServiceClient()
  const result = await runSync({ supabase, ownerEmail })

  return NextResponse.json({
    ok: result.errors.length === 0,
    ...result,
  }, { status: 200 })
}
