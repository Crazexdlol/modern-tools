# Per-client rate card — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-client rate card (jsonb column on `clients` + new "Rates" tab in the client admin modal). No invoice-side consumption yet.

**Architecture:** Shape + defaults + normalizer in a new `src/lib/supabase/rate-card.ts` module; `src/lib/supabase/clients.ts` learns to read/write the new column with pre-migration 42703 tolerance; the clients admin modal splits into Details + Rates tabs with independent dirty-state and Save buttons.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, pdf-lib (not touched), lucide-react icons.

**Testing note:** HamsPortal has no automated test framework (per CLAUDE.md). Verification is `npx tsc --noEmit` + `npm run build` + manual round-trip in the browser against prod data.

---

### Task 1: Shape + normalizer module

**Files:**
- Create: `src/lib/supabase/rate-card.ts`

- [ ] **Step 1: Create the shape, default factory, and normalizer**

```ts
// Per-client billing rates. Null leaves mean "no rate set".
// Consumers must distinguish null from 0.
export interface ClientRateCard {
  primary: {
    acv:      { bare: number | null; withRta: number | null }
    dv:       { bare: number | null; withRta: number | null }
    estimate: { bare: number | null; withRta: number | null }
    storage:  { bare: number | null; withRta: number | null }
  }
  addOns: {
    desk: number | null
    lou: number | null
    full: number | null
    salvage: number | null
    specialty: number | null
    other: number | null
    umpire: number | null
    carfax: number | null
    windowSticker: number | null
    rush: number | null
    cancellation: number | null
  }
  time: {
    hourly: number | null
    mileage: number | null
  }
}

export const PRIMARY_RATE_KEYS = ['acv', 'dv', 'estimate', 'storage'] as const
export type PrimaryRateKey = typeof PRIMARY_RATE_KEYS[number]

export const PRIMARY_RATE_LABELS: Record<PrimaryRateKey, string> = {
  acv: 'ACV',
  dv: 'DV',
  estimate: 'Est Dispute',
  storage: 'Storage',
}

export const ADDON_RATE_KEYS = [
  'desk', 'lou', 'full', 'salvage', 'specialty', 'other', 'umpire',
  'carfax', 'windowSticker', 'rush', 'cancellation',
] as const
export type AddOnRateKey = typeof ADDON_RATE_KEYS[number]

export const ADDON_RATE_LABELS: Record<AddOnRateKey, string> = {
  desk: 'Desk',
  lou: 'LOU',
  full: 'FULL',
  salvage: 'Salvage',
  specialty: 'Specialty',
  other: 'Other',
  umpire: 'Umpire',
  carfax: 'Carfax',
  windowSticker: 'Window Sticker',
  rush: 'Rush Fee',
  cancellation: 'Cancellation Fee',
}

export function defaultRateCard(): ClientRateCard {
  return {
    primary: {
      acv:      { bare: null, withRta: null },
      dv:       { bare: null, withRta: null },
      estimate: { bare: null, withRta: null },
      storage:  { bare: null, withRta: null },
    },
    addOns: {
      desk: null, lou: null, full: null, salvage: null, specialty: null,
      other: null, umpire: null, carfax: null, windowSticker: null,
      rush: null, cancellation: null,
    },
    time: { hourly: null, mileage: null },
  }
}

// Coerce an unknown raw value (from jsonb) into a well-formed ClientRateCard.
// Missing keys get null; non-numeric values become null. Tolerant on purpose.
export function normalizeRateCard(raw: unknown): ClientRateCard {
  const base = defaultRateCard()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const parsed = Number(v)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const primary = (r.primary ?? {}) as Record<string, unknown>
  for (const k of PRIMARY_RATE_KEYS) {
    const slot = (primary[k] ?? {}) as Record<string, unknown>
    base.primary[k].bare = num(slot.bare)
    base.primary[k].withRta = num(slot.withRta)
  }

  const addOns = (r.addOns ?? {}) as Record<string, unknown>
  for (const k of ADDON_RATE_KEYS) {
    base.addOns[k] = num(addOns[k])
  }

  const time = (r.time ?? {}) as Record<string, unknown>
  base.time.hourly = num(time.hourly)
  base.time.mileage = num(time.mileage)

  return base
}

// Equality check used by dirty-tracking in the Rates tab. Simple structural
// compare — jsonb round-trips through JSON.stringify safely because every
// leaf is number | null.
export function rateCardEquals(a: ClientRateCard, b: ClientRateCard): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (new module is self-contained)

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/rate-card.ts
git commit -m "feat(rate-card): shape + normalizer module"
```

---

### Task 2: Wire rateCard into Client type + read/write

**Files:**
- Modify: `src/lib/supabase/clients.ts`

