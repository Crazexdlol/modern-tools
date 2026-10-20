import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// POST /api/companies/next-file-number
// Atomically reserves the next file number from the caller's active company.
//
// Each company has its own sequence (eagleview_file_seq, ma_file_seq, …)
// exposed via a security-definer RPC — Supabase-js can't call nextval()
// directly. We dispatch to the right RPC based on the company slug.
//
// Response shapes:
//   { supported: true, fileNumber: "555001" }
//   { supported: false }   // unknown company or RPC not yet installed
//
// `supported: false` is returned (not a 500) so the UI degrades gracefully
// to manual entry on pre-migration deploys, during a Supabase outage, or
// for any company we haven't configured a sequence for yet.

// Map company slug → security-definer RPC that reserves the next value.
const SEQ_RPC_BY_SLUG: Record<string, string> = {
  'eagleview':         'nextval_public_eagleview_file_seq',
  'modern-appraisers': 'nextval_public_ma_file_seq',
}

export async function POST() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const svc = createServiceClient()
  const { data: co } = await svc
    .from('companies')
    .select('slug')
    .eq('id', caller!.activeCompanyId ?? '')
    .maybeSingle()
  const slug = (co as { slug: string } | null)?.slug ?? ''

  const rpcName = SEQ_RPC_BY_SLUG[slug]
  if (!rpcName) return NextResponse.json({ supported: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.rpc as any)(rpcName)
  if (error) {
    console.warn(`${rpcName} failed (probably pre-migration):`, error.message)
    return NextResponse.json({ supported: false })
  }
  // RPC returns [{ value: bigint }] as JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = Array.isArray(data) ? data[0] : (data as any)
  const value = row?.value
  if (value === null || value === undefined) return NextResponse.json({ supported: false })
  return NextResponse.json({ supported: true, fileNumber: String(value) })
}
