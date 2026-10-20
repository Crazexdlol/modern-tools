import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Returns a short-lived signed URL for an award PDF that was auto-filed
// into the claim-documents bucket during draft generation. Auth-gated to
// negotiations users; path must live inside claim-documents.
export async function POST(request: Request) {
  const { errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const body = (await request.json().catch(() => ({}))) as { path?: string; name?: string }
  const path = body.path?.trim()
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const supabase = createServiceClient()
  const opts = body.name ? { download: body.name } : undefined
  const { data, error } = await supabase.storage
    .from('claim-documents')
    .createSignedUrl(path, 300, opts)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'signing failed' }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl })
}
