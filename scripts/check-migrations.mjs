import { createClient } from '@supabase/supabase-js';

const url = 'https://ektglhdstobaipdqssjx.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

const sb = createClient(url, key, { auth: { persistSession: false } });

async function probeColumn(table, column) {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return { exists: true };
  // PostgREST returns code 42703 (undefined column) when column missing
  if (error.code === '42703' || /column .* does not exist/i.test(error.message)) return { exists: false, msg: error.message };
  if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) return { exists: false, msg: error.message, tableMissing: true };
  return { exists: 'unknown', msg: error.message, code: error.code };
}

async function probeTable(table) {
  const { error } = await sb.from(table).select('*').limit(1);
  if (!error) return { exists: true };
  if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) return { exists: false };
  return { exists: 'unknown', msg: error.message };
}

const checks = [
  { label: 'reminders table (migration-reminders)', probe: () => probeTable('reminders') },
  { label: 'reminders.subject column (migration-reminders-subject)', probe: () => probeColumn('reminders', 'subject') },
  { label: 'messages.is_admin_only column (migration-message-admin-only)', probe: () => probeColumn('messages', 'is_admin_only') },
  { label: 'profiles.email_notifications_enabled (migration-email-notifications-flag)', probe: () => probeColumn('profiles', 'email_notifications_enabled') },
];

for (const c of checks) {
  const res = await c.probe();
  const mark = res.exists === true ? '✓ APPLIED' : res.exists === false ? '✗ NOT APPLIED' : '? UNKNOWN';
  console.log(mark, '—', c.label);
  if (res.exists !== true && res.msg) console.log('        →', res.msg);
}

// anyone-targets-anyone check: try as service role (always allowed) + inspect trigger if possible
console.log('\n[trigger check]');
console.log('The anyone-targets-anyone migration drops a role restriction inside the reminders_insert_guard trigger.');
console.log('Service role bypasses the trigger, so we cannot test from here directly.');
console.log('Best heuristic: has Henry seen "appraisers may only target themselves or admins" errors when picking a non-admin? If no, likely applied.');
