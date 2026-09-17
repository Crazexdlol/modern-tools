import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// POST /api/companies/next-file-number
// For Eagleview users: atomically reserves the next value from
// public.eagleview_file_seq via the security-definer RPC and returns it as a
// string ("222001", "222002", ...). Each call advances the sequence.
//
// For Modern Appraisers (or any company that doesn't auto-generate): returns
// { supported: false } so the client leaves the field as a plain manual input.
//
// Also returns { supported: false } pre-migration (function missing) so the
// UI degrades gracefully to manual entry.
//
// Response shapes:
//   { supported: true, fileNumber: "222001" }
//   { supported: false }
export async function POST() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const svc = createServiceClient()
  const { data: co } = await svc
    .from('companies')
    .select('slug')
    .eq('id', caller!.activeCompanyId ?? '')
    .maybeSingle()
  const slug = (co as { slug: string } | null)?.slug

  if (slug !== 'eagleview') {
    return NextResponse.json({ supported: false })
  }

  // Reserve via RPC. If the function doesn't exist yet (pre-migration),
  // fall through with supported=false so the UI keeps working.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.rpc as any)('nextval_public_eagleview_file_seq')
  if (error) {
    console.warn('nextval RPC failed (probably pre-migration):', error.message)
    return NextResponse.json({ supported: false })
  }
  // RPC returns [{ value: bigint }] as JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = Array.isArray(data) ? data[0] : (data as any)
  const value = row?.value
  if (value === null || value === undefined) return NextResponse.json({ supported: false })
  return NextResponse.json({ supported: true, fileNumber: String(value) })
}