- [ ] **Step 1: Import the rate-card module at the top of clients.ts**

Add this import near the top of `src/lib/supabase/clients.ts` (after the existing `createBrowserClient` import):

```ts
import { normalizeRateCard, type ClientRateCard } from './rate-card'
```

- [ ] **Step 2: Add `rateCard` to the `Client` interface**

In `src/lib/supabase/clients.ts`, inside the `export interface Client { ... }` block, add this field right after `rtaDefault`:

```ts
  // Per-client billing rates. Null = no column (pre-migration) OR no rates
  // entered. Readers always get a complete shell (every key present with
  // null leaves) via normalizeRateCard — safe to access blindly.
  rateCard: ClientRateCard
```

- [ ] **Step 3: Add `rate_card` to the `ClientRow` interface**

In the same file, inside `interface ClientRow { ... }`, add this field right after `rta_default`:

```ts
  rate_card?: unknown
```

- [ ] **Step 4: Populate rateCard in `rowToClient`**

In `rowToClient`, add this line to the returned object, right after `rtaDefault: r.rta_default === true,`:

```ts
    rateCard: normalizeRateCard(r.rate_card),
```

- [ ] **Step 5: Teach `updateClient` to write rate_card with 42703 fallback**

In `updateClient`:

(a) Add this patch mapping line after the existing `if (patch.rtaDefault !== undefined) dbPatch.rta_default = patch.rtaDefault` line:

```ts
  if (patch.rateCard !== undefined) dbPatch.rate_card = patch.rateCard
```

(b) In the 42703 strip-and-retry loop, add `'rate_card'` to the list of columns stripped. Change:

```ts
    for (const col of ['type_custom', 'rough_numbers_default', 'rta_default']) {
```

to:

```ts
    for (const col of ['type_custom', 'rough_numbers_default', 'rta_default', 'rate_card']) {
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/clients.ts
git commit -m "feat(rate-card): read/write rate_card on clients with 42703 fallback"
```

---

### Task 3: Rates tab component

**Files:**
- Create: `src/app/admin/settings/clients/_rates-tab.tsx`

- [ ] **Step 1: Create the Rates tab component**

```tsx
"use client"

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { alertDialog } from '@/components/ui/dialog-service'
import { updateClient, type Client } from '@/lib/supabase/clients'
import {
  PRIMARY_RATE_KEYS,
  PRIMARY_RATE_LABELS,
  ADDON_RATE_KEYS,
  ADDON_RATE_LABELS,
  defaultRateCard,
  rateCardEquals,
  type ClientRateCard,
} from '@/lib/supabase/rate-card'

// Decimal text input for a dollar amount. Empty string = null.
function RateInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  const display = value === null ? '' : String(value)
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') return onChange(null)
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) return
        onChange(parsed)
      }}
      className="w-28 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

export function RatesTab({
  client,
  onSaved,
}: {
  client: Client
  onSaved: () => Promise<void> | void
}) {
  const [card, setCard] = useState<ClientRateCard>(client.rateCard ?? defaultRateCard())
  const [busy, setBusy] = useState(false)

  const dirty = !rateCardEquals(card, client.rateCard ?? defaultRateCard())

  const save = async () => {
    if (!dirty || busy) return
    setBusy(true)
    const updated = await updateClient(client.id, { rateCard: card })
    setBusy(false)
    if (!updated) {
      await alertDialog({
        title: 'Save failed',
        message: 'Could not save rate card. Check the console for details. If this is the first time saving rates, confirm the client-rate-card migration has been run in Supabase.',
        variant: 'danger',
      })
      return
    }
    // If the DB round-trip stripped rate_card (pre-migration 42703 fallback),
    // the returned client will have null-leaves everywhere. Compare to detect.
    if (rateCardEquals(updated.rateCard, defaultRateCard()) && !rateCardEquals(card, defaultRateCard())) {
      await alertDialog({
        title: 'Rates not persisted',
        message: 'Save succeeded on the client record, but the rate_card column is missing. Run supabase/migration-client-rate-card.sql in Supabase, then re-save.',
        variant: 'danger',
      })
    }
    await onSaved()
  }

  const setPrimary = (
    key: typeof PRIMARY_RATE_KEYS[number],
    slot: 'bare' | 'withRta',
    v: number | null,
  ) => {
    setCard((prev) => ({
      ...prev,
      primary: { ...prev.primary, [key]: { ...prev.primary[key], [slot]: v } },
    }))
  }

  const setAddOn = (key: typeof ADDON_RATE_KEYS[number], v: number | null) => {
    setCard((prev) => ({ ...prev, addOns: { ...prev.addOns, [key]: v } }))
  }

  const setTime = (key: 'hourly' | 'mileage', v: number | null) => {
    setCard((prev) => ({ ...prev, time: { ...prev.time, [key]: v } }))
  }

  return (
    <div className="space-y-5">
      {/* Section 1 — Primary rates */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Primary Assignment Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Bare ($)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">With RTA ($)</th>
              </tr>
            </thead>
            <tbody>
              {PRIMARY_RATE_KEYS.map((k, i) => (
                <tr key={k} className={i < PRIMARY_RATE_KEYS.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-800">{PRIMARY_RATE_LABELS[k]}</td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.primary[k].bare}
                      onChange={(v) => setPrimary(k, 'bare', v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.primary[k].withRta}
                      onChange={(v) => setPrimary(k, 'withRta', v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2 — Add-ons */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Add-On Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Flat rate ($)</th>
              </tr>
            </thead>
            <tbody>
              {ADDON_RATE_KEYS.map((k, i) => (
                <tr key={k} className={i < ADDON_RATE_KEYS.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-800">{ADDON_RATE_LABELS[k]}</td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.addOns[k]}
                      onChange={(v) => setAddOn(k, v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 — Time */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Time Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-800">Hourly <span className="text-xs text-gray-400">($/hr)</span></td>
                <td className="px-3 py-2 text-right">
                  <RateInput value={card.time.hourly} onChange={(v) => setTime('hourly', v)} />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800">Mileage <span className="text-xs text-gray-400">($/mile)</span></td>
                <td className="px-3 py-2 text-right">
                  <RateInput value={card.time.mileage} onChange={(v) => setTime('mileage', v)} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={!dirty || busy}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/settings/clients/_rates-tab.tsx
git commit -m "feat(rate-card): Rates tab component"
```

