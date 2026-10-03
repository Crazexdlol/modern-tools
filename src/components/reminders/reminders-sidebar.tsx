'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderRow } from './reminder-row';
import { CreateReminderSheet } from './create-reminder-sheet';

function groupUpcoming(items: Reminder[]): { label: string; items: Reminder[] }[] {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  const endOfWeek = new Date(endOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfToday.getDay()));

  const buckets: Record<string, Reminder[]> = { Today: [], Tomorrow: [], 'This week': [], Later: [] };
  for (const r of items) {
    const t = new Date(r.fire_at).getTime();
    if (t <= endOfToday.getTime()) buckets.Today.push(r);
    else if (t <= endOfTomorrow.getTime()) buckets.Tomorrow.push(r);
    else if (t <= endOfWeek.getTime()) buckets['This week'].push(r);
    else buckets.Later.push(r);
  }
  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, items]) => ({ label, items }));
}

type Tab = 'upcoming' | 'sent' | 'done';

export function RemindersSidebar() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/reminders?tab=${which}`);
    const data = await res.json();
    setItems(data.reminders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const upcomingCount = tab === 'upcoming' ? items.length : null;

  return (
    <aside className="w-64 shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          🔔 Reminders
          {upcomingCount !== null && upcomingCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-900 rounded-full px-1.5">
              {upcomingCount}
            </span>
          )}
        </h2>
        <Button size="sm" onClick={() => setSheetOpen(true)}>+ New</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid grid-cols-3 w-full h-8">
          <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
          <TabsTrigger value="sent" className="text-xs">Sent</TabsTrigger>
          <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing upcoming.</div>
          ) : (
            groupUpcoming(items).map((g) => (
              <div key={g.label} className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                  {g.label}
                </div>
                {g.items.map((r) => (
                  <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />
                ))}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing sent.</div>
          ) : (
            items.map((r) => <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />)
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-2">
          {loading ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-4 text-center">Nothing done yet.</div>
          ) : (
            items.map((r) => <ReminderRow key={r.id} reminder={r} />)
          )}
        </TabsContent>
      </Tabs>

      <CreateReminderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => load(tab)}
      />
    </aside>
  );
}
