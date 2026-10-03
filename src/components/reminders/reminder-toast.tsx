'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Reminder } from '@/lib/reminders/types';

type Props = {
  reminder: Reminder;
  onAck: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  onDismiss: (id: string) => void;
};

function snoozeTime(preset: '10m' | '1h' | 'tomorrow9'): string {
  const d = new Date();
  if (preset === '10m') d.setMinutes(d.getMinutes() + 10);
  else if (preset === '1h') d.setHours(d.getHours() + 1);
  else if (preset === 'tomorrow9') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

export function ReminderToast({ reminder, onAck, onSnooze, onDismiss }: Props) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  return (
    <div className="w-80 rounded-xl border border-amber-300 bg-amber-50 shadow-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900">🔔 Reminder</div>
        <button
          onClick={() => onDismiss(reminder.id)}
          className="text-amber-700 hover:text-amber-900 text-xs"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="mt-1 text-sm text-neutral-900 whitespace-pre-wrap">{reminder.note}</div>
      {reminder.claim_id && (
        <a
          className="mt-2 inline-block text-xs underline text-amber-800"
          href={`/claims/${reminder.claim_id}`}
        >
          Open claim →
        </a>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => onAck(reminder.id)}>Done</Button>
        <div className="relative">
          <Button size="sm" variant="secondary" onClick={() => setSnoozeOpen((v) => !v)}>
            Snooze ▾
          </Button>
          {snoozeOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-36 rounded-md border bg-white shadow z-10">
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('10m')); }}
              >
                10 minutes
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('1h')); }}
              >
                1 hour
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100"
                onClick={() => { setSnoozeOpen(false); onSnooze(reminder.id, snoozeTime('tomorrow9')); }}
              >
                Tomorrow 9am
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
