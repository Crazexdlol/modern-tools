import type { SupabaseClient } from '@supabase/supabase-js'

// Phase/umpire auto-messages are inserted into messages with sender_name
// 'HamsPortal' + is_auto_request=true by /api/claims/[id]/phase and
// /api/claims/[id]/umpire. Without coalescing, a user yo-yoing the umpire
// toggle (or an admin flipping a phase repeatedly) spams the thread with
// one row per click. This helper collapses a flurry of toggles within a
// 60-second window into a single row that keeps updating its body.
//
// Discriminator is the body prefix — status requests and other auto
// messages (/auto-message, status-requests cron) also set is_auto_request
// but have different bodies, so we only touch rows whose body starts with
// one of the two phase-message prefixes.

const COALESCE_WINDOW_MS = 60_000

const PHASE_PREFIXES = [
  'Claim has been phased:',
  'Phase removed from claim',
]

function isPhaseMessageBody(body: string | null | undefined): boolean {
  if (!body) return false
  return PHASE_PREFIXES.some(p => body.startsWith(p))
}

export async function postPhaseAutoMessage(
  service: SupabaseClient,
  claimId: string,
  body: string,
  companyId: string | null | undefined,
): Promise<void> {
  const cutoffIso = new Date(Date.now() - COALESCE_WINDOW_MS).toISOString()

  // Pull the most recent auto-request messages for this claim within the
  // window. Limit 5 so we see past non-phase auto messages too — then
  // pick the first body that matches a phase prefix. Index on (claim_id,
  // is_auto_request) makes this cheap.
  const { data: recent, error: recentErr } = await service
    .from('messages')
    .select('id, body, created_at')
    .eq('claim_id', claimId)
    .eq('is_auto_request', true)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!recentErr && recent && recent.length > 0) {
    const match = recent.find(m => isPhaseMessageBody((m as { body: string }).body))
    if (match) {
      const { error: updErr } = await service
        .from('messages')
        .update({ body })
        .eq('id', (match as { id: string }).id)
      if (updErr) {
        console.warn('phase auto-message coalesce update failed:', updErr.message)
      }
      return
    }
  }

  const payload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    claim_id: claimId,
    sender_id: null,
    sender_name: 'HamsPortal',
    recipient_ids: [],
    recipient_names: [],
    body,
    is_auto_request: true,
  }
  if (companyId) payload.company_id = companyId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await service.from('messages').insert(payload as any)
  if (insErr) {
    console.warn('phase auto-message insert failed:', insErr.message)
  }
}
