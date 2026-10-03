'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderRow } from './reminder-row';
import { CreateReminderSheet } from './create-reminder-sheet';

type Tab = 'upcoming' | 'sent' | 'done';

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

export function RemindersHeaderButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [upcomingCount, setUpcomingCount] = useState(0);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/reminders?tab=${which}`);
    const data = await res.json();
    setItems(data.reminders ?? []);
    setLoading(false);
    if (which === 'upcoming') setUpcomingCount((data.reminders ?? []).length);
  }, []);

  // Load the upcoming count on mount so the badge is accurate before the user opens.
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/reminders?tab=upcoming');
      const data = await res.json();
      setUpcomingCount((data.reminders ?? []).length);
    })();
  }, []);

  // When the popover opens, (re)load the active tab.
  useEffect(() => {
    if (open) load(tab);
  }, [open, tab, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((r) => r.id !== id));
    if (tab === 'upcoming') setUpcomingCount((n) => Math.max(0, n - 1));
  }, [tab]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Reminders"
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Bell className="w-4.5 h-4.5" />
          {upcomingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold tabular-nums">
              {upcomingCount > 99 ? '99+' : upcomingCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">🔔 Reminders</h2>
            <Button size="sm" onClick={() => { setSheetOpen(true); setOpen(false); }}>+ New</Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="grid grid-cols-3 w-full h-8">
              <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
              <TabsTrigger value="sent" className="text-xs">Sent</TabsTrigger>
              <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-2 max-h-80 overflow-y-auto">
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

            <TabsContent value="sent" className="mt-2 max-h-80 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-neutral-500 py-4 text-center">Nothing sent.</div>
              ) : (
                items.map((r) => <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />)
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-2 max-h-80 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-neutral-500 py-4 text-center">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-neutral-500 py-4 text-center">Nothing done yet.</div>
              ) : (
                items.map((r) => <ReminderRow key={r.id} reminder={r} />)
              )}
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      <CreateReminderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => { load(tab); setUpcomingCount((n) => n + 1); }}
      />
    </>
  );
}
