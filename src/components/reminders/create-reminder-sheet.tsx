'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ReminderChannels, ReminderRecurrence } from '@/lib/reminders/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type UserOption = { id: string; full_name: string | null; role: string };
type ClaimOption = { id: string; label: string };

function toIsoLocal(d: Date): string {
  // Formats a Date as the value expected by <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function presetTime(preset: 'in1h' | 'in4h' | 'tomorrow9' | 'nextMon9'): Date {
  const d = new Date();
  if (preset === 'in1h') d.setHours(d.getHours() + 1);
  else if (preset === 'in4h') d.setHours(d.getHours() + 4);
  else if (preset === 'tomorrow9') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (preset === 'nextMon9') {
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7; // next Monday (even if today is Monday)
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

export function CreateReminderSheet({ open, onClose, onCreated }: Props) {
  const [me, setMe] = useState<UserOption | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [fireLocal, setFireLocal] = useState(toIsoLocal(presetTime('in1h')));
  const [claims, setClaims] = useState<ClaimOption[]>([]);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ReminderChannels>({
    in_app: true,
    push: false,
    email: false,
  });
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current user + target options when the sheet opens.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');
      const list = (profiles ?? []) as UserOption[];
      const myProfile = list.find((u) => u.id === userData.user!.id) ?? null;
      setMe(myProfile);
      // Appraisers: self + admins only. Admins: everyone.
      if (myProfile?.role === 'admin') {
        setUsers(list);
      } else {
        setUsers(list.filter((u) => u.id === myProfile?.id || u.role === 'admin'));
      }
      if (myProfile) setTargets([myProfile.id]);

      const { data: claimRows } = await supabase
        .from('acv_history')
        .select('id, ma_number, claim')
        .limit(500);
      const claimOpts: ClaimOption[] = (claimRows ?? []).map((c) => {
        const insured =
          (c as { claim?: { insuredName?: string } }).claim?.insuredName ?? '';
        const ma = (c as { ma_number?: string }).ma_number ?? '';
        return { id: (c as { id: string }).id, label: `${ma || c.id} · ${insured}` };
      });
      setClaims(claimOpts);
    })();
  }, [open]);

  const toggleTarget = (id: string) => {
    setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const applyPreset = (preset: 'in1h' | 'in4h' | 'tomorrow9' | 'nextMon9') => {
    setFireLocal(toIsoLocal(presetTime(preset)));
  };

  const submit = async () => {
    setError(null);
    if (targets.length === 0) return setError('Pick at least one recipient.');
    if (!note.trim()) return setError('Note required.');
    if (!channels.in_app && !channels.push && !channels.email) {
      return setError('Pick at least one delivery channel.');
    }
    setSubmitting(true);
    const fireAt = new Date(fireLocal).toISOString();
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_ids: targets,
        note,
        fire_at: fireAt,
        claim_id: claimId,
        recurrence,
        channels,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'request failed' }));
      setError(body.error ?? 'request failed');
      return;
    }
    // Reset the form and close.
    setNote('');
    setClaimId(null);
    setRecurrence(null);
    setChannels({ in_app: true, push: false, email: false });
    onCreated();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl p-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">New reminder</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900">×</button>
        </div>

        <label className="block text-xs font-medium mb-1">Who</label>
        <div className="max-h-40 overflow-y-auto border rounded-md p-2 mb-3 text-sm">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={targets.includes(u.id)}
                onChange={() => toggleTarget(u.id)}
              />
              <span>
                {u.id === me?.id ? 'Myself' : u.full_name || '(unnamed)'}
                {u.role === 'admin' && u.id !== me?.id && (
                  <span className="ml-1 text-[10px] text-neutral-500">admin</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <label className="block text-xs font-medium mb-1">What</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. follow up on 3964743 Lord Explorer DV"
          rows={3}
          maxLength={1000}
          className="mb-3"
        />

        <label className="block text-xs font-medium mb-1">When</label>
        <div className="flex flex-wrap gap-1 mb-2">
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('in1h')}>In 1h</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('in4h')}>In 4h</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('tomorrow9')}>Tomorrow 9am</button>
          <button type="button" className="text-xs px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200" onClick={() => applyPreset('nextMon9')}>Next Mon 9am</button>
        </div>
        <Input
          type="datetime-local"
          value={fireLocal}
          onChange={(e) => setFireLocal(e.target.value)}
          className="mb-3"
        />

        <label className="block text-xs font-medium mb-1">Repeat</label>
        <select
          className="w-full border rounded-md px-2 py-1 text-sm mb-3"
          value={recurrence?.freq ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) setRecurrence(null);
            else setRecurrence({ freq: v as 'daily' | 'weekly' | 'monthly', interval: 1, end_at: null });
          }}
        >
          <option value="">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        <label className="block text-xs font-medium mb-1">Link to claim (optional)</label>
        <select
          className="w-full border rounded-md px-2 py-1 text-sm mb-3"
          value={claimId ?? ''}
          onChange={(e) => setClaimId(e.target.value || null)}
        >
          <option value="">— no claim —</option>
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <label className="block text-xs font-medium mb-1">Channels</label>
        <div className="flex flex-col gap-1 mb-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.in_app}
              onChange={(e) => setChannels({ ...channels, in_app: e.target.checked })}
            />
            In-app popup
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.push}
              onChange={async (e) => {
                if (e.target.checked && typeof window !== 'undefined' && 'Notification' in window) {
                  const perm = await Notification.requestPermission();
                  if (perm !== 'granted') {
                    alert('Browser push requires notification permission.');
                    return;
                  }
                }
                setChannels({ ...channels, push: e.target.checked });
              }}
            />
            Browser push
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={channels.email}
              onChange={(e) => setChannels({ ...channels, email: e.target.checked })}
            />
            Email
          </label>
        </div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create reminder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
