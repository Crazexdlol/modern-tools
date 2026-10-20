import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'
import { processUnmatchedThreads } from '@/lib/negotiations/process'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const supabase = createServiceClient()
  const result = await processUnmatchedThreads(supabase)
  return NextResponse.json({ ok: result.errors.length === 0, ...result })
}
