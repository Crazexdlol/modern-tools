'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Reminder } from '@/lib/reminders/types';

// Returns a two-line label — top line is the day context, bottom line is the
// clock time. Compact enough to fit in a ~90px column.
function formatFireAt(iso: string, nowMs = Date.now()): { day: string; time: string } {
  const d = new Date(iso);
  const diffMs = d.getTime() - nowMs;
  const absMs = Math.abs(diffMs);

  if (absMs < 60_000) return { day: 'Now', time: '' };
  if (absMs < 60 * 60 * 1000) {
    const mins = Math.round(absMs / 60_000);
    return diffMs > 0
      ? { day: `In ${mins}m`, time: '' }
      : { day: `${mins}m ago`, time: '' };
  }

  const now = new Date(nowMs);
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const diffDays = Math.round((d.getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000);

  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (sameDay) return { day: 'Today', time: timeStr };
  if (d.toDateString() === tomorrow.toDateString()) return { day: 'Tomorrow', time: timeStr };
  if (d.toDateString() === yesterday.toDateString()) return { day: 'Yesterday', time: timeStr };
  if (diffDays > 1 && diffDays <= 6) {
    return { day: d.toLocaleDateString(undefined, { weekday: 'short' }), time: timeStr };
  }
  if (diffDays < -1 && diffDays >= -6) {
    return { day: d.toLocaleDateString(undefined, { weekday: 'short' }), time: timeStr };
  }
  return {
    day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    time: timeStr,
  };
}

type Props = {
  reminder: Reminder;
  onDelete?: (id: string) => void;
  onAcknowledged?: (id: string) => void;
};

function headline(r: Reminder): string {
  const s = (r.subject ?? '').trim();
  if (s) return s;
  return (r.note ?? '').trim() || 'Reminder';
}

function bodyIfDifferent(r: Reminder): string {
  const subject = (r.subject ?? '').trim();
  const note = (r.note ?? '').trim();
  if (!note || note === subject) return '';
  return note;
}

export function ReminderRow({ reminder, onDelete, onAcknowledged }: Props) {
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);
  const title = headline(reminder);
  const sub = bodyIfDifferent(reminder);
  const ma = reminder.claim_ma_number;
  const when = formatFireAt(reminder.fire_at);
  const isFired = reminder.status === 'fired';

  const ack = async () => {
    setBusy(true);
    const res = await fetch(`/api/reminders/${reminder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge' }),
    });
    setBusy(false);
    if (res.ok) {
      setAcked(true);
      onAcknowledged?.(reminder.id);
    }
  };

  if (acked) return null;

  return (
    <div
      className={`group flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0 ${
        isFired ? 'bg-blue-50/40 -mx-2 px-2 rounded' : ''
      }`}
    >
      <div className="w-20 shrink-0 pt-0.5 leading-tight">
        <div className={`text-xs font-medium ${isFired ? 'text-blue-700' : 'text-gray-700'}`}>
          {isFired ? 'Fired' : when.day}
        </div>
        {when.time && <div className="text-[10px] text-gray-500 tabular-nums">{when.time}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 truncate">
          <span className="font-medium">{title}</span>
          {reminder.claim_id && ma && (
            <>
              <span className="text-gray-400"> · </span>
              <a
                href={`/claims/${reminder.claim_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                #MA{ma}
              </a>
            </>
          )}
          {reminder.claim_id && !ma && (
            <>
              <span className="text-gray-400"> · </span>
              <a
                href={`/claims/${reminder.claim_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                claim
              </a>
            </>
          )}
        </div>
        {sub && (
          <div className="text-xs text-gray-600 truncate mt-0.5">{sub}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isFired && (
          <button
            onClick={ack}
            disabled={busy}
            title="Mark done"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-blue-600 hover:text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            aria-label="Mark done"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(reminder.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 inline-flex items-center justify-center w-6 h-6"
            aria-label="Delete"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
