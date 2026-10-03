'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderToast } from './reminder-toast';

function urlB64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function RemindersRealtimeProvider() {
  const [queue, setQueue] = useState<Reminder[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);

      // Register the push service worker (idempotent — browser dedupes).
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          // non-fatal — reminders still work via in-app toast
          console.warn('reminder sw registration failed', err);
        });
      }

      // Subscribe to web-push if permission already granted. We only subscribe
      // here (not request); the create-reminder sheet requests permission
      // when the user checks the "Browser push" box.
      if (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!existing && vapid) {
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(vapid),
            });
            const json = sub.toJSON();
            await fetch('/api/reminders/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
            });
          }
        } catch (err) {
          console.warn('push subscribe failed', err);
        }
      }

      // Pull any already-fired reminders the user hasn't acted on yet.
      const { data: fired } = await supabase
        .from('reminders')
        .select('*')
        .eq('target_user_id', data.user.id)
        .eq('status', 'fired')
        .order('fired_at', { ascending: true });
      if (fired && fired.length) setQueue(fired as Reminder[]);

      channel = supabase
        .channel('reminders-realtime')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'reminders',
            filter: `target_user_id=eq.${data.user.id}`,
          },
          (payload) => {
            const row = payload.new as Reminder;
            if (row.status === 'fired' && row.channels.in_app) {
              setQueue((q) => (q.some((r) => r.id === row.id) ? q : [...q, row]));
            } else {
              // row was acked/snoozed/dismissed from another device — drop from queue.
              setQueue((q) => q.filter((r) => r.id !== row.id));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, []);

  const callAction = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setQueue((q) => q.filter((r) => r.id !== id));
    },
    []
  );

  const onAck = useCallback((id: string) => callAction(id, { action: 'acknowledge' }), [callAction]);
  const onDismiss = useCallback((id: string) => callAction(id, { action: 'dismiss' }), [callAction]);
  const onSnooze = useCallback(
    (id: string, until: string) => callAction(id, { action: 'snooze', snooze_until: until }),
    [callAction]
  );

  if (!userId || queue.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {queue.map((r) => (
        <ReminderToast
          key={r.id}
          reminder={r}
          onAck={onAck}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
        />
      ))}
    </div>
  );
}