---

### Task 4: Split ClientDetailPanel into Details/Rates tabs

**Files:**
- Modify: `src/app/admin/settings/clients/clients-admin-client.tsx`

- [ ] **Step 1: Import the new Rates tab + confirmDialog + useRef**

At the top of `clients-admin-client.tsx`, add `useRef` to the React import and add imports for `confirmDialog` (already imported — just verify) and the new tab:

Change the existing React import line from:
```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
```
to:
```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

Add this new import block below the existing imports:

```ts
import { RatesTab } from './_rates-tab'
```

(`confirmDialog` and `alertDialog` are already imported from `@/components/ui/dialog-service`.)

- [ ] **Step 2: Add tab-switching state + confirm-on-dirty-switch logic to ClientDetailPanel**

Inside the `ClientDetailPanel` function, add this state and ref right after the existing `const [busy, setBusy] = useState(false)` line (around the top of the component):

```ts
  const [activeTab, setActiveTab] = useState<'details' | 'rates'>('details')
  const detailsDirtyRef = useRef(false)
```

Then, below the existing `const dirty = ...` block (the big OR-chain), add:

```ts
  // Mirror the Details tab's dirty flag into a ref so the tab switcher can
  // read it without becoming part of the render-key chain.
  detailsDirtyRef.current = dirty

  const switchTab = async (next: 'details' | 'rates') => {
    if (next === activeTab) return
    if (activeTab === 'details' && detailsDirtyRef.current) {
      const ok = await confirmDialog({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved changes on the Details tab. Switch tabs and discard them?',
        confirmLabel: 'Discard',
        variant: 'danger',
      })
      if (!ok) return
    }
    setActiveTab(next)
  }
