import type { ReminderRecurrence } from './types';

// Returns the next fire time as an ISO string, or null if the recurrence has
// ended (next computed time would exceed end_at).
export function computeNextFire(
  currentFireAt: string,
  recurrence: ReminderRecurrence
): string | null {
  const base = new Date(currentFireAt);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`invalid fireAt: ${currentFireAt}`);
  }
  const interval = Math.max(1, Math.floor(recurrence.interval || 1));
  const next = new Date(base);

  if (recurrence.freq === 'daily') {
    next.setUTCDate(next.getUTCDate() + interval);
  } else if (recurrence.freq === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7 * interval);
  } else if (recurrence.freq === 'monthly') {
    // Preserve the day-of-month, clamping to the last day of the target month
    // (e.g. Jan 31 + 1 month = Feb 28).
    const targetDay = base.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    const daysInTargetMonth = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
    ).getUTCDate();
    next.setUTCDate(Math.min(targetDay, daysInTargetMonth));
  } else {
    throw new Error(`unknown freq: ${(recurrence as { freq: string }).freq}`);
  }

  if (recurrence.end_at) {
    const end = new Date(recurrence.end_at);
    if (next.getTime() > end.getTime()) return null;
  }
  return next.toISOString();
}
