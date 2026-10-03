import webpush from 'web-push';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys missing');
  }
  webpush.setVapidDetails('mailto:reminders@hamsportal.com', publicKey, privateKey);
  configured = true;
}

// Send a push payload to a single subscription. Returns the HTTP status
// (or 0 on network error) and whether the subscription should be pruned.
export async function sendPush(
  sub: PushSubscriptionRow,
  payload: PushPayload
): Promise<{ status: number; shouldPrune: boolean }> {
  configure();
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { status: res.statusCode, shouldPrune: false };
  } catch (err: unknown) {
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: number }).statusCode)
        : 0;
    const shouldPrune = status === 404 || status === 410;
    return { status, shouldPrune };
  }
}
