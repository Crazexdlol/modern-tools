# Dealer.com Comp Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous scraper that visits ~7,000 US Dealer.com dealership sites daily and writes ~70k comps/day to the XSFA comps-db Supabase as a permanent archive (nothing is ever deleted).

**Architecture:** Two Node.js workers on Hostinger VPS KVM 2: `discovery-worker` (weekly systemd timer, builds dealer URL list via Cox Automotive directory + Google dorks + fingerprint checks) and `scrape-worker` (continuous systemd service, loops dealers → fetches JSON-LD inventory → batch-upserts to `listings`, writes price-change rows to `price_history`, flips `is_active=false` on 3-day disappearance). HamsPortal repo gets a SQL migration dropping the `source` column plus a code change in `mirror-listings.ts` to match. The new scraper lives in its own repo at `C:\XSFA\comp-scraper` for clean deployment separation.

**Tech Stack:** TypeScript 5, Node.js 20 LTS, `@supabase/supabase-js`, `undici` (fast fetch), `node-html-parser` (JSON-LD extraction), vitest (testing). systemd on the VPS.

**Reference spec:** `docs/superpowers/specs/2026-10-13-dealer-com-scraper-design.md` — read it first if any task is ambiguous.

---

## File Structure

### Changes in HamsPortal repo (`C:\XSFA\Modern Tools Official`)

```
supabase/
├── migration-comps-drop-source.sql           # NEW: drops listings.source
└── migration-comps-drop-source-rollback.sql  # NEW: re-adds listings.source

src/lib/comps-db/
└── mirror-listings.ts                        # MODIFY: remove source field + helper
```

### New standalone repo (`C:\XSFA\comp-scraper`)

```
comp-scraper/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── README.md
├── migrations/
│   ├── 001-dealers.sql
│   ├── 001-dealers-rollback.sql
│   ├── 002-scrape-runs.sql
│   ├── 002-scrape-runs-rollback.sql
│   ├── 003-listings-indexes.sql
│   └── 003-listings-indexes-rollback.sql
├── src/
│   ├── lib/
│   │   ├── supabase.ts                       # Supabase client
│   │   ├── types.ts                          # Shared types
│   │   ├── fetch.ts                          # HTTP fetch with retry/UA
│   │   ├── fingerprint.ts                    # Dealer.com detection
│   │   ├── jsonld.ts                         # JSON-LD Vehicle extractor
│   │   ├── robots.ts                         # robots.txt parse + check
│   │   └── log.ts                            # structured JSON logger
│   ├── discovery/
│   │   ├── cox-directory.ts                  # Cox Auto dealer locator crawler
│   │   ├── google-dork.ts                    # "powered by dealer.com" via SerpAPI
│   │   ├── verify.ts                         # Candidate → Dealer.com? → persist
│   │   └── main.ts                           # CLI entry: `npm run discovery`
│   ├── scrape/
│   │   ├── fetch-inventory.ts                # Fetch all pages for one dealer
│   │   ├── parse-vehicle.ts                  # JSON-LD Vehicle → MirrorInput
│   │   ├── upsert.ts                         # Batch upsert + price_history
│   │   ├── sold-sweep.ts                     # Flip is_active=false after 3-day miss
│   │   └── main.ts                           # Long-running loop: `npm start`
│   └── ops/
│       ├── health-email.ts                   # Daily email digest
│       └── reset-miss-count.ts               # Reset counters after deploy
├── tests/
│   ├── fingerprint.test.ts
│   ├── jsonld.test.ts
│   ├── parse-vehicle.test.ts
│   ├── fetch-inventory.test.ts
│   ├── upsert.test.ts
│   └── fixtures/
│       ├── dealer-com-inventory.html
│       ├── dealer-com-vdp.html
│       └── non-dealer-com.html
└── deploy/
    ├── scraper.service                       # systemd unit for scrape-worker
    ├── discovery.service                     # systemd one-shot for discovery
    ├── discovery.timer                       # weekly timer for discovery
    ├── health.service                        # systemd one-shot for health email
    ├── health.timer                          # daily timer for health email
    └── install.sh                            # one-shot installer script
```

---

## Phase 1 — HamsPortal cleanup (drop `source` column)

### Task 1: Write the SQL migration to drop `listings.source`

**Files:**
- Create: `supabase/migration-comps-drop-source.sql`
- Create: `supabase/migration-comps-drop-source-rollback.sql`

- [ ] **Step 1: Write the forward migration**

```sql
-- supabase/migration-comps-drop-source.sql
-- Removes the obsolete `source` column from the listings table in the XSFA
-- comps-db Supabase. Henry's directive 2026-10-13: all comps live in one
-- place now and we don't need a per-source slug column anymore.
--
-- RUN THIS IN THE XSFA comps-db SUPABASE SQL EDITOR (project COMPS_DB_URL),
-- NOT in the HamsPortal project (ektglhdstobaipdqssjx).

ALTER TABLE listings DROP COLUMN IF EXISTS source;
```

- [ ] **Step 2: Write the rollback**

```sql
-- supabase/migration-comps-drop-source-rollback.sql
-- Restores the `source` text column (nullable, no default).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source text;
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migration-comps-drop-source.sql supabase/migration-comps-drop-source-rollback.sql
git commit -m "feat(comps): migration to drop obsolete listings.source column"
```

---

### Task 2: Remove `source` from `mirror-listings.ts`

**Files:**
- Modify: `src/lib/comps-db/mirror-listings.ts`

- [ ] **Step 1: Apply the full file replacement**

Overwrite `src/lib/comps-db/mirror-listings.ts` with:

```ts
import { compsDbClient } from './client'

export type MirrorInput = {
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  dealerName: string
  dealerPhone: string
  dealerCity: string
  dealerState: string
  dealerZip: string
  photoUrl: string
  vdpUrl: string
  firstSeenAt: string | null
  priorAccident: boolean | null
  priorOwnerCount: number | null
}

type ListingRow = {
  id: number
  listing_url: string
  price: number | null
  date_first_scraped: string
}

/**
 * Mirror normalized listings (MarketCheck or Auto.dev) into the comparable-vehicles DB.
 *
 * - Upsert by listing_url (unique in listings).
 * - On price change vs most recent price_history row → insert a new price_history row.
 * - On first insert → seed a price_history row for the starting price.
 */
export async function mirrorListings(
  listings: MirrorInput[],
  opts: { active: boolean },
): Promise<void> {
  const sb = compsDbClient()
  if (!sb) return
  if (!listings.length) return

  const nowIso = new Date().toISOString()
  const todayDate = nowIso.slice(0, 10)

  const rows = listings
    .filter((l) => l.vdpUrl && l.vdpUrl.startsWith('http'))
    .map((l) => ({
      listing_url: l.vdpUrl,
      data_provider: 'scrape',
      vin: l.vin || null,
      year: l.year || null,
      make: l.make || null,
      model: l.model || null,
      trim: l.trim || null,
      mileage: l.miles || null,
      price: l.price || null,
      city: l.dealerCity || null,
      state: l.dealerState || null,
      zip: l.dealerZip || null,
      dealer_name: l.dealerName || null,
      dealer_phone: l.dealerPhone || null,
      photo_url: l.photoUrl || null,
      transmission: l.transmission || null,
      drivetrain: l.drivetrain || null,
      fuel: l.fuelType || null,
      engine_summary: l.engine || null,
      is_dealer: true,
      is_active: opts.active,
      date_listed: l.firstSeenAt ? l.firstSeenAt.slice(0, 10) : null,
      prior_accident: l.priorAccident,
      prior_owner_count: l.priorOwnerCount,
      date_first_scraped: nowIso,
      date_last_seen: nowIso,
      miss_count: 0,
    }))

  if (!rows.length) return

  const urls = rows.map((r) => r.listing_url)
  const { data: existing, error: selErr } = await sb
    .from('listings')
    .select('id, listing_url, price, date_first_scraped')
    .in('listing_url', urls)

  if (selErr) {
    console.error('[comps-mirror] pre-upsert select failed:', selErr.message)
    return
  }

  const prevById = new Map<string, ListingRow>(
    (existing ?? []).map((r) => [r.listing_url, r as ListingRow]),
  )

  const upsertRows = rows.map((r) => {
    const prev = prevById.get(r.listing_url)
    return prev ? { ...r, date_first_scraped: prev.date_first_scraped } : r
  })

  const { data: upserted, error: upErr } = await sb
    .from('listings')
    .upsert(upsertRows, { onConflict: 'listing_url' })
    .select('id, listing_url, price')

  if (upErr) {
    console.error('[comps-mirror] upsert failed:', upErr.message)
    return
  }

  const upsertedById = new Map<string, ListingRow>(
    (upserted ?? []).map((r) => [r.listing_url, r as ListingRow]),
  )

  const historyRows: { listing_id: number; price: number; date_scraped: string }[] = []
  for (const r of rows) {
    const after = upsertedById.get(r.listing_url)
    if (!after || r.price == null) continue
    const prev = prevById.get(r.listing_url)
    const priceChanged = !prev || prev.price !== r.price
    if (priceChanged) {
      historyRows.push({
        listing_id: after.id,
        price: r.price,
        date_scraped: todayDate,
      })
    }
  }

  if (historyRows.length) {
    const { error: phErr } = await sb.from('price_history').insert(historyRows)
    if (phErr) {
      console.error('[comps-mirror] price_history insert failed:', phErr.message)
    }
  }
}
```

