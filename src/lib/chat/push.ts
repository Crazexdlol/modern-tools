import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/reminders/push'

// Server-only: dispatches a chat push to every push_subscription row for a
// given user. Uses the service-role client because push_subscriptions is
// RLS'd to the subscription owner and we're sending FROM one user TO another.
export async function sendChatPush(args: {
  recipientUserId: string
  conversationId: string
  senderName: string
  preview: string
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('user_id', args.recipientUserId)
  if (error || !subs || subs.length === 0) return

  const payload = {
    title: `New message from ${args.senderName}`,
    body: args.preview.slice(0, 80),
    url: `/?chat=${encodeURIComponent(args.conversationId)}`,
    icon: '/icon.png',
    tag: `chat:${args.conversationId}`,
  }

  const prunable: string[] = []
  await Promise.all(subs.map(async (s) => {
    const r = await sendPush(
      { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
      payload,
    )
    if (r.shouldPrune) prunable.push(s.id as string)
  }))
  if (prunable.length) {
    await admin.from('push_subscriptions').delete().in('id', prunable)
  }
}
