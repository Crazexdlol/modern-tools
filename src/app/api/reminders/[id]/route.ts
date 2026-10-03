import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReminderActionInput, ReminderUpdateInput } from '@/lib/reminders/types';

export const runtime = 'nodejs';

// PATCH /api/reminders/[id]
// Body is either ReminderUpdateInput (edit a scheduled row — creator only) or
// ReminderActionInput (acknowledge/snooze/dismiss a fired row — recipient only).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: ReminderUpdateInput & Partial<ReminderActionInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Branch on action vs. edit.
  if (body.action) {
    const now = new Date().toISOString();
    const patch: Record<string, string | null> = {};
    if (body.action === 'acknowledge') {
      patch.status = 'acknowledged';
      patch.acknowledged_at = now;
      patch.snoozed_until = null;
    } else if (body.action === 'dismiss') {
      patch.status = 'dismissed';
      patch.acknowledged_at = now;
      patch.snoozed_until = null;
    } else if (body.action === 'snooze') {
      if (!body.snooze_until) {
        return NextResponse.json({ error: 'snooze_until required' }, { status: 400 });
      }
      patch.status = 'scheduled';
      patch.fire_at = body.snooze_until;
      patch.fired_at = null;
      patch.snoozed_until = body.snooze_until;
    } else {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('reminders')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ reminder: data });
  }

  // Edit branch — scheduled rows only; policy enforces this.
  const patch: Record<string, unknown> = {};
  if (body.note !== undefined) patch.note = body.note;
  if (body.fire_at !== undefined) patch.fire_at = body.fire_at;
  if (body.claim_id !== undefined) patch.claim_id = body.claim_id;
  if (body.recurrence !== undefined) patch.recurrence = body.recurrence;
  if (body.channels !== undefined) patch.channels = body.channels;

  const { data, error } = await supabase
    .from('reminders')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reminder: data });
}

// DELETE /api/reminders/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
