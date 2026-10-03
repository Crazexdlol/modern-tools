import { Resend } from 'resend';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY missing');
    client = new Resend(key);
  }
  return client;
}

const FROM = process.env.RESEND_FROM ?? 'reminders@hamsportal.com';

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getClient().emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
