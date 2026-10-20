import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Reminder, ReminderCreateInput } from '@/lib/reminders/types';

export const runtime = 'nodejs';

// Attach the linked claim's MA# to each reminder for display. One batched
// fetch keyed by claim_id — cheaper than N+1 joins and the FK target table
// (acv_history) isn't joined by PostgREST automatically because claim_id is
// a text FK, not a uuid.
async function attachClaimMa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reminders: Reminder[]
): Promise<Reminder[]> {
  const ids = Array.from(
    new Set(reminders.map((r) => r.claim_id).filter((id): id is string => !!id))
  );
  if (ids.length === 0) return reminders;
  const { data: claims } = await supabase
    .from('acv_history')
    .select('id, ma_number')
    .in('id', ids);
  const map = new Map<string, string | null>();
  for (const c of claims ?? []) {
    map.set((c as { id: string }).id, (c as { ma_number: string | null }).ma_number ?? null);
  }
  return reminders.map((r) => ({
    ...r,
    claim_ma_number: r.claim_id ? map.get(r.claim_id) ?? null : null,
  }));
}

// GET /api/reminders?tab=upcoming|sent|done
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') ?? 'upcoming';
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const me = userData.user.id;

  let query = supabase.from('reminders').select('*');
  if (tab === 'upcoming') {
    query = query
      .eq('target_user_id', me)
      .in('status', ['scheduled', 'fired', 'snoozed'])
      .order('fire_at', { ascending: true });
  } else if (tab === 'sent') {
    query = query
      .eq('created_by', me)
      .neq('target_user_id', me)
      .order('fire_at', { ascending: true });
  } else if (tab === 'done') {
    query = query
      .eq('target_user_id', me)
      .in('status', ['acknowledged', 'dismissed'])
      .order('fire_at', { ascending: false })
      .limit(50);
  } else {
    return NextResponse.json({ error: 'invalid tab' }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) {
    // 42703 = column/table does not exist (pre-migration safety)
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json({ reminders: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withMa = await attachClaimMa(supabase, (data ?? []) as Reminder[]);
  return NextResponse.json({ reminders: withMa });
}

// POST /api/reminders
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const me = userData.user.id;

  let body: ReminderCreateInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(body.target_user_ids) || body.target_user_ids.length === 0) {
    return NextResponse.json({ error: 'target_user_ids required' }, { status: 400 });
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'subject required, max 200 chars' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) {
    return NextResponse.json({ error: 'note max 1000 chars' }, { status: 400 });
  }
  if (!body.fire_at) {
    return NextResponse.json({ error: 'fire_at required' }, { status: 400 });
  }
  if (!body.channels || (!body.channels.in_app && !body.channels.push && !body.channels.email)) {
    return NextResponse.json({ error: 'at least one channel required' }, { status: 400 });
  }

  // The DB still has `note NOT NULL CHECK char_length(note) between 1 and 1000`.
  // If the user left note blank, store the subject there so the row satisfies
  // the check — the display layer prefers `subject` over `note` anyway.
  const noteForStorage = note || subject;

  const basePayload = (target_user_id: string) => ({
    created_by: me,
    target_user_id,
    subject,
    note: noteForStorage,
    fire_at: body.fire_at,
    claim_id: body.claim_id ?? null,
    recurrence: body.recurrence ?? null,
    channels: body.channels,
  });

  const rows = body.target_user_ids.map(basePayload);

  let insertRes = await supabase.from('reminders').insert(rows).select('*');

  // Pre-migration safety: if `subject` column doesn't exist yet, retry
  // without it so a straggler deploy still saves the reminder.
  if (insertRes.error && insertRes.error.code === '42703') {
    const legacyRows = body.target_user_ids.map((target_user_id) => ({
      created_by: me,
      target_user_id,
      note: noteForStorage,
      fire_at: body.fire_at,
      claim_id: body.claim_id ?? null,
      recurrence: body.recurrence ?? null,
      channels: body.channels,
    }));
    insertRes = await supabase.from('reminders').insert(legacyRows).select('*');
  }

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
  }
  return NextResponse.json({ reminders: insertRes.data ?? [] }, { status: 201 });
}
