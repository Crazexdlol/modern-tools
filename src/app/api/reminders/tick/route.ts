import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { computeNextFire } from '@/lib/reminders/recurrence';
import { sendPush } from '@/lib/reminders/push';
import { sendEmail } from '@/lib/reminders/email';
import type { Reminder } from '@/lib/reminders/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Called by Vercel Cron every minute. Protected by Bearer CRON_SECRET —
// same pattern as src/app/api/cron/status-requests/route.ts.
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

  // 1. Find scheduled reminders that are due.
  const { data: due, error: dueErr } = await db
    .from('reminders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('fire_at', nowIso)
    .limit(200);
  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }

  const results: { id: string; status: string; errors: string[] }[] = [];

  for (const r of (due ?? []) as Reminder[]) {
    const errors: string[] = [];

    // 2. Emit the next recurrence BEFORE marking this one fired so a crash
    //    mid-batch doesn't lose the schedule.
    if (r.recurrence) {
      const next = computeNextFire(r.fire_at, r.recurrence);
      if (next) {
        const { error: insErr } = await db.from('reminders').insert({
          created_by: r.created_by,
          target_user_id: r.target_user_id,
          note: r.note,
          fire_at: next,
          claim_id: r.claim_id,
          recurrence: r.recurrence,
          channels: r.channels,
        });
        if (insErr) errors.push(`recurrence insert: ${insErr.message}`);
      }
    }

    // 3. Conditional UPDATE — idempotent against double-tick.
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
      // Another worker got it first.
      results.push({ id: r.id, status: 'already_fired', errors });
      continue;
    }

    // 4. Email channel
    if (r.channels.email) {
      const { data: profile } = await db
        .from('profiles')
        .select('email, full_name')
        .eq('id', r.target_user_id)
        .maybeSingle();
      if (profile?.email) {
        const subject = r.note.slice(0, 80);
        const text =
          `${r.note}\n\n` +
          (r.claim_id ? `Linked claim: ${r.claim_id}\n` : '') +
          `Open HamsPortal: https://modern-tools-rho.vercel.app/`;
        const emailResult = await sendEmail({
          to: profile.email,
          subject: `[HamsPortal reminder] ${subject}`,
          text,
        });
        if (!emailResult.ok) errors.push(`email: ${emailResult.error}`);
      }
    }

    // 5. Push channel
    if (r.channels.push) {
      const { data: subs } = await db
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', r.target_user_id);
      for (const sub of subs ?? []) {
        const res = await sendPush(sub, {
          title: 'HamsPortal reminder',
          body: r.note.slice(0, 180),
          url: r.claim_id ? `/claims/${r.claim_id}` : '/',
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

  // 6. Daily prune at 03:00 UTC.
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
