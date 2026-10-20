import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { computeNextFire } from '@/lib/reminders/recurrence';
import { sendPush } from '@/lib/reminders/push';
import { sendEmail } from '@/lib/reminders/email';
import type { Reminder } from '@/lib/reminders/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hamsportal.com';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reminderHeadline(r: Reminder): string {
  const s = (r.subject ?? '').trim();
  if (s) return s;
  return (r.note ?? '').trim().slice(0, 120) || 'Reminder';
}

function reminderBodyText(r: Reminder): string {
  const subject = (r.subject ?? '').trim();
  const note = (r.note ?? '').trim();
  // If note is just a copy of subject (legacy behavior), drop it.
  if (!note || note === subject) return '';
  return note;
}

function emailHtml(opts: {
  headline: string;
  body: string;
  claimLink: { url: string; label: string } | null;
}): string {
  const safeHeadline = escapeHtml(opts.headline);
  const safeBody = escapeHtml(opts.body).replace(/\n/g, '<br>');
  const link = opts.claimLink
    ? `<p style="margin:16px 0 0;font-size:14px;">Linked claim: <a href="${escapeHtml(
        opts.claimLink.url
      )}" style="color:#2563eb;font-weight:600;text-decoration:underline;">${escapeHtml(
        opts.claimLink.label
      )}</a></p>`
    : `<p style="margin:16px 0 0;font-size:14px;"><a href="${SITE_URL}/" style="color:#2563eb;font-weight:600;text-decoration:underline;">Open HamsPortal →</a></p>`;
  return `<!doctype html>
<html>
  <body style="font-family:'Times New Roman',Times,serif;color:#111827;max-width:560px;margin:0 auto;padding:16px;">
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${safeHeadline}</h2>
    ${safeBody ? `<p style="margin:0;font-size:14px;line-height:1.5;color:#1f2937;">${safeBody}</p>` : ''}
    ${link}
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">
      This is a no-reply reminder from HamsPortal. Manage your reminders at
      <a href="${SITE_URL}/" style="color:#6b7280;text-decoration:underline;">hamsportal.com</a>.
    </p>
  </body>
</html>`;
}

function emailText(opts: {
  headline: string;
  body: string;
  claimLink: { url: string; label: string } | null;
}): string {
  const linkLine = opts.claimLink
    ? `\nLinked claim (${opts.claimLink.label}): ${opts.claimLink.url}\n`
    : `\n${SITE_URL}/\n`;
  return `${opts.headline}\n\n${opts.body ? `${opts.body}\n` : ''}${linkLine}\n--\nThis is a no-reply reminder from HamsPortal.`;
}

// Called by cron-job.org every 2 minutes. Protected by Bearer CRON_SECRET.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expBuf = Buffer.from(expected);
  if (authBuf.length !== expBuf.length || !timingSafeEqual(authBuf, expBuf)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error: dueErr } = await db
    .from('reminders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('fire_at', nowIso)
    .limit(200);
  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }

  // Prefetch MA# for every linked claim in one query.
  const claimIds = Array.from(
    new Set(((due ?? []) as Reminder[]).map((r) => r.claim_id).filter((id): id is string => !!id))
  );
  const maByClaim = new Map<string, string | null>();
  if (claimIds.length > 0) {
    const { data: claims } = await db
      .from('acv_history')
      .select('id, ma_number')
      .in('id', claimIds);
    for (const c of claims ?? []) {
      maByClaim.set(
        (c as { id: string }).id,
        (c as { ma_number: string | null }).ma_number ?? null
      );
    }
  }

  const results: { id: string; status: string; errors: string[] }[] = [];

  for (const r of (due ?? []) as Reminder[]) {
    const errors: string[] = [];

    // Emit the next recurrence BEFORE marking this one fired so a crash
    // mid-batch doesn't lose the schedule.
    if (r.recurrence) {
      const next = computeNextFire(r.fire_at, r.recurrence);
      if (next) {
        const { error: insErr } = await db.from('reminders').insert({
          created_by: r.created_by,
          target_user_id: r.target_user_id,
          subject: r.subject,
          note: r.note,
          fire_at: next,
          claim_id: r.claim_id,
          recurrence: r.recurrence,
          channels: r.channels,
        });
        if (insErr) errors.push(`recurrence insert: ${insErr.message}`);
      }
    }

    // Conditional UPDATE — idempotent against double-tick.
    const { data: updated, error: updErr } = await db
      .from('reminders')
      .update({ status: 'fired', fired_at: nowIso })
      .eq('id', r.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (updErr) {
      errors.push(`fire update: ${updErr.message}`);
      results.push({ id: r.id, status: 'skipped', errors });
      continue;
    }
    if (!updated) {
      results.push({ id: r.id, status: 'already_fired', errors });
      continue;
    }

    const headline = reminderHeadline(r);
    const body = reminderBodyText(r);
    const maNumber = r.claim_id ? maByClaim.get(r.claim_id) ?? null : null;
    const claimLink =
      r.claim_id
        ? {
            url: `${SITE_URL}/claims/${encodeURIComponent(r.claim_id)}`,
            label: maNumber ? `#MA${maNumber}` : 'View claim',
          }
        : null;

    // Email channel
    if (r.channels.email) {
      const { data: profile } = await db
        .from('profiles')
        .select('email, name, email_notifications_enabled')
        .eq('id', r.target_user_id)
        .maybeSingle();
      if (profile?.email && profile.email_notifications_enabled !== false) {
        const subjectLine = maNumber
          ? `[HamsPortal reminder] ${headline} | MA# ${maNumber}`
          : `[HamsPortal reminder] ${headline}`;
        const emailResult = await sendEmail({
          to: profile.email,
          subject: subjectLine.slice(0, 180),
          text: emailText({ headline, body, claimLink }),
          html: emailHtml({ headline, body, claimLink }),
        });
        if (!emailResult.ok) errors.push(`email: ${emailResult.error}`);
      }
    }

    // Push channel
    if (r.channels.push) {
      const { data: subs } = await db
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', r.target_user_id);
      for (const sub of subs ?? []) {
        const res = await sendPush(sub, {
          title: headline.slice(0, 100),
          body: body ? body.slice(0, 180) : (maNumber ? `Linked to #MA${maNumber}` : 'Tap to open HamsPortal.'),
          url: r.claim_id ? `/claims/${r.claim_id}` : '/',
          icon: `${SITE_URL}/hamsportal-logo.png`,
          badge: `${SITE_URL}/favicon.png`,
          tag: `reminder-${r.id}`,
        });
        if (res.shouldPrune) {
          await db.from('push_subscriptions').delete().eq('id', sub.id);
        } else if (res.status >= 400) {
          errors.push(`push ${sub.endpoint.slice(0, 40)}: ${res.status}`);
        }
      }
    }

    results.push({ id: r.id, status: 'fired', errors });
  }

  // Daily prune at 03:00 UTC.
  const now = new Date();
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .from('reminders')
      .delete()
      .in('status', ['acknowledged', 'dismissed'])
      .lt('fired_at', cutoff);
  }

  return NextResponse.json({ fired: results.length, results });
}
