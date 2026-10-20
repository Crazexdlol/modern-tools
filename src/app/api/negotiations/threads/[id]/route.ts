import { NextResponse } from 'next/server'
import { requireNegotiationsAccess } from '@/lib/auth/require-negotiations'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface ThreadDetailMessage {
  id: string
  folder: string
  sentAt: string
  fromAddr: string
  fromName: string | null
  toAddrs: Array<{ addr: string; name: string | null }>
  ccAddrs: Array<{ addr: string; name: string | null }>
  subject: string
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number }>
  isOutbound: boolean
}

export interface ThreadDetailResponse {
  thread: {
    id: string
    status: string
    classification: string | null
    subject: string
    negotiationCaseId: string | null
  }
  messages: ThreadDetailMessage[]
  claim: {
    id: string
    maNumber: string | null
    vehicle: string | null
    vin: string | null
    companyId: string | null
    status: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    claim: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reports: any
  } | null
  hasVoiceProfile: boolean
  latestDraft: {
    id: string
    version: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output: any
    createdAt: string
  } | null
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { caller, errorResponse } = await requireNegotiationsAccess()
  if (errorResponse) return errorResponse

  const { id: threadId } = await ctx.params
  const supabase = createServiceClient()

  const { data: thread } = await supabase
    .from('email_threads')
    .select('id, status, classification, subject_normalized, negotiation_case_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: msgs } = await supabase
    .from('email_messages')
    .select('id, folder, sent_at, from_addr, from_name, to_addrs, cc_addrs, subject, text_body, html_body_sanitized')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  const messageIds = (msgs || []).map(m => m.id)
  const attByMsg = new Map<string, Array<{ id: string; filename: string; mimeType: string; sizeBytes: number }>>()
  if (messageIds.length > 0) {
    const { data: atts } = await supabase
      .from('email_attachments')
      .select('id, message_id, filename, mime_type, size_bytes')
      .in('message_id', messageIds)
    for (const a of atts || []) {
      const arr = attByMsg.get(a.message_id) || []
      arr.push({ id: a.id, filename: a.filename, mimeType: a.mime_type, sizeBytes: Number(a.size_bytes) })
      attByMsg.set(a.message_id, arr)
    }
  }

  const messages: ThreadDetailMessage[] = (msgs || []).map(m => ({
    id: m.id,
    folder: m.folder,
    sentAt: m.sent_at,
    fromAddr: m.from_addr,
    fromName: m.from_name,
    toAddrs: (m.to_addrs as ThreadDetailMessage['toAddrs']) || [],
    ccAddrs: (m.cc_addrs as ThreadDetailMessage['ccAddrs']) || [],
    subject: m.subject,
    textBody: m.text_body,
    htmlBody: m.html_body_sanitized,
    attachments: attByMsg.get(m.id) || [],
    isOutbound: m.folder.toLowerCase().includes('sent'),
  }))

  let claim: ThreadDetailResponse['claim'] = null
  if (thread.negotiation_case_id) {
    const { data: cs } = await supabase
      .from('negotiation_cases')
      .select('claim_id')
      .eq('id', thread.negotiation_case_id)
      .maybeSingle()
    if (cs?.claim_id) {
      const { data: c } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, vin, company_id, status, claim, result, reports_state')
        .eq('id', cs.claim_id)
        .maybeSingle()
      if (c) {
        claim = {
          id: c.id,
          maNumber: c.ma_number,
          vehicle: c.vehicle,
          vin: c.vin,
          companyId: c.company_id,
          status: c.status,
          claim: c.claim,
          result: c.result,
          reports: c.reports_state,
        }
      }
    }
  }

  const { data: voice } = await supabase
    .from('negotiation_config')
    .select('data')
    .eq('profile_id', caller!.userId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasVoiceProfile = !!(voice?.data as any)?.voice_profile

  let latestDraft: ThreadDetailResponse['latestDraft'] = null
  if (thread.negotiation_case_id) {
    const { data: d } = await supabase
      .from('negotiation_drafts')
      .select('id, version, output, created_at')
      .eq('case_id', thread.negotiation_case_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (d) latestDraft = { id: d.id, version: d.version, output: d.output, createdAt: d.created_at }
  }

  const response: ThreadDetailResponse = {
    thread: {
      id: thread.id,
      status: thread.status,
      classification: thread.classification,
      subject: (msgs?.[msgs.length - 1]?.subject) ?? '(no subject)',
      negotiationCaseId: thread.negotiation_case_id,
    },
    messages,
    claim,
    hasVoiceProfile,
    latestDraft,
  }
  return NextResponse.json(response)
}
