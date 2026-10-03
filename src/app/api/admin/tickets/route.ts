import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireSuperAdmin } from '@/lib/auth/require-admin'
import { rowToTicketWithSubmitter } from '@/lib/supabase/tickets'

export const runtime = 'nodejs'

export async function GET() {
  const { errorResponse } = await requireSuperAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()

  const { data, error } = await service
    .from('tickets')
    .select('*, profiles(name, email)')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ tickets: [] })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const tickets = (data ?? []).map(rowToTicketWithSubmitter)
  return NextResponse.json({ tickets })
}