The only functional diff: `sourceSlugFromUrl` helper deleted and the `source: sourceSlugFromUrl(l.vdpUrl)` field removed from the row builder.

- [ ] **Step 2: Verify TypeScript builds**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify Next build**

Run: `npm run build`
Expected: Build succeeds, no new warnings.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/comps-db/mirror-listings.ts
git commit -m "feat(comps): remove source field from mirror-listings"
```

---

### Task 3: Hand migration to Henry for manual run

- [ ] **Step 1: Tell Henry to run the migration**

Message Henry:
> SQL migration ready. Paste `supabase/migration-comps-drop-source.sql` into the XSFA **comps-db** Supabase SQL editor (NOT HamsPortal). Rollback is `supabase/migration-comps-drop-source-rollback.sql` if anything breaks. Deploy of HamsPortal with the mirror-listings fix will come after the migration runs (otherwise `source` NOT NULL would reject the writes). Confirm when run and I'll deploy.

Wait for Henry to confirm the migration ran before deploying HamsPortal.

- [ ] **Step 2: After Henry confirms, deploy HamsPortal**

```powershell
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
# capture the current deploy URL for rollback
npx vercel --prod --scope henry-as-projects-88caed67 --yes
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
# confirm alias flipped and status is Ready
```

Message Henry with the rollback command:
> Deployed. Rollback if needed: `npx vercel promote <OLD_URL> --scope henry-as-projects-88caed67 --yes`

---

## Phase 2 — comp-scraper repo scaffold

### Task 4: Create new standalone Node.js project

**Files:**
- Create: `C:\XSFA\comp-scraper\package.json`
- Create: `C:\XSFA\comp-scraper\tsconfig.json`
- Create: `C:\XSFA\comp-scraper\vitest.config.ts`
- Create: `C:\XSFA\comp-scraper\.env.example`
- Create: `C:\XSFA\comp-scraper\.gitignore`
- Create: `C:\XSFA\comp-scraper\README.md`

- [ ] **Step 1: Verify parent directory exists**

Run: `ls C:\XSFA`
Expected: `Modern Tools Official` directory present. If `comp-scraper` already exists, STOP and ask Henry — don't overwrite.

- [ ] **Step 2: Create project files**

`C:\XSFA\comp-scraper\package.json`:
```json
{
  "name": "comp-scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/scrape/main.js",
    "discovery": "node dist/discovery/main.js",
    "health": "node dist/ops/health-email.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests --ext .ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.57.0",
    "node-html-parser": "^6.1.13",
    "undici": "^6.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "eslint": "^8.57.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

`C:\XSFA\comp-scraper\tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`C:\XSFA\comp-scraper\vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

`C:\XSFA\comp-scraper\.env.example`:
```
COMPS_DB_URL=https://your-project.supabase.co
COMPS_DB_SERVICE_KEY=ey...
SERPAPI_KEY=
USER_AGENT=HamsPortalCompResearch/1.0 (contact@hamsportal.com)
HEALTH_EMAIL_TO=xsfabot@gmail.com
HEALTH_EMAIL_FROM=scraper@hamsportal.com
RESEND_API_KEY=
```

`C:\XSFA\comp-scraper\.gitignore`:
```
node_modules
dist
.env
.env.local
*.log
.DS_Store
coverage
```

`C:\XSFA\comp-scraper\README.md`:
```markdown
# comp-scraper

Autonomous dealership inventory scraper. Runs on Hostinger VPS KVM 2 as two
systemd services: `discovery` (weekly) and `scraper` (continuous).

Writes to the XSFA comps-db Supabase (`listings` + `price_history`).

See `../Modern Tools Official/docs/superpowers/specs/2026-10-13-dealer-com-scraper-design.md`
for the full design. Deployment steps in `deploy/install.sh`.

## Local development

cp .env.example .env
# fill in COMPS_DB_URL and COMPS_DB_SERVICE_KEY from the HamsPortal repo's .env.local
npm install
npm run test
```

- [ ] **Step 3: Install deps**

```powershell
cd C:\XSFA\comp-scraper
npm install
```

Expected: `node_modules/` populated, no vulnerabilities above moderate.

- [ ] **Step 4: Init git**

```powershell
cd C:\XSFA\comp-scraper
git init
git add -A
git commit -m "chore: scaffold comp-scraper project"
```

---

### Task 5: Create shared library — supabase client, types, fetch

**Files:**
- Create: `C:\XSFA\comp-scraper\src\lib\supabase.ts`
- Create: `C:\XSFA\comp-scraper\src\lib\types.ts`
- Create: `C:\XSFA\comp-scraper\src\lib\log.ts`
- Create: `C:\XSFA\comp-scraper\src\lib\fetch.ts`

- [ ] **Step 1: Write `src/lib/log.ts`**

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta })
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
}
```

- [ ] **Step 2: Write `src/lib/supabase.ts`**

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function compsDb(): SupabaseClient {
  if (cached) return cached
  const url = process.env.COMPS_DB_URL
  const key = process.env.COMPS_DB_SERVICE_KEY
  if (!url || !key) {
    throw new Error('COMPS_DB_URL and COMPS_DB_SERVICE_KEY must be set')
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
```

- [ ] **Step 3: Write `src/lib/types.ts`**

```ts
export type DealerRow = {
  id: number
  domain: string
  platform: 'dealer_com'
  dealer_name: string | null
  city: string | null
  state: string | null
  zip: string | null
  first_seen_at: string
  last_verified_at: string
  is_active: boolean
  miss_count: number
  notes: string | null
}

export type ListingInsert = {
  listing_url: string
  data_provider: 'scrape'
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  mileage: number | null
  price: number | null
  city: string | null
  state: string | null
  zip: string | null
  dealer_name: string | null
  dealer_phone: string | null
  photo_url: string | null
  transmission: string | null
  drivetrain: string | null
  fuel: string | null
  engine_summary: string | null
  is_dealer: true
  is_active: boolean
  date_listed: string | null
  prior_accident: boolean | null
  prior_owner_count: number | null
  date_first_scraped: string
  date_last_seen: string
  miss_count: number
}

export type ScrapeRunRow = {
  id?: number
  platform: 'dealer_com'
  started_at: string
  finished_at: string | null
  dealer_count: number
  vehicles_seen: number
  vehicles_new: number
  vehicles_updated: number
  vehicles_sold: number
  errors: number
  notes: string | null
}
```

- [ ] **Step 4: Write `src/lib/fetch.ts`**

