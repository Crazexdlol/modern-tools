import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// POST /api/companies/peek-file-number
//
// Peeks the NEXT value from the caller's active-company sequence WITHOUT
// advancing it. Used by the Claim Info form so users see the MA# they're
// about to receive, but abandoning the form doesn't burn the value.
//
// On save, the DB BEFORE INSERT trigger assigns from the live sequence; if
// someone else grabbed the peeked value during the user's form session, the
// save path retries with a blank ma_number so the trigger assigns the next
// free one. Either way: no collision errors reach the user.
//
// Response shapes:
//   { supported: true, fileNumber: "555610" }
//   { supported: false }   // unknown company or RPC not yet installed

const PEEK_RPC_BY_SLUG: Record<string, string> = {
  'eagleview':         'peek_public_eagleview_file_seq',
  'modern-appraisers': 'peek_public_ma_file_seq',
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

  const rpcName = PEEK_RPC_BY_SLUG[slug]
  if (!rpcName) return NextResponse.json({ supported: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.rpc as any)(rpcName)
  if (error) {
    console.warn(`${rpcName} failed (probably pre-migration):`, error.message)
    return NextResponse.json({ supported: false })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = Array.isArray(data) ? data[0] : (data as any)
  const value = row?.value
  if (value === null || value === undefined) return NextResponse.json({ supported: false })
  return NextResponse.json({ supported: true, fileNumber: String(value) })
}
