'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Mounts once at app root. Registers the push service worker and (if the
// user has already granted browser notification permission) subscribes them
// to web-push and saves the subscription server-side. The create-reminder
// sheet does the actual permission request when the user turns Browser
// notification on; this component only wires up the standing subscription.
//
// Previously this file also rendered in-app toasts for fired reminders,
// but Henry removed the in-app channel on 2026-10-05 in favor of email +
// browser push only.
function urlB64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function RemindersPushBootstrap() {
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('reminder sw registration failed', err);
        });
      }

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
    })();
  }, []);

  return null;
}
