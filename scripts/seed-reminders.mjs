// One-off: seeds 15 realistic reminders for Henry Admin (and Henry Appraiser
// for the 10 that fire today). In-app channel only, as requested.
// Run: node scripts/seed-reminders.mjs

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HENRY_ADMIN = 'ebd1466d-2667-4044-9872-703a415ef43d';
const HENRY_APPRAISER = 'd968ce49-dc3e-4a72-b8ae-5bc7019d97ca';

const now = new Date();

function in5(mins) {
  return new Date(now.getTime() + mins * 60_000);
}
function daysOut(days, hour, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// 10 today reminders — fire at 5:55 PM local (5m from "now" per Henry's spec).
const t555 = in5(5);
const today = [
  { subject: 'Call Church Mutual back on MA# 3981345', note: '' },
  { subject: 'Review DV draft before send', note: 'Travelers one — Marc Depew' },
  { subject: 'Follow up with Sedgwick on AVC', note: '' },
  { subject: 'Request supplement from Erie CCC', note: 'Supplemental invoice needs tax rate confirmation.' },
  { subject: 'QC the Ford F-150 estimate', note: 'Willie Jouett, Germania.' },
  { subject: 'Check unassigned queue', note: '5 claims sitting unassigned today.' },
  { subject: 'Approve payroll before 6pm', note: '' },
  { subject: 'Send closing notes to Wendy', note: 'Three Sedgwick claims ready.' },
  { subject: 'Review today\'s QC bucket', note: '' },
  { subject: 'Email reminder to Alex re: Monday meeting', note: '' },
];

// 5 further-out reminders — admin only.
const scheduled = [
  { subject: 'Weekly team sync agenda', note: '', fire_at: daysOut(1, 9, 0) },
  { subject: 'Submit Q4 marketing report', note: 'Needs updated appraiser headcount.', fire_at: daysOut(3, 10, 0) },
  { subject: 'Monthly billing audit', note: 'Pull invoice totals for October.', fire_at: daysOut(7, 14, 0) },
  { subject: 'Rotate CRON_SECRET', note: 'Was briefly visible in chat screenshot — rotate as housekeeping.', fire_at: daysOut(14, 10, 0) },
  { subject: 'Renew Resend API key cycle', note: '', fire_at: daysOut(30, 10, 0) },
];

const channels = { in_app: true, push: false, email: false };

async function main() {
  const rows = [];

  // Today reminders — one row per target (admin + appraiser).
  for (const r of today) {
    for (const target of [HENRY_ADMIN, HENRY_APPRAISER]) {
      rows.push({
        created_by: HENRY_ADMIN,
        target_user_id: target,
        subject: r.subject,
        note: r.note || r.subject, // DB check requires non-empty note
        fire_at: t555.toISOString(),
        claim_id: null,
        recurrence: null,
        channels,
      });
    }
  }

  // Scheduled — admin only.
  for (const r of scheduled) {
    rows.push({
      created_by: HENRY_ADMIN,
      target_user_id: HENRY_ADMIN,
      subject: r.subject,
      note: r.note || r.subject,
      fire_at: r.fire_at.toISOString(),
      claim_id: null,
      recurrence: null,
      channels,
    });
  }

  console.log(`Inserting ${rows.length} reminders (${today.length}×2 today + ${scheduled.length} scheduled)…`);

  const { data, error } = await db.from('reminders').insert(rows).select('id, subject, fire_at, target_user_id');
  if (error) {
    console.error('insert failed:', error);
    process.exit(1);
  }
  console.log(`✓ Inserted ${data.length} rows.`);
  console.log('Fire times:');
  console.log('  Today-at-5:55:', t555.toLocaleString());
  for (const r of scheduled) {
    console.log(`  ${r.subject}: ${r.fire_at.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