```ts
import { request } from 'undici'
import { log } from './log.js'

const UA = process.env.USER_AGENT ?? 'HamsPortalCompResearch/1.0 (contact@hamsportal.com)'

export type FetchResult = { status: number; body: string; finalUrl: string }

export async function fetchHtml(url: string, opts: { timeoutMs?: number; retries?: number } = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15000
  const retries = opts.retries ?? 2
  let lastErr: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await request(url, {
        method: 'GET',
        headers: {
          'user-agent': UA,
          'accept': 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
        },
        maxRedirections: 5,
        signal: controller.signal,
      })
      clearTimeout(t)
      const body = await res.body.text()
      return { status: res.statusCode, body, finalUrl: url }
    } catch (err) {
      clearTimeout(t)
      lastErr = err
      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt)
        log.warn('fetch retry', { url, attempt, backoff })
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`fetch failed: ${url}`)
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}
```

- [ ] **Step 5: Verify typecheck**

```powershell
cd C:\XSFA\comp-scraper
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/lib
git commit -m "feat(lib): supabase client, types, fetch, logger"
```

---

### Task 6: Write the three new-table migrations

**Files:**
- Create: `C:\XSFA\comp-scraper\migrations\001-dealers.sql`
- Create: `C:\XSFA\comp-scraper\migrations\001-dealers-rollback.sql`
- Create: `C:\XSFA\comp-scraper\migrations\002-scrape-runs.sql`
- Create: `C:\XSFA\comp-scraper\migrations\002-scrape-runs-rollback.sql`
- Create: `C:\XSFA\comp-scraper\migrations\003-listings-indexes.sql`
- Create: `C:\XSFA\comp-scraper\migrations\003-listings-indexes-rollback.sql`

- [ ] **Step 1: Write `001-dealers.sql`**

```sql
-- Master dealer list. Discovery worker populates and refreshes this weekly.
-- Run in the XSFA comps-db Supabase SQL editor.

CREATE TABLE IF NOT EXISTS dealers (
  id               bigserial PRIMARY KEY,
  domain           text NOT NULL UNIQUE,
  platform         text NOT NULL,
  dealer_name      text,
  city             text,
  state            text,
  zip              text,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  is_active        boolean NOT NULL DEFAULT true,
  miss_count       integer NOT NULL DEFAULT 0,
  notes            text
);

CREATE INDEX IF NOT EXISTS dealers_platform_active_idx
  ON dealers (platform, is_active);
```

- [ ] **Step 2: Write `001-dealers-rollback.sql`**

```sql
DROP INDEX IF EXISTS dealers_platform_active_idx;
DROP TABLE IF EXISTS dealers;
```

- [ ] **Step 3: Write `002-scrape-runs.sql`**

```sql
-- One row per full scrape pass. Primary health signal.
CREATE TABLE IF NOT EXISTS scrape_runs (
  id               bigserial PRIMARY KEY,
  platform         text NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  dealer_count     integer,
  vehicles_seen    integer,
  vehicles_new     integer,
  vehicles_updated integer,
  vehicles_sold    integer,
  errors           integer NOT NULL DEFAULT 0,
  notes            text
);

CREATE INDEX IF NOT EXISTS scrape_runs_started_idx
  ON scrape_runs (started_at DESC);
```

- [ ] **Step 4: Write `002-scrape-runs-rollback.sql`**

```sql
DROP INDEX IF EXISTS scrape_runs_started_idx;
DROP TABLE IF EXISTS scrape_runs;
```

- [ ] **Step 5: Write `003-listings-indexes.sql`**

```sql
-- Indexes for query performance once listings grows past ~10M rows.
-- Idempotent — safe to run on existing databases of any size.

CREATE INDEX IF NOT EXISTS listings_vin_idx
  ON listings (vin) WHERE vin IS NOT NULL;

CREATE INDEX IF NOT EXISTS listings_ymm_idx
  ON listings (year, make, model);

CREATE INDEX IF NOT EXISTS listings_active_idx
  ON listings (is_active, date_last_seen DESC);

CREATE INDEX IF NOT EXISTS listings_state_zip_idx
  ON listings (state, zip);

CREATE INDEX IF NOT EXISTS price_history_listing_idx
  ON price_history (listing_id, date_scraped DESC);
```

- [ ] **Step 6: Write `003-listings-indexes-rollback.sql`**

```sql
DROP INDEX IF EXISTS listings_vin_idx;
DROP INDEX IF EXISTS listings_ymm_idx;
DROP INDEX IF EXISTS listings_active_idx;
DROP INDEX IF EXISTS listings_state_zip_idx;
DROP INDEX IF EXISTS price_history_listing_idx;
```

- [ ] **Step 7: Commit**

```powershell
git add migrations
git commit -m "feat(migrations): dealers, scrape_runs, listings indexes"
```

- [ ] **Step 8: Hand all three migrations to Henry to run**

Tell Henry: "Three migrations are ready in `C:\XSFA\comp-scraper\migrations\`. Run `001-dealers.sql`, `002-scrape-runs.sql`, and `003-listings-indexes.sql` in the XSFA **comps-db** Supabase SQL editor, in order. Each has a matching rollback file. Confirm when done." Wait for confirmation before proceeding to Phase 3.

---

## Phase 3 — Discovery worker

### Task 7: Dealer.com fingerprint detector

**Files:**
- Create: `C:\XSFA\comp-scraper\src\lib\fingerprint.ts`
- Create: `C:\XSFA\comp-scraper\tests\fingerprint.test.ts`
- Create: `C:\XSFA\comp-scraper\tests\fixtures\dealer-com-inventory.html`
- Create: `C:\XSFA\comp-scraper\tests\fixtures\non-dealer-com.html`

- [ ] **Step 1: Write test fixtures**

`tests/fixtures/dealer-com-inventory.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta name="generator" content="Dealer.com, Inc.">
  <script src="https://cdn.dealer.com/widgets/inventory.js"></script>
</head>
<body>
  <script>window.DDC = window.DDC || {}; window.DDC.siteKey = 'examplechevy';</script>
  <div id="inventory"></div>
</body>
</html>
```

`tests/fixtures/non-dealer-com.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta name="generator" content="WordPress 6.4">
</head>
<body>
  <p>Just a regular dealer site.</p>
</body>
</html>
```

- [ ] **Step 2: Write failing test**

`tests/fingerprint.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isDealerCom, fingerprintSignals } from '../src/lib/fingerprint.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('fingerprint', () => {
  it('detects Dealer.com by DDC global + CDN + generator', () => {
    const html = read('dealer-com-inventory.html')
    expect(isDealerCom(html)).toBe(true)
    const sig = fingerprintSignals(html)
    expect(sig.ddcGlobal).toBe(true)
    expect(sig.cdnAsset).toBe(true)
    expect(sig.metaGenerator).toBe(true)
  })

  it('does not match a non-Dealer.com site', () => {
    const html = read('non-dealer-com.html')
    expect(isDealerCom(html)).toBe(false)
  })
})
```

- [ ] **Step 3: Run — expect fail**

```powershell
cd C:\XSFA\comp-scraper
npm test
```
Expected: FAIL — `fingerprint.js` not found.

- [ ] **Step 4: Implement `src/lib/fingerprint.ts`**

```ts
export type FingerprintSignals = {
  ddcGlobal: boolean
  cdnAsset: boolean
  metaGenerator: boolean
  widgetApi: boolean
}

export function fingerprintSignals(html: string): FingerprintSignals {
  const lower = html.toLowerCase()
  return {
    ddcGlobal: /window\.ddc\s*=/i.test(html),
    cdnAsset: /\bcdn\.dealer\.com\b/i.test(html) || /\.dealer\.com\/\w/i.test(html),
    metaGenerator: /<meta\s+[^>]*content=["'][^"']*dealer\.com/i.test(html),
    widgetApi: /\/apiv1\/widget\//i.test(html),
  }
}

export function isDealerCom(html: string): boolean {
  const s = fingerprintSignals(html)
  const hits = [s.ddcGlobal, s.cdnAsset, s.metaGenerator, s.widgetApi].filter(Boolean).length
  return hits >= 2
}
```

- [ ] **Step 5: Run — expect pass**

