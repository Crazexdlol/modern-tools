'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, X, Search, Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ReminderChannels, ReminderRecurrence } from '@/lib/reminders/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type UserOption = { id: string; name: string | null; role: string };
type ClaimOption = { id: string; label: string; ma: string; insured: string };

function toIsoLocal(d: Date): string {
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
    const diff = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

type PushState = 'default' | 'granted' | 'denied' | 'unsupported';
function readPushState(): PushState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return (Notification.permission as PushState) ?? 'default';
}

export function CreateReminderSheet({ open, onClose, onCreated }: Props) {
  const [me, setMe] = useState<UserOption | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [showRecipients, setShowRecipients] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [fireLocal, setFireLocal] = useState(toIsoLocal(presetTime('in1h')));

  const [claims, setClaims] = useState<ClaimOption[]>([]);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimSearch, setClaimSearch] = useState('');

  const [channels, setChannels] = useState<ReminderChannels>({
    in_app: false,
    push: false,
    email: true,
  });
  const [pushState, setPushState] = useState<PushState>('default');
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide the HamsPortal chat launcher + any fired reminder toasts while the
  // create-sheet is open so they don't overlap the sheet / Create button.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('reminder-sheet-open');
    return () => document.body.classList.remove('reminder-sheet-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ps = readPushState();
    setPushState(ps);
    // Default both channels on. Push only auto-ticks when the browser has
    // already granted notification permission — if permission is 'default',
    // 'denied', or unsupported, we leave push off so we don't claim a
    // delivery channel we can't actually hit.
    setChannels({ in_app: false, push: ps === 'granted', email: true });
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name');
      const list = (profiles ?? []) as UserOption[];
      const myProfile = list.find((u) => u.id === userData.user!.id) ?? null;
      setMe(myProfile);
      setUsers(list);
      if (myProfile) setTargets([myProfile.id]);

      // Open claims only — closed claims rarely need reminders and bloat the picker.
      const { data: claimRows } = await supabase
        .from('acv_history')
        .select('id, ma_number, claim, status, created_at')
        .neq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(200);
      const claimOpts: ClaimOption[] = (claimRows ?? []).map((c) => {
        const insured =
          (c as { claim?: { insuredName?: string } }).claim?.insuredName ?? '';
        const ma = (c as { ma_number?: string }).ma_number ?? '';
        return {
          id: (c as { id: string }).id,
          ma,
          insured,
          label: ma && insured ? `MA# ${ma} · ${insured}` : ma ? `MA# ${ma}` : insured || c.id,
        };
      });
      setClaims(claimOpts);
    })();
  }, [open]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) =>
      (u.name ?? '').toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredClaims = useMemo(() => {
    if (!claimSearch.trim()) return claims.slice(0, 50);
    const q = claimSearch.trim().toLowerCase();
    return claims
      .filter((c) =>
        c.ma.toLowerCase().includes(q) ||
        c.insured.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [claims, claimSearch]);

  const selectedClaim = useMemo(
    () => claims.find((c) => c.id === claimId) ?? null,
    [claims, claimId]
  );

  const toggleTarget = (id: string) => {
    setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const applyPreset = (preset: 'in1h' | 'in4h' | 'tomorrow9' | 'nextMon9') => {
    setFireLocal(toIsoLocal(presetTime(preset)));
  };

  const handlePushToggle = async (checked: boolean) => {
    if (!checked) {
      setChannels((c) => ({ ...c, push: false }));
      return;
    }
    if (pushState === 'unsupported') return;
    if (pushState === 'denied') return;
    if (pushState === 'default') {
      const perm = await Notification.requestPermission();
      setPushState(perm as PushState);
      if (perm !== 'granted') return;
    }
    setChannels((c) => ({ ...c, push: true }));
  };

  const submit = async () => {
    setError(null);
    if (!subject.trim()) return setError('Please add a subject.');
    if (targets.length === 0) return setError('Pick at least one recipient.');
    if (!channels.push && !channels.email) {
      return setError('Pick email, browser notification, or both.');
    }
    setSubmitting(true);
    const fireAt = new Date(fireLocal).toISOString();
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_ids: targets,
        subject: subject.trim(),
        note: note.trim(),
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
    setSubject('');
    setNote('');
    setClaimId(null);
    setClaimSearch('');
    setRecurrence(null);
    setChannels({ in_app: false, push: pushState === 'granted', email: true });
    setShowRecipients(false);
    onCreated();
    onClose();
  };

  if (!open) return null;

  const extraRecipientCount = targets.filter((id) => id !== me?.id).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-[26rem] bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold tracking-tight text-black flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            New reminder
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Subject
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Follow up with Sedgwick on AVC"
              maxLength={200}
            />
          </div>

          {/* Optional body */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Details <span className="normal-case tracking-normal text-gray-400 font-normal">(optional)</span>
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any extra context…"
              rows={3}
              maxLength={1000}
              className="resize-none"
            />
          </div>

          {/* When */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              When
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([
                ['in1h', 'In 1 hour'],
                ['in4h', 'In 4 hours'],
                ['tomorrow9', 'Tomorrow 9am'],
                ['nextMon9', 'Next Mon 9am'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300"
                  onClick={() => applyPreset(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              type="datetime-local"
              value={fireLocal}
              onChange={(e) => setFireLocal(e.target.value)}
            />
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Recipients
            </label>
            <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Users className="w-4 h-4 text-gray-500" />
                <span>
                  {targets.includes(me?.id ?? '') ? 'Myself' : 'No one'}
                  {extraRecipientCount > 0 && (
                    <span className="text-gray-500"> + {extraRecipientCount} other{extraRecipientCount === 1 ? '' : 's'}</span>
                  )}
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                onClick={() => setShowRecipients((v) => !v)}
              >
                {showRecipients ? 'Done' : 'Change'}
              </button>
            </div>
            {showRecipients && (
              <div className="mt-2 rounded border border-gray-200">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or role…"
                    className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-500 text-center">No matches.</div>
                  ) : (
                    filteredUsers.map((u) => {
                      const selected = targets.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTarget(u.id)}
                            className="accent-blue-600"
                          />
                          <span className="flex-1 text-gray-900">
                            {u.id === me?.id ? 'Myself' : u.name || '(unnamed)'}
                          </span>
                          {u.role === 'admin' && u.id !== me?.id && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              Admin
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Claim link */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Linked claim <span className="normal-case tracking-normal text-gray-400 font-normal">(optional)</span>
            </label>
            {selectedClaim ? (
              <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{selectedClaim.label}</div>
                </div>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2"
                  onClick={() => { setClaimId(null); setClaimSearch(''); }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="rounded border border-gray-200">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={claimSearch}
                    onChange={(e) => setClaimSearch(e.target.value)}
                    placeholder="Search MA# or insured name…"
                    className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredClaims.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-500 text-center">
                      {claims.length === 0 ? 'No open claims.' : 'No matches.'}
                    </div>
                  ) : (
                    filteredClaims.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                        onClick={() => setClaimId(c.id)}
                      >
                        <span className="text-gray-900">{c.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Repeat */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Repeat
            </label>
            <select
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-white"
              value={recurrence?.freq ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) setRecurrence(null);
                else setRecurrence({ freq: v as 'daily' | 'weekly' | 'monthly', interval: 1, end_at: null });
              }}
            >
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Channels */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Delivery
            </label>
            <div className="rounded border border-gray-200 divide-y divide-gray-100">
              <label
                className={`flex items-center justify-between px-3 py-2 ${
                  pushState === 'denied' || pushState === 'unsupported'
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-gray-50'
                }`}
              >
                <div>
                  <div className="text-sm text-gray-900">Browser notification</div>
                  <div className="text-xs text-gray-500">
                    {pushState === 'unsupported'
                      ? 'Not supported in this browser.'
                      : pushState === 'denied'
                        ? 'Blocked — enable notifications in browser settings.'
                        : pushState === 'granted'
                          ? 'Pops even if HamsPortal is closed.'
                          : 'We will ask for permission when you turn this on.'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.push}
                  disabled={pushState === 'denied' || pushState === 'unsupported'}
                  onChange={(e) => handlePushToggle(e.target.checked)}
                  className="accent-blue-600"
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50">
                <div>
                  <div className="text-sm text-gray-900">Email</div>
                  <div className="text-xs text-gray-500">Sent from notifications@hamsportal.com.</div>
                </div>
                <input
                  type="checkbox"
                  checked={channels.email}
                  onChange={(e) => setChannels({ ...channels, email: e.target.checked })}
                  className="accent-blue-600"
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white">
          <Button
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create reminder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
