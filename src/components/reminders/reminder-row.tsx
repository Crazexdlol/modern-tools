'use client';

import type { Reminder } from '@/lib/reminders/types';

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const prefix = diff < 0 ? '' : 'in ';
  const suffix = diff < 0 ? ' ago' : '';
  if (minutes < 60) return `${prefix}${minutes}m${suffix}`;
  if (hours < 48) return `${prefix}${hours}h${suffix}`;
  return `${prefix}${days}d${suffix}`;
}

type Props = {
  reminder: Reminder;
  onDelete?: (id: string) => void;
};

export function ReminderRow({ reminder, onDelete }: Props) {
  return (
    <div className="group flex items-start gap-2 py-2 border-b border-neutral-100 last:border-b-0">
      <div className="w-16 shrink-0 text-xs text-neutral-500 pt-0.5">
        {relativeTime(reminder.fire_at)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-900 truncate">{reminder.note}</div>
        {reminder.claim_id && (
          <a
            href={`/claims/${reminder.claim_id}`}
            className="mt-0.5 inline-block text-[11px] text-blue-600 hover:underline"
          >
            → claim
          </a>
        )}
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(reminder.id)}
          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 text-xs"
          aria-label="Delete"
        >
          ×
        </button>
      )}
    </div>
  );
}
