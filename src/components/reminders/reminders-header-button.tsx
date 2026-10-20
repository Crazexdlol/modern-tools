'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import type { Reminder } from '@/lib/reminders/types';
import { ReminderRow } from './reminder-row';
import { CreateReminderSheet } from './create-reminder-sheet';
import { confirmDialog } from '@/components/ui/dialog-service';

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
    const reminders = (data.reminders ?? []) as Reminder[];
    setItems(reminders);
    setLoading(false);
    if (which === 'upcoming') {
      // Badge counts only reminders that have already fired and are waiting
      // for action — not ones still scheduled in the future. Showing a count
      // for not-yet-due reminders was misleading.
      setUpcomingCount(reminders.filter((r) => r.status === 'fired').length);
    }
  }, []);

  // Load the fired-but-unactioned count on mount so the badge is accurate
  // before the user opens the popover. Poll every 60s so a reminder firing
  // in another tab still bumps this user's badge within a minute.
  useEffect(() => {
    const refresh = async () => {
      const res = await fetch('/api/reminders?tab=upcoming');
      const data = await res.json();
      const reminders = (data.reminders ?? []) as Reminder[];
      setUpcomingCount(reminders.filter((r) => r.status === 'fired').length);
    };
    refresh();
    const t = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // When the popover opens, (re)load the active tab.
  useEffect(() => {
    if (open) load(tab);
  }, [open, tab, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete reminder?', message: 'This reminder will be removed. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' }))) return;
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    setItems((prev) => {
      const deleted = prev.find((r) => r.id === id);
      if (tab === 'upcoming' && deleted?.status === 'fired') {
        setUpcomingCount((n) => Math.max(0, n - 1));
      }
      return prev.filter((r) => r.id !== id);
    });
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
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold tabular-nums">
              {upcomingCount > 99 ? '99+' : upcomingCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-96 p-0 border-gray-200 shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-base font-bold tracking-tight text-black flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              Reminders
            </h2>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-7 px-3"
              onClick={() => { setSheetOpen(true); setOpen(false); }}
            >
              + New
            </Button>
          </div>
          <div className="p-3">


          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="grid grid-cols-3 w-full h-9 bg-gray-100">
              <TabsTrigger value="upcoming" className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Upcoming</TabsTrigger>
              <TabsTrigger value="sent" className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Sent</TabsTrigger>
              <TabsTrigger value="done" className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:font-semibold">Done</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-gray-500 py-6 text-center">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-gray-500 py-6 text-center">Nothing upcoming.</div>
              ) : (
                groupUpcoming(items).map((g) => (
                  <div key={g.label} className="mt-3 first:mt-0">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1">
                      {g.label}
                    </div>
                    {g.items.map((r) => (
                      <ReminderRow
                        key={r.id}
                        reminder={r}
                        onDelete={handleDelete}
                        onAcknowledged={(id) => {
                          setItems((prev) => prev.filter((x) => x.id !== id));
                          setUpcomingCount((n) => Math.max(0, n - 1));
                        }}
                      />
                    ))}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="sent" className="mt-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-gray-500 py-6 text-center">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-gray-500 py-6 text-center">Nothing sent.</div>
              ) : (
                items.map((r) => <ReminderRow key={r.id} reminder={r} onDelete={handleDelete} />)
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-gray-500 py-6 text-center">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-gray-500 py-6 text-center">Nothing done yet.</div>
              ) : (
                items.map((r) => <ReminderRow key={r.id} reminder={r} />)
              )}
            </TabsContent>
          </Tabs>
          </div>
        </PopoverContent>
      </Popover>

      <CreateReminderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => { load(tab); /* badge only counts fired-unactioned, so new scheduled reminders don't bump it */ }}
      />
    </>
  );
}
