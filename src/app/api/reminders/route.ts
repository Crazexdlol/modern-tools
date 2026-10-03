import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReminderCreateInput } from '@/lib/reminders/types';

export const runtime = 'nodejs';

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
  return NextResponse.json({ reminders: data ?? [] });
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
  if (!body.note || body.note.length > 1000) {
    return NextResponse.json({ error: 'note required, max 1000 chars' }, { status: 400 });
  }
  if (!body.fire_at) {
    return NextResponse.json({ error: 'fire_at required' }, { status: 400 });
  }
  if (!body.channels || (!body.channels.in_app && !body.channels.push && !body.channels.email)) {
    return NextResponse.json({ error: 'at least one channel required' }, { status: 400 });
  }

  const rows = body.target_user_ids.map((target_user_id) => ({
    created_by: me,
    target_user_id,
    note: body.note,
    fire_at: body.fire_at,
    claim_id: body.claim_id ?? null,
    recurrence: body.recurrence ?? null,
    channels: body.channels,
  }));

  const { data, error } = await supabase.from('reminders').insert(rows).select('*');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ reminders: data ?? [] }, { status: 201 });
}