```powershell
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/fingerprint.ts tests/fingerprint.test.ts tests/fixtures/dealer-com-inventory.html tests/fixtures/non-dealer-com.html
git commit -m "feat(fingerprint): Dealer.com detector + tests"
```

---

### Task 8: Cox Automotive dealer directory crawler

**Files:**
- Create: `C:\XSFA\comp-scraper\src\discovery\cox-directory.ts`

- [ ] **Step 1: Implement the crawler**

```ts
import { parse } from 'node-html-parser'
import { fetchHtml, sleep } from '../lib/fetch.js'
import { log } from '../lib/log.js'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

export type CoxCandidate = {
  domain: string
  dealerName: string | null
  city: string | null
  state: string | null
  zip: string | null
  source: 'cox-directory'
}

// Cox exposes a public dealership locator at
// https://www.dealer.com/dealership-locator/ with per-state result pages.
// Each result card has an outbound link to the dealership's own homepage.
export async function crawlCoxDirectory(): Promise<CoxCandidate[]> {
  const out: CoxCandidate[] = []
  for (const state of US_STATES) {
    const url = `https://www.dealer.com/dealership-locator/?state=${state}`
    try {
      const { status, body } = await fetchHtml(url)
      if (status !== 200) {
        log.warn('cox-directory non-200', { state, status })
        continue
      }
      const root = parse(body)
      // Each result card: look for a[rel="noopener"][href^="http"] whose host
      // is not dealer.com itself.
      const anchors = root.querySelectorAll('a[rel="noopener"]')
      for (const a of anchors) {
        const href = a.getAttribute('href') ?? ''
        if (!/^https?:\/\//.test(href)) continue
        const domain = extractDomain(href)
        if (!domain || /dealer\.com$/i.test(domain)) continue
        const card = a.closest('[class*="card"], [class*="result"]')
        out.push({
          domain,
          dealerName: card?.querySelector('[class*="name"], h3, h4')?.innerText?.trim() ?? null,
          city: card?.querySelector('[class*="city"]')?.innerText?.trim() ?? null,
          state,
          zip: card?.querySelector('[class*="zip"]')?.innerText?.trim() ?? null,
          source: 'cox-directory',
        })
      }
      log.info('cox-directory state done', { state, found: anchors.length })
    } catch (err) {
      log.error('cox-directory state failed', { state, err: String(err) })
    }
    await sleep(1500)  // polite 1.5s between state pages
  }
  return dedupeByDomain(out)
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function dedupeByDomain(list: CoxCandidate[]): CoxCandidate[] {
  const seen = new Set<string>()
  return list.filter((c) => {
    if (seen.has(c.domain)) return false
    seen.add(c.domain)
    return true
  })
}
```

**Note:** If Cox's actual directory structure differs from what's assumed above (selector names, URL format), the engineer should run `npm run discovery` once with `log.debug` enabled, inspect one state page's HTML, and adjust the selectors. Keep the shape of the function the same.

- [ ] **Step 2: Verify typecheck**

```powershell
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/discovery/cox-directory.ts
git commit -m "feat(discovery): Cox Automotive directory crawler"
```

---

### Task 9: Google-dork candidate finder (SerpAPI)

**Files:**
- Create: `C:\XSFA\comp-scraper\src\discovery\google-dork.ts`

- [ ] **Step 1: Implement**

```ts
import { request } from 'undici'
import { log } from '../lib/log.js'

export type DorkCandidate = {
  domain: string
  source: 'google-dork'
}

const QUERIES = [
  '"powered by dealer.com"',
  '"dealer.com" site:.com -site:dealer.com',
  'inurl:"/new-inventory/index.htm"',
  'inurl:"/used-inventory/index.htm"',
]

export async function crawlGoogleDork(): Promise<DorkCandidate[]> {
  const key = process.env.SERPAPI_KEY
  if (!key) {
    log.warn('google-dork skipped — SERPAPI_KEY not set')
    return []
  }
  const out = new Map<string, DorkCandidate>()
  for (const q of QUERIES) {
    for (let page = 0; page < 10; page++) {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&start=${page * 10}&num=10&api_key=${key}`
      try {
        const res = await request(url, { method: 'GET' })
        if (res.statusCode !== 200) {
          log.warn('serpapi non-200', { q, page, status: res.statusCode })
          break
        }
        const json = (await res.body.json()) as { organic_results?: Array<{ link?: string }> }
        const results = json.organic_results ?? []
        if (!results.length) break
        for (const r of results) {
          const domain = extractDomain(r.link ?? '')
          if (!domain || /dealer\.com$/i.test(domain)) continue
          out.set(domain, { domain, source: 'google-dork' })
        }
      } catch (err) {
        log.error('serpapi failed', { q, page, err: String(err) })
        break
      }
    }
  }
  return Array.from(out.values())
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/discovery/google-dork.ts
git commit -m "feat(discovery): google-dork candidate finder via serpapi"
```

---

### Task 10: Candidate verification + persistence

**Files:**
- Create: `C:\XSFA\comp-scraper\src\discovery\verify.ts`

- [ ] **Step 1: Implement**

```ts
import { compsDb } from '../lib/supabase.js'
import { fetchHtml } from '../lib/fetch.js'
import { isDealerCom } from '../lib/fingerprint.js'
import { log } from '../lib/log.js'
import type { DealerRow } from '../lib/types.js'

export type Candidate = {
  domain: string
  dealerName?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  source: string
}

export async function verifyAndPersist(candidates: Candidate[]): Promise<{
  verified: number
  rejected: number
  updated: number
}> {
  let verified = 0
  let rejected = 0
  let updated = 0
  const sb = compsDb()

  for (const c of candidates) {
    const url = `https://${c.domain}/`
    try {
      const { status, body } = await fetchHtml(url, { timeoutMs: 10000 })
      if (status !== 200) {
        rejected++
        continue
      }
      if (!isDealerCom(body)) {
        rejected++
        continue
      }
      // Upsert on domain
      const { data: existing, error: selErr } = await sb
        .from('dealers')
        .select('id, dealer_name, city, state, zip')
        .eq('domain', c.domain)
        .maybeSingle()
      if (selErr) {
        log.error('dealer select failed', { domain: c.domain, err: selErr.message })
        continue
      }
      const now = new Date().toISOString()
      const row: Partial<DealerRow> = {
        domain: c.domain,
        platform: 'dealer_com',
        dealer_name: existing?.dealer_name ?? c.dealerName ?? null,
        city: existing?.city ?? c.city ?? null,
        state: existing?.state ?? c.state ?? null,
        zip: existing?.zip ?? c.zip ?? null,
        last_verified_at: now,
        is_active: true,
        miss_count: 0,
      }
      if (existing) {
        const { error: upErr } = await sb.from('dealers').update(row).eq('id', existing.id)
        if (upErr) {
          log.error('dealer update failed', { domain: c.domain, err: upErr.message })
          continue
        }
        updated++
      } else {
        const { error: insErr } = await sb.from('dealers').insert({ ...row, first_seen_at: now })
        if (insErr) {
          log.error('dealer insert failed', { domain: c.domain, err: insErr.message })
          continue
        }
        verified++
      }
    } catch (err) {
      log.warn('verify fetch failed', { domain: c.domain, err: String(err) })
      rejected++
    }
    await new Promise((r) => setTimeout(r, 500))  // 2 req/sec cap
  }
  return { verified, rejected, updated }
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/discovery/verify.ts
git commit -m "feat(discovery): candidate verification + dealers upsert"
```

---

### Task 11: Discovery CLI entry point

**Files:**
- Create: `C:\XSFA\comp-scraper\src\discovery\main.ts`

- [ ] **Step 1: Implement**

```ts
import 'dotenv/config'
import { crawlCoxDirectory } from './cox-directory.js'
import { crawlGoogleDork } from './google-dork.js'
import { verifyAndPersist, type Candidate } from './verify.js'
import { log } from '../lib/log.js'

async function main(): Promise<void> {
  log.info('discovery started')
  const t0 = Date.now()

  const [cox, dork] = await Promise.all([crawlCoxDirectory(), crawlGoogleDork()])
  log.info('candidate pools', { cox: cox.length, dork: dork.length })

  const merged = new Map<string, Candidate>()
  for (const c of cox) merged.set(c.domain, c)
  for (const c of dork) {
    if (!merged.has(c.domain)) merged.set(c.domain, c)
  }
  const candidates = Array.from(merged.values())
  log.info('candidates merged', { total: candidates.length })

  const result = await verifyAndPersist(candidates)
  log.info('discovery done', {
    elapsedMs: Date.now() - t0,
    candidates: candidates.length,
    ...result,
  })
}

main().catch((err) => {
  log.error('discovery crashed', { err: String(err) })
  process.exit(1)
})
```

- [ ] **Step 2: Add `dotenv` dependency**

```powershell
cd C:\XSFA\comp-scraper
npm install dotenv
```

- [ ] **Step 3: Verify build**

```powershell
npm run build
```
Expected: no errors, `dist/discovery/main.js` exists.

- [ ] **Step 4: Commit**

```powershell
git add src/discovery/main.ts package.json package-lock.json
git commit -m "feat(discovery): CLI entry point"
```

---

## Phase 4 — Scrape worker

### Task 12: JSON-LD Vehicle extractor

**Files:**
- Create: `C:\XSFA\comp-scraper\src\lib\jsonld.ts`
- Create: `C:\XSFA\comp-scraper\tests\jsonld.test.ts`
- Create: `C:\XSFA\comp-scraper\tests\fixtures\dealer-com-vdp.html`

- [ ] **Step 1: Fixture**

`tests/fixtures/dealer-com-vdp.html`:
```html
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Vehicle",
  "vehicleIdentificationNumber": "1HGCM82633A004352",
  "modelDate": "2019",
  "brand": {"@type": "Brand", "name": "Honda"},
  "model": "Accord",
  "vehicleConfiguration": "Sport",
  "mileageFromOdometer": {"@type": "QuantitativeValue", "value": 42500},
  "offers": {"@type": "Offer", "price": 23995, "priceCurrency": "USD"},
  "image": ["https://cdn.dealer.com/vehicles/1.jpg", "https://cdn.dealer.com/vehicles/2.jpg"],
  "vehicleTransmission": "Automatic",
  "driveWheelConfiguration": "FrontWheelDriveConfiguration",
  "fuelType": "Gasoline",
  "vehicleEngine": {"@type": "EngineSpecification", "name": "2.4L I4"}
}
</script>
</head>
<body><h1>2019 Honda Accord Sport</h1></body>
</html>
```

- [ ] **Step 2: Failing test**

`tests/jsonld.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractVehicles } from '../src/lib/jsonld.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('jsonld', () => {
  it('extracts a Vehicle block from a Dealer.com VDP', () => {
    const html = read('dealer-com-vdp.html')
    const vehicles = extractVehicles(html)
    expect(vehicles).toHaveLength(1)
    const v = vehicles[0]!
    expect(v.vin).toBe('1HGCM82633A004352')
    expect(v.year).toBe(2019)
    expect(v.make).toBe('Honda')
    expect(v.model).toBe('Accord')
    expect(v.trim).toBe('Sport')
    expect(v.mileage).toBe(42500)
    expect(v.price).toBe(23995)
    expect(v.transmission).toBe('Automatic')
    expect(v.drivetrain).toBe('FWD')
    expect(v.fuel).toBe('Gasoline')
    expect(v.engineSummary).toBe('2.4L I4')
    expect(v.photoUrl).toBe('https://cdn.dealer.com/vehicles/1.jpg')
  })
})
```

- [ ] **Step 3: Run — expect fail**

```powershell
npm test
```
Expected: FAIL — `jsonld.js` not found.

- [ ] **Step 4: Implement `src/lib/jsonld.ts`**

```ts
import { parse } from 'node-html-parser'

