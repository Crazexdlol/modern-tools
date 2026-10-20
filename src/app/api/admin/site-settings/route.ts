import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// Legacy keys ('allow_regular_create_claims', 'auto_status_requests_enabled')
// were superseded by per-user profile columns. New additions must be listed
// explicitly here so an admin UI can't silently write a mistyped key that
// no code reads back.
const ALLOWED_KEYS = new Set<string>([
  // uuid of the admin who receives "claim submitted by appraiser" emails
  // when no per-client override exists. Default fallback.
  'completion_notification_admin_id',
  // Per-client submission routing. Object: { "<clientNameLowercased>": "<adminUuid>" }.
  // Looked up by claim-notifications.getSubmissionAdminForClaim() with
  // completion_notification_admin_id as the fallback.
  'completion_admin_by_client',
  // Billing/Delivery stage routing (fires when a claim advances INTO
  // billing_delivery). Same shape as the submission pair above.
  'billing_notification_admin_id',
  'billing_admin_by_client',
  // Payment stage routing (fires when a claim advances INTO payment).
  'payment_notification_admin_id',
  'payment_admin_by_client',
  // Who gets emailed when a claim enters each dashboard stage. Object:
  // { main: [userIds], qc: [...], billing: [...], delivery: [...], payment: [...] }.
  // "main" fires on /assign when a non-null assignee is set (new assignment).
  'stage_entry_watchers',
  // Super-admin-only. Recipients for the daily 5pm digest email summarising
  // claims opened + claims that entered delivery stage today. Array of emails.
  'daily_digest_recipients',
  // Rough-numbers workflow (2026-10-13). uuid of the admin to park claims
  // with when an appraiser submits a claim that has needs_rough_numbers=true.
  // Null/unset = rough-numbers submits error out until configured.
  'rough_numbers_inbox_owner_id',
])

export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const service = createServiceClient()
  const { data, error } = await service
    .from('site_settings')
    .select('key, value')
    .in('key', Array.from(ALLOWED_KEYS))
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const settings: Record<string, unknown> = {}
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    settings[row.key] = row.value
  }
  return NextResponse.json({ settings })
}

export async function PATCH(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as { key?: string; value?: unknown } | null
  if (!body?.key || body.value === undefined) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }
  if (!ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json({ error: `Unknown key: ${body.key}` }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('site_settings')
    .upsert({
      key: body.key,
      value: body.value,
      updated_at: new Date().toISOString(),
      updated_by: caller!.userId,
    }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