```

- [ ] **Step 3: Insert the tab strip in the modal body, between the header and the current content**

In the same `ClientDetailPanel` function, find the JSX block that starts with `{/* Edit form */}` and the preceding closing `</div>` of the header. Right before `{/* Edit form */}`, insert the tab strip:

```tsx
      {/* Tab strip */}
      <div className="px-4 pt-3 flex gap-1 border-b border-slate-100">
        {([
          { id: 'details', label: 'Details' },
          { id: 'rates',   label: 'Rates'   },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => void switchTab(t.id)}
            className={
              'px-3 py-1.5 text-sm font-semibold rounded-t-md border-b-2 -mb-px ' +
              (activeTab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Wrap the existing edit form + contacts in a Details-tab conditional, and add the Rates-tab body**

Still inside `ClientDetailPanel`, wrap the existing `{/* Edit form */}` block AND the `<ContactsSection ... />` block (everything after the tab strip you just added, up to the final `</div>` of the component) in a conditional:

Change this pattern:
```tsx
      {/* Edit form */}
      <div className="px-4 py-4 space-y-3 border-b border-slate-100">
         ...existing content...
      </div>
      <ContactsSection ... />
```

to:
```tsx
      {activeTab === 'details' && (
        <>
          {/* Edit form */}
          <div className="px-4 py-4 space-y-3 border-b border-slate-100">
            ...existing content...
          </div>
          <ContactsSection ... />
        </>
      )}

      {activeTab === 'rates' && (
        <div className="px-4 py-4">
          <RatesTab client={client} onSaved={onChanged} />
        </div>
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/settings/clients/clients-admin-client.tsx
git commit -m "feat(rate-card): tab the clients admin modal into Details + Rates"
```

---

### Task 5: Migration + rollback files

**Files:**
- Create: `supabase/migration-client-rate-card.sql`
- Create: `supabase/migration-client-rate-card-rollback.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migration-client-rate-card.sql`:

```sql
-- Adds a nullable jsonb column for per-client billing rates (what we
-- charge the client, not what we pay the appraiser — see fee_catalog
-- for the cost side).
--
-- Shape (every key optional; readers default missing keys to null):
-- {
--   "primary": {
--     "acv":      { "bare": <num|null>, "withRta": <num|null> },
--     "dv":       { "bare": <num|null>, "withRta": <num|null> },
--     "estimate": { "bare": <num|null>, "withRta": <num|null> },
--     "storage":  { "bare": <num|null>, "withRta": <num|null> }
--   },
--   "addOns": {
--     "desk": <num|null>, "lou": <num|null>, "full": <num|null>,
--     "salvage": <num|null>, "specialty": <num|null>, "other": <num|null>,
--     "umpire": <num|null>, "carfax": <num|null>,
--     "windowSticker": <num|null>, "rush": <num|null>,
--     "cancellation": <num|null>
--   },
--   "time": { "hourly": <num|null>, "mileage": <num|null> }
-- }
--
-- Null leaves mean "no rate set"; consumers must distinguish null from 0.
-- No backfill — every existing client starts with rate_card = NULL and the
-- UI normalizes NULL to the all-null shell on read.

alter table public.clients
  add column if not exists rate_card jsonb null;

comment on column public.clients.rate_card is
  'Per-client billing rates (primary assignment types, add-ons, time). '
  'Null leaves mean "no rate set"; consumers must distinguish null from 0.';
```

- [ ] **Step 2: Write the rollback**

Create `supabase/migration-client-rate-card-rollback.sql`:

```sql
-- Rollback for migration-client-rate-card.sql.
-- Drops the per-client billing rates column. Any stored rates are lost.

alter table public.clients drop column if exists rate_card;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migration-client-rate-card.sql supabase/migration-client-rate-card-rollback.sql
git commit -m "feat(rate-card): migration + rollback for clients.rate_card"
```

---

### Task 6: Final build verification + deploy

- [ ] **Step 1: Final TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds, no new warnings beyond the existing lint baseline

- [ ] **Step 3: Capture current prod deploy for rollback**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Expected: outputs current deploy id. Save the deploy URL — this is the rollback target.

- [ ] **Step 4: Deploy to prod**

Run: `npx vercel --prod --scope henry-as-projects-88caed67 --yes`
Expected: deploy succeeds, prints new deploy URL + id.

- [ ] **Step 5: Verify alias flipped**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Expected: alias now points to the new deploy id, status `● Ready`.

- [ ] **Step 6: Report back**

Produce a short message to the user with:
- New deploy id + status
- Rollback command (filled with the id captured in Step 3)
- Reminder: migration `supabase/migration-client-rate-card.sql` must be run in Supabase SQL editor to enable rate persistence. Until then, the Rates tab renders and accepts input but save surfaces a "needs migration" dialog.

---

## Self-review

**Spec coverage:**
- Data model (jsonb column + normalizer + default) → Tasks 1, 5
- `rowToClient` reads normalized → Task 2
- `updateClient` writes + 42703 fallback → Task 2
- Admin UI tabs (Details / Rates) → Task 4
- Three sections in Rates tab (Primary / Add-ons / Time) → Task 3
- Dirty tracking + Save per tab → Tasks 3, 4
- Confirm-on-tab-switch dialog → Task 4
- Pre-migration safe deploy → Task 2 (42703 strip) + Task 3 (post-save null-leaves detector)
- Migration + rollback → Task 5
- Build verify + deploy → Task 6

**Placeholder scan:** No TBDs. Every step has concrete code or exact commands.

**Type consistency:**
- `ClientRateCard` used identically in rate-card.ts, clients.ts, Rates tab ✓
- `PRIMARY_RATE_KEYS`, `ADDON_RATE_KEYS` arrays are the single source of truth for iteration order in the UI ✓
- `rateCardEquals` + `defaultRateCard` are the public dirty-tracking surface, used by Rates tab only ✓
- `updateClient` returns the updated `Client` with normalized `rateCard` — Rates tab's post-save null-leaves detector relies on this ✓