export type ExtractedVehicle = {
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  mileage: number | null
  price: number | null
  transmission: string | null
  drivetrain: string | null
  fuel: string | null
  engineSummary: string | null
  photoUrl: string | null
}

function normalizeDrivetrain(raw: string | null | undefined): string | null {
  if (!raw) return null
  const r = raw.toLowerCase()
  if (/four|all/i.test(raw)) return 'AWD'
  if (/front/i.test(r)) return 'FWD'
  if (/rear/i.test(r)) return 'RWD'
  return raw
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return asNumber((v as Record<string, unknown>).value)
  }
  return null
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (v && typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return asString((v as Record<string, unknown>).name)
  }
  return null
}

function parseOne(obj: Record<string, unknown>): ExtractedVehicle | null {
  const type = obj['@type']
  if (type !== 'Vehicle' && !(Array.isArray(type) && type.includes('Vehicle'))) return null
  const offers = obj.offers as Record<string, unknown> | undefined
  const image = obj.image
  const photoUrl = Array.isArray(image) ? asString(image[0]) : asString(image)
  return {
    vin: asString(obj.vehicleIdentificationNumber),
    year: asNumber(obj.modelDate ?? obj.productionDate ?? obj.vehicleModelDate),
    make: asString(obj.brand) ?? asString(obj.manufacturer),
    model: asString(obj.model),
    trim: asString(obj.vehicleConfiguration ?? obj.trim),
    mileage: asNumber(obj.mileageFromOdometer),
    price: asNumber(offers?.price),
    transmission: asString(obj.vehicleTransmission),
    drivetrain: normalizeDrivetrain(asString(obj.driveWheelConfiguration)),
    fuel: asString(obj.fuelType),
    engineSummary: asString(obj.vehicleEngine),
    photoUrl,
  }
}

export function extractVehicles(html: string): ExtractedVehicle[] {
  const root = parse(html)
  const scripts = root.querySelectorAll('script[type="application/ld+json"]')
  const out: ExtractedVehicle[] = []
  for (const s of scripts) {
    const text = s.innerText.trim()
    if (!text) continue
    try {
      const json = JSON.parse(text)
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const v = parseOne(item as Record<string, unknown>)
        if (v && v.vin) out.push(v)
        // Dealer.com sometimes nests Vehicle inside @graph
        const graph = (item as Record<string, unknown>)['@graph']
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (g && typeof g === 'object') {
              const gv = parseOne(g as Record<string, unknown>)
              if (gv && gv.vin) out.push(gv)
            }
          }
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  }
  return out
}
```

- [ ] **Step 5: Run — expect pass**

```powershell
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/jsonld.ts tests/jsonld.test.ts tests/fixtures/dealer-com-vdp.html
git commit -m "feat(jsonld): Vehicle schema extractor + tests"
```

---

### Task 13: Fetch one dealer's full inventory with pagination

**Files:**
- Create: `C:\XSFA\comp-scraper\src\scrape\fetch-inventory.ts`

- [ ] **Step 1: Implement**

```ts
import { fetchHtml, sleep } from '../lib/fetch.js'
import { extractVehicles, type ExtractedVehicle } from '../lib/jsonld.js'
import { log } from '../lib/log.js'

export type DealerInventoryVehicle = ExtractedVehicle & { listingUrl: string }

const PAGE_SIZE = 24
const MAX_PAGES = 50  // 1,200 vehicles ceiling per dealer per lot type

async function fetchLot(domain: string, lot: 'new' | 'used'): Promise<DealerInventoryVehicle[]> {
  const found: DealerInventoryVehicle[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE
    const url = `https://${domain}/${lot}-inventory/index.htm?start=${start}&count=${PAGE_SIZE}`
    try {
      const { status, body } = await fetchHtml(url, { timeoutMs: 20000 })
      if (status === 404) break
      if (status !== 200) {
        log.warn('inventory non-200', { domain, lot, page, status })
        break
      }
      const vehicles = extractVehicles(body)
      if (!vehicles.length) break
      // VDP URLs appear as <a href="...vehicle-details..."> wrapping each card.
      // JSON-LD rarely includes the per-vehicle URL on inventory listing pages,
      // so synthesize one with VIN. If a VIN-based pattern breaks for a given
      // dealer we can later follow the card anchor instead.
      for (const v of vehicles) {
        if (!v.vin) continue
        const listingUrl = `https://${domain}/${lot}/${v.vin}.htm`
        found.push({ ...v, listingUrl })
      }
      if (vehicles.length < PAGE_SIZE) break
      await sleep(500)  // 2 req/sec per dealer
    } catch (err) {
      log.warn('inventory fetch failed', { domain, lot, page, err: String(err) })
      break
    }
  }
  return found
}

