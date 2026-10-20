import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const BUCKET = 'claim-documents'

// Issues a short-lived signed URL for a document in a claim's storage
// prefix and redirects to it. The anchor in documents-tab.tsx uses this
// endpoint as its stable href so native browser ctrl+click opens the
// document in a background tab (window.open always focuses the new tab;
// anchor+ctrl respects user intent).
//
// Auth: requires a logged-in session. Path must live under the claim's
// storage prefix (`{claimId}/...`) — guards against cross-claim path
// traversal. Claim must be visible to the caller (fetchClaim applies
// company scoping + the same filters as the workspace).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id } = await params
  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path query required' }, { status: 400 })
  }

  // Prefix guard — the signed URL is scoped to the bucket, so a crafted
  // path like `other-claim-id/file.pdf` would otherwise work. Enforce
  // that every path starts with `{claimId}/`.
  if (!path.startsWith(`${id}/`)) {
    return NextResponse.json({ error: 'path does not belong to this claim' }, { status: 400 })
  }

  const claim = await fetchClaim(id, caller!.activeCompanyId ?? undefined)
  if (!claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 })
}
