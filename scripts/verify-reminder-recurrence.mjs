// Standalone verification for computeNextFire. Run with: npx tsx scripts/verify-reminder-recurrence.mjs

import { computeNextFire } from '../src/lib/reminders/recurrence.ts';

const cases = [
  // daily, interval 1, no end
  {
    name: 'daily +1 day',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 1, end_at: null },
    expected: '2026-10-04T15:00:00.000Z',
  },
  // daily interval 3
  {
    name: 'daily interval=3',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 3, end_at: null },
    expected: '2026-10-06T15:00:00.000Z',
  },
  // weekly
  {
    name: 'weekly',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'weekly', interval: 1, end_at: null },
    expected: '2026-10-10T15:00:00.000Z',
  },
  // monthly
  {
    name: 'monthly',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'monthly', interval: 1, end_at: null },
    expected: '2026-11-03T15:00:00.000Z',
  },
  // monthly end-of-month clamp (Jan 31 + 1 month → Feb 28 non-leap)
  {
    name: 'monthly end-of-month clamp (Jan 31 → Feb 28 in 2027)',
    fireAt: '2027-01-31T15:00:00.000Z',
    rec: { freq: 'monthly', interval: 1, end_at: null },
    expected: '2027-02-28T15:00:00.000Z',
  },
  // past end_at → null
  {
    name: 'past end_at returns null',
    fireAt: '2026-10-03T15:00:00.000Z',
    rec: { freq: 'daily', interval: 1, end_at: '2026-10-03T20:00:00.000Z' },
    expected: null,
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const got = computeNextFire(c.fireAt, c.rec);
  const ok = got === c.expected;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}  got=${got}  expected=${c.expected}`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