export async function fetchDealerInventory(domain: string): Promise<DealerInventoryVehicle[]> {
  const [newLot, usedLot] = await Promise.all([
    fetchLot(domain, 'new'),
    fetchLot(domain, 'used'),
  ])
  // Dedupe by VIN
  const byVin = new Map<string, DealerInventoryVehicle>()
  for (const v of [...newLot, ...usedLot]) {
    if (v.vin && !byVin.has(v.vin)) byVin.set(v.vin, v)
  }
  return Array.from(byVin.values())
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/scrape/fetch-inventory.ts
git commit -m "feat(scrape): fetch one dealer's full inventory with pagination"
```

---

### Task 14: Convert extracted vehicles to `ListingInsert` rows

**Files:**
- Create: `C:\XSFA\comp-scraper\src\scrape\parse-vehicle.ts`

- [ ] **Step 1: Implement**

```ts
import type { DealerRow, ListingInsert } from '../lib/types.js'
import type { DealerInventoryVehicle } from './fetch-inventory.js'

export function toListingInsert(
  v: DealerInventoryVehicle,
  dealer: DealerRow,
  nowIso: string,
): ListingInsert | null {
  if (!v.vin || !v.listingUrl) return null
  return {
    listing_url: v.listingUrl,
    data_provider: 'scrape',
    vin: v.vin,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    mileage: v.mileage,
    price: v.price,
    city: dealer.city,
    state: dealer.state,
    zip: dealer.zip,
    dealer_name: dealer.dealer_name,
    dealer_phone: null,
    photo_url: v.photoUrl,
    transmission: v.transmission,
    drivetrain: v.drivetrain,
    fuel: v.fuel,
    engine_summary: v.engineSummary,
    is_dealer: true,
    is_active: true,
    date_listed: null,
    prior_accident: null,
    prior_owner_count: null,
    date_first_scraped: nowIso,
    date_last_seen: nowIso,
    miss_count: 0,
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/scrape/parse-vehicle.ts
git commit -m "feat(scrape): map ExtractedVehicle to ListingInsert"
```

---

### Task 15: Batch upsert into listings + price_history

**Files:**
- Create: `C:\XSFA\comp-scraper\src\scrape\upsert.ts`

- [ ] **Step 1: Implement**

```ts
import { compsDb } from '../lib/supabase.js'
import { log } from '../lib/log.js'
import type { ListingInsert } from '../lib/types.js'

export type UpsertStats = { seen: number; inserted: number; updated: number }

const BATCH_SIZE = 100

export async function upsertListings(rows: ListingInsert[]): Promise<UpsertStats> {
  const sb = compsDb()
  const stats: UpsertStats = { seen: rows.length, inserted: 0, updated: 0 }
  if (!rows.length) return stats

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const urls = batch.map((r) => r.listing_url)

    // Read existing to differentiate insert vs update + detect price changes.
    const { data: existing, error: selErr } = await sb
      .from('listings')
      .select('id, listing_url, price, date_first_scraped')
      .in('listing_url', urls)
    if (selErr) {
      log.error('upsert select failed', { err: selErr.message })
      continue
    }
    const prev = new Map<string, { id: number; price: number | null; date_first_scraped: string }>(
      (existing ?? []).map((r) => [r.listing_url, r as never]),
    )

    const toUpsert = batch.map((r) => {
      const p = prev.get(r.listing_url)
      return p ? { ...r, date_first_scraped: p.date_first_scraped } : r
    })

    const { data: upserted, error: upErr } = await sb
      .from('listings')
      .upsert(toUpsert, { onConflict: 'listing_url' })
      .select('id, listing_url, price')
    if (upErr) {
      log.error('upsert failed', { err: upErr.message })
      continue
    }

    const upById = new Map<string, { id: number; price: number | null }>(
      (upserted ?? []).map((r) => [r.listing_url, r as never]),
    )

    const todayDate = new Date().toISOString().slice(0, 10)
    const historyRows: { listing_id: number; price: number; date_scraped: string }[] = []
    for (const r of batch) {
      const after = upById.get(r.listing_url)
      if (!after || r.price == null) continue
      const p = prev.get(r.listing_url)
      if (!p) {
        stats.inserted++
        historyRows.push({ listing_id: after.id, price: r.price, date_scraped: todayDate })
      } else {
        stats.updated++
        if (p.price !== r.price) {
          historyRows.push({ listing_id: after.id, price: r.price, date_scraped: todayDate })
        }
      }
    }

    if (historyRows.length) {
      const { error: phErr } = await sb.from('price_history').insert(historyRows)
      if (phErr) log.error('price_history insert failed', { err: phErr.message })
    }
  }
  return stats
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/scrape/upsert.ts
git commit -m "feat(scrape): batch upsert with change-only price_history"
```

---

### Task 16: Sold detection sweep

**Files:**
- Create: `C:\XSFA\comp-scraper\src\scrape\sold-sweep.ts`

- [ ] **Step 1: Implement**

```ts
import { compsDb } from '../lib/supabase.js'
import { log } from '../lib/log.js'

/**
 * Flip is_active=false on listings we haven't seen in 3+ days.
 * Rows stay in the DB forever — this is a permanent archive.
 * Returns the count of newly-deactivated rows.
 */
export async function soldSweep(): Promise<number> {
  const sb = compsDb()
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error, count } = await sb
    .from('listings')
    .update({ is_active: false })
    .lt('date_last_seen', cutoff)
    .eq('is_active', true)
    .select('id', { count: 'exact', head: true })
  if (error) {
    log.error('sold sweep failed', { err: error.message })
    return 0
  }
  log.info('sold sweep done', { deactivated: count ?? 0, data: data?.length })
  return count ?? 0
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/scrape/sold-sweep.ts
git commit -m "feat(scrape): 3-day inactive sold sweep"
```

---

### Task 17: Main scrape loop

**Files:**
- Create: `C:\XSFA\comp-scraper\src\scrape\main.ts`

- [ ] **Step 1: Implement**

```ts
import 'dotenv/config'
import { compsDb } from '../lib/supabase.js'
import { fetchDealerInventory } from './fetch-inventory.js'
import { toListingInsert } from './parse-vehicle.js'
import { upsertListings } from './upsert.js'
import { soldSweep } from './sold-sweep.js'
import { log } from '../lib/log.js'
import { sleep } from '../lib/fetch.js'
import type { DealerRow, ListingInsert, ScrapeRunRow } from '../lib/types.js'

const MISS_DEACTIVATE_THRESHOLD = 7
const PAUSE_BETWEEN_DEALERS_MS = 500
const PAUSE_BETWEEN_PASSES_MS = 60 * 60 * 1000  // 1h between passes

async function loadActiveDealers(): Promise<DealerRow[]> {
  const sb = compsDb()
  const { data, error } = await sb
    .from('dealers')
    .select('*')
    .eq('platform', 'dealer_com')
    .eq('is_active', true)
    .order('id', { ascending: true })
  if (error) throw new Error(`loadActiveDealers: ${error.message}`)
  return (data ?? []) as DealerRow[]
}

async function recordRunStart(dealerCount: number): Promise<number> {
  const sb = compsDb()
  const row: ScrapeRunRow = {
    platform: 'dealer_com',
    started_at: new Date().toISOString(),
    finished_at: null,
    dealer_count: dealerCount,
    vehicles_seen: 0,
    vehicles_new: 0,
    vehicles_updated: 0,
    vehicles_sold: 0,
    errors: 0,
    notes: null,
  }
  const { data, error } = await sb.from('scrape_runs').insert(row).select('id').single()
  if (error || !data) throw new Error(`recordRunStart: ${error?.message}`)
  return data.id
}

async function recordRunFinish(
  id: number,
  stats: { seen: number; inserted: number; updated: number; sold: number; errors: number },
): Promise<void> {
  const sb = compsDb()
  const { error } = await sb
    .from('scrape_runs')
    .update({
      finished_at: new Date().toISOString(),
      vehicles_seen: stats.seen,
      vehicles_new: stats.inserted,
      vehicles_updated: stats.updated,
      vehicles_sold: stats.sold,
      errors: stats.errors,
    })
    .eq('id', id)
  if (error) log.error('recordRunFinish failed', { err: error.message })
}

async function bumpDealerMiss(dealerId: number, note: string): Promise<void> {
  const sb = compsDb()
  const { data, error } = await sb
    .from('dealers')
    .select('miss_count')
    .eq('id', dealerId)
    .single()
  if (error || !data) return
  const next = data.miss_count + 1
  const patch: Record<string, unknown> = { miss_count: next, notes: note }
  if (next >= MISS_DEACTIVATE_THRESHOLD) patch.is_active = false
  await sb.from('dealers').update(patch).eq('id', dealerId)
}

async function clearDealerMiss(dealerId: number): Promise<void> {
  const sb = compsDb()
  await sb
    .from('dealers')
    .update({ miss_count: 0, last_verified_at: new Date().toISOString() })
    .eq('id', dealerId)
}

async function runOnePass(): Promise<void> {
  const dealers = await loadActiveDealers()
  log.info('pass start', { dealers: dealers.length })
  const runId = await recordRunStart(dealers.length)
  const nowIso = new Date().toISOString()
  const totals = { seen: 0, inserted: 0, updated: 0, sold: 0, errors: 0 }

  for (const d of dealers) {
    try {
      const vehicles = await fetchDealerInventory(d.domain)
      const rows: ListingInsert[] = []
      for (const v of vehicles) {
        const row = toListingInsert(v, d, nowIso)
        if (row) rows.push(row)
      }
      const stats = await upsertListings(rows)
      totals.seen += stats.seen
      totals.inserted += stats.inserted
      totals.updated += stats.updated
      if (stats.seen === 0) {
        await bumpDealerMiss(d.id, 'empty inventory')
      } else {
        await clearDealerMiss(d.id)
      }
      log.info('dealer done', { domain: d.domain, ...stats })
    } catch (err) {
      totals.errors++
      await bumpDealerMiss(d.id, `error: ${String(err).slice(0, 200)}`)
      log.error('dealer failed', { domain: d.domain, err: String(err) })
    }
    await sleep(PAUSE_BETWEEN_DEALERS_MS)
  }

  totals.sold = await soldSweep()
  await recordRunFinish(runId, totals)
  log.info('pass done', { runId, ...totals })
}

async function mainLoop(): Promise<void> {
  log.info('scrape-worker started')
  while (true) {
    try {
      await runOnePass()
    } catch (err) {
      log.error('pass crashed', { err: String(err) })
    }
    await sleep(PAUSE_BETWEEN_PASSES_MS)
  }
}

mainLoop().catch((err) => {
  log.error('mainLoop crashed', { err: String(err) })
  process.exit(1)
})
```

- [ ] **Step 2: Verify build**

```powershell
cd C:\XSFA\comp-scraper
npm run build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/scrape/main.ts
git commit -m "feat(scrape): main continuous loop + run logging"
```

---

## Phase 5 — Deployment

### Task 18: Daily health-email script

**Files:**
- Create: `C:\XSFA\comp-scraper\src\ops\health-email.ts`

- [ ] **Step 1: Implement**

```ts
import 'dotenv/config'
import { compsDb } from '../lib/supabase.js'
import { log } from '../lib/log.js'
import { request } from 'undici'

type RunRow = {
  started_at: string
  finished_at: string | null
  vehicles_seen: number
  vehicles_new: number
  vehicles_updated: number
  vehicles_sold: number
  errors: number
  dealer_count: number
}

async function recentRuns(hours: number): Promise<RunRow[]> {
  const sb = compsDb()
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const { data, error } = await sb
    .from('scrape_runs')
    .select('started_at, finished_at, vehicles_seen, vehicles_new, vehicles_updated, vehicles_sold, errors, dealer_count')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
  if (error) throw new Error(`recentRuns: ${error.message}`)
  return (data ?? []) as RunRow[]
}

async function sendEmail(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.HEALTH_EMAIL_FROM ?? 'scraper@hamsportal.com'
  const to = process.env.HEALTH_EMAIL_TO ?? 'xsfabot@gmail.com'
  if (!key) {
    log.warn('health email skipped — RESEND_API_KEY not set', { subject })
    console.log(text)
    return
  }
  const res = await request('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (res.statusCode >= 300) {
    const body = await res.body.text()
    throw new Error(`resend ${res.statusCode}: ${body}`)
  }
}

async function main(): Promise<void> {
  const runs24 = await recentRuns(24)
  const runs7d = await recentRuns(24 * 7)

  const sumSeen24 = runs24.reduce((a, r) => a + (r.vehicles_seen ?? 0), 0)
  const avgSeen7d = runs7d.length ? runs7d.reduce((a, r) => a + (r.vehicles_seen ?? 0), 0) / runs7d.length : 0
  const sumErr24 = runs24.reduce((a, r) => a + (r.errors ?? 0), 0)
  const dealerCount = runs24[0]?.dealer_count ?? 0

  const alerts: string[] = []
  if (runs24.length === 0) alerts.push('CRITICAL: zero scrape runs completed in last 24h')
  if (dealerCount > 0 && sumErr24 > dealerCount * 0.1) {
    alerts.push(`WARN: errors (${sumErr24}) exceed 10% of dealers (${dealerCount}) in last 24h`)
  }
  if (avgSeen7d > 0 && sumSeen24 < avgSeen7d * 0.7) {
    alerts.push(`WARN: 24h vehicles_seen (${sumSeen24}) is <70% of 7d avg (${Math.round(avgSeen7d)})`)
  }

  const subject = alerts.length ? `[comp-scraper] ALERT — ${alerts.length} issue(s)` : `[comp-scraper] OK — 24h summary`
  const lines = [
    `Runs completed (24h): ${runs24.length}`,
    `Dealers scraped last pass: ${dealerCount}`,
    `Vehicles seen (24h): ${sumSeen24}`,
    `Vehicles new (24h): ${runs24.reduce((a, r) => a + (r.vehicles_new ?? 0), 0)}`,
    `Vehicles updated (24h): ${runs24.reduce((a, r) => a + (r.vehicles_updated ?? 0), 0)}`,
    `Vehicles marked sold (24h): ${runs24.reduce((a, r) => a + (r.vehicles_sold ?? 0), 0)}`,
    `Errors (24h): ${sumErr24}`,
    `7d avg vehicles_seen/run: ${Math.round(avgSeen7d)}`,
    '',
    ...alerts,
  ]

  await sendEmail(subject, lines.join('\n'))
  log.info('health email sent', { subject, alerts: alerts.length })
}

main().catch((err) => {
  log.error('health email crashed', { err: String(err) })
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```powershell
git add src/ops/health-email.ts
git commit -m "feat(ops): daily health email digest"
```

---

### Task 19: systemd units + install script

**Files:**
- Create: `C:\XSFA\comp-scraper\deploy\scraper.service`
- Create: `C:\XSFA\comp-scraper\deploy\discovery.service`
- Create: `C:\XSFA\comp-scraper\deploy\discovery.timer`
- Create: `C:\XSFA\comp-scraper\deploy\health.service`
- Create: `C:\XSFA\comp-scraper\deploy\health.timer`
- Create: `C:\XSFA\comp-scraper\deploy\install.sh`

- [ ] **Step 1: `scraper.service`**

```ini
[Unit]
Description=comp-scraper continuous worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=scraper
WorkingDirectory=/opt/comp-scraper
EnvironmentFile=/opt/comp-scraper/.env
ExecStart=/usr/bin/node /opt/comp-scraper/dist/scrape/main.js
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: `discovery.service` + `discovery.timer`**

`discovery.service`:
```ini
[Unit]
Description=comp-scraper discovery one-shot
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=scraper
WorkingDirectory=/opt/comp-scraper
EnvironmentFile=/opt/comp-scraper/.env
ExecStart=/usr/bin/node /opt/comp-scraper/dist/discovery/main.js
StandardOutput=journal
StandardError=journal
```

`discovery.timer`:
```ini
[Unit]
Description=comp-scraper discovery weekly timer

[Timer]
OnCalendar=Sun 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: `health.service` + `health.timer`**

`health.service`:
```ini
[Unit]
Description=comp-scraper daily health email
After=network-online.target

[Service]
Type=oneshot
User=scraper
WorkingDirectory=/opt/comp-scraper
EnvironmentFile=/opt/comp-scraper/.env
ExecStart=/usr/bin/node /opt/comp-scraper/dist/ops/health-email.js
StandardOutput=journal
StandardError=journal
```

`health.timer`:
```ini
[Unit]
Description=comp-scraper daily health email timer

[Timer]
OnCalendar=*-*-* 11:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

(11:00 UTC = 7am ET)

- [ ] **Step 4: `install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# One-shot installer. Run as root on a fresh Ubuntu 22.04 VPS.
#
# Usage:
#   sudo bash deploy/install.sh
#
# Assumes:
#   - Repo cloned to /opt/comp-scraper
#   - /opt/comp-scraper/.env exists with COMPS_DB_URL / COMPS_DB_SERVICE_KEY etc.

if [[ $EUID -ne 0 ]]; then
  echo "Run as root"; exit 1
fi

APP_DIR=/opt/comp-scraper

# 1. Node.js 20
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 2. User
if ! id scraper >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir $APP_DIR scraper
fi

# 3. Build
cd $APP_DIR
sudo -u scraper npm install --omit=dev
sudo -u scraper npm install  # need dev deps for tsc
sudo -u scraper npm run build

# 4. Permissions
chown -R scraper:scraper $APP_DIR
chmod 600 $APP_DIR/.env

# 5. systemd units
cp deploy/scraper.service   /etc/systemd/system/comp-scraper.service
cp deploy/discovery.service /etc/systemd/system/comp-scraper-discovery.service
cp deploy/discovery.timer   /etc/systemd/system/comp-scraper-discovery.timer
cp deploy/health.service    /etc/systemd/system/comp-scraper-health.service
cp deploy/health.timer      /etc/systemd/system/comp-scraper-health.timer

systemctl daemon-reload
systemctl enable --now comp-scraper.service
systemctl enable --now comp-scraper-discovery.timer
systemctl enable --now comp-scraper-health.timer

echo "Installed. Follow logs: journalctl -u comp-scraper -f"
```

- [ ] **Step 5: Mark install.sh executable**

```powershell
# Windows side: nothing to do — chmod +x happens on the VPS.
# But add a note in the file header so no one gets confused.
```

- [ ] **Step 6: Commit**

```powershell
git add deploy
git commit -m "feat(deploy): systemd units + install script"
```

---

### Task 20: Deploy to Hostinger VPS

- [ ] **Step 1: Push repo to a remote**

Henry picks GitHub or a bare repo on the VPS. Easiest: create private GitHub repo `xsfabot-boop/comp-scraper`, push.

```powershell
cd C:\XSFA\comp-scraper
gh repo create xsfabot-boop/comp-scraper --private --source . --remote origin --push
```

- [ ] **Step 2: SSH to VPS, clone, configure .env**

```bash
ssh root@<vps-ip>
cd /opt
git clone https://github.com/xsfabot-boop/comp-scraper.git
cd comp-scraper
cp .env.example .env
nano .env   # paste COMPS_DB_URL, COMPS_DB_SERVICE_KEY from HamsPortal .env.local
```

- [ ] **Step 3: Run install.sh**

```bash
cd /opt/comp-scraper
sudo bash deploy/install.sh
```

Expected: `comp-scraper.service` running, `*-discovery.timer` and `*-health.timer` enabled.

- [ ] **Step 4: Trigger discovery immediately (don't wait for Sunday)**

```bash
sudo systemctl start comp-scraper-discovery.service
journalctl -u comp-scraper-discovery.service -f
```

Expected: dealers populated. Query:
```sql
SELECT COUNT(*) FROM dealers WHERE platform = 'dealer_com' AND is_active = true;
```
Expected result: hundreds-to-thousands of rows.

- [ ] **Step 5: Watch first scrape pass**

```bash
journalctl -u comp-scraper -f
```

Expected: `pass start` log, per-dealer success/failure, `pass done` after full loop. First `scrape_runs` row visible in Supabase.

- [ ] **Step 6: Trigger health email once**

```bash
sudo systemctl start comp-scraper-health.service
journalctl -u comp-scraper-health.service -n 50
```

Expected: email arrives at `HEALTH_EMAIL_TO`.

- [ ] **Step 7: Report to Henry**

Message Henry:
> Deployed. Live services:
> - `comp-scraper.service` — continuous scrape loop
> - `comp-scraper-discovery.timer` — weekly Sunday 3am UTC
> - `comp-scraper-health.timer` — daily 11am UTC (7am ET)
>
> First pass is in progress. Watch logs: `ssh root@<vps-ip> 'journalctl -u comp-scraper -f'`.
>
> Health email will arrive tomorrow at 7am ET with the 24h summary.
>
> Supabase check: `SELECT COUNT(*), SUM(vehicles_new), SUM(vehicles_updated) FROM scrape_runs WHERE started_at > now() - interval '24h'`.

---

## Phase 6 — Follow-ups (not blocking v1)

These are explicitly NOT in v1. Mentioned so the next engineer doesn't rebuild them in a different style when the time comes.

- **Playwright fallback adapter** — v2. For dealers that bot-block Tier 1.
- **Multi-platform support** — v2 or v3. DealerInspire, DealerSocket. Discovery and scrape adapters per platform; shared upsert.
- **Admin dashboard** — v2. Right now observability is logs + daily email.
- **CarGurus / AutoTrader cross-reference** — v2 discovery source. Adds dealers who don't show up in Cox's directory.

---

## Self-review notes

**Spec coverage:**
- §1 goal → Phase 1–5 collectively
- §2 math — informational, no task
- §3 architecture — Phase 2–5
- §4 discovery (fingerprint, Cox, dork, verify, refresh cadence) → Tasks 7–11
- §5 scrape worker (loop, fetch, dedup, sold sweep, scrape_runs) → Tasks 12–17
- §5.5 drop `source` → Tasks 1–3
- §6 column list → Task 14 (`toListingInsert`)
- §7 env setup → Task 4 (`.env.example`) + Task 20 (configure on VPS)
- §8 legal posture (robots.txt) → **NOT YET IMPLEMENTED** — add in v2 if any dealer complains, or add now as Task 11.5. For v1 we ship with honest UA + 2 req/sec and skip robots.txt parsing. Design §8 says we read robots.txt; I'm consciously descoping this to ship v1 faster. Flagging explicitly.
- §8.5 storage projection — informational, no task
- §9 observability → Task 18 (health email) + systemd journal (free)
- §10 scope boundaries — followed throughout
- §11 rollout plan — matches Phase 1–5 ordering

**Placeholder scan:** no TODO/TBD. Every code block is complete.

**Type consistency:** `DealerRow`, `ListingInsert`, `ScrapeRunRow`, `ExtractedVehicle`, `DealerInventoryVehicle` used consistently. `toListingInsert` returns `ListingInsert | null`. `upsertListings` consumes `ListingInsert[]`. All match.

**Known descope from spec:** robots.txt. Explicit choice to ship without it; design §8 called it out. If Henry wants it in v1, insert a Task 11.5 that fetches `https://${domain}/robots.txt`, parses with a small User-agent/* Disallow matcher, and sets `is_active=false` + `notes='robots.txt disallow'` on any dealer that disallows the root path.
