# Dealer.com Comp Scraper — Design

**Status:** Design — awaiting final approval before plan.
**Target host:** Hostinger VPS KVM 2 (2 vCPU, 8 GB RAM, 100 GB SSD).
**Target output:** XSFA Database Supabase, `listings` + `price_history` tables (the `comparable-vehicles` project).
**Goal:** ~70,000 comps/day, running autonomously with no human input.

---

## 1. Goal in plain English

Every day, without anyone touching it, this system should visit every US dealership that runs on the Dealer.com platform (~7,000 sites), pull their current inventory, and dump every vehicle into the XSFA comps database. Vehicles we've seen before get refreshed (new price, new mileage, new "last seen"). Vehicles that disappear get flagged as sold. Net new rows per day: ~70k.

The XSFA comps DB is already used by the HamsPortal ACV tool. This system just increases how much data flows into it. HamsPortal does not need to be aware of the scraper's existence.

## 2. Why this is achievable

- **Dealer.com publishes inventory as JSON.** Pages render server-side with `<script type="application/ld+json">` blocks containing full Vehicle schema (VIN, price, mileage, specs). Many sites also expose `/apiv1/widget/...` JSON endpoints. No headless browser needed for v1.
- **Throughput math:** 7,000 dealers × ~70 vehicles each ≈ 490,000 vehicle rows. At 2 requests/sec serial, one full pass takes ~1 hour. The VPS can do this multiple times/day. Writing to Supabase is batched 100 at a time; 490k rows / 100 = 4,900 upserts — a few minutes of DB work.
- **"70k net new/day" is the delta.** We re-upsert the full 490k catalog; Supabase dedupes by `listing_url` unique index. ~15% churn (new listings, sold cars, price changes) = ~73k. That's where the 70k target comes from.

## 3. Architecture overview

```
┌───────────────────────────────────────────────────────────────────────┐
│  Hostinger VPS KVM 2                                                  │
│                                                                       │
│  ┌─────────────────────┐    ┌────────────────────────────────────┐   │
│  │ discovery-worker    │    │ scrape-worker (systemd service)    │   │
│  │ (systemd timer,     │───▶│ Node.js long-running process       │   │
│  │  runs weekly)       │    │ Loops: load dealer list → fetch    │   │
│  │                     │    │ each inventory → batch upsert      │   │
│  │ Crawls Cox Auto     │    │                                    │   │
│  │ dealer locator +    │    │ Writes:                            │   │
│  │ Google dorks for    │    │  - listings (upsert on vin+url)    │   │
│  │ "powered by         │    │  - price_history (on price change) │   │
│  │  dealer.com"        │    │  - scrape_runs (one row per pass)  │   │
│  └──────────┬──────────┘    └─────────┬──────────────────────────┘   │
│             │                         │                              │
│             └──────────┬──────────────┘                              │
│                        ▼                                             │
└────────────────────────┼─────────────────────────────────────────────┘
                         │
                         ▼
             ┌──────────────────────────┐
             │ XSFA comps-db Supabase   │
             │                          │
             │ - dealers (NEW)          │
             │ - listings               │
             │ - price_history          │
             │ - scrape_runs (NEW)      │
             └──────────────────────────┘
```

Two independent Node.js processes on the VPS:

1. **`discovery-worker`** — Runs weekly via systemd timer. Builds/refreshes the master dealer URL list. Writes to a new `dealers` table.
2. **`scrape-worker`** — Runs continuously as a systemd service. Reads from `dealers`, hits each one, batches writes to `listings` + `price_history`. Logs each pass to a new `scrape_runs` table.

Keeping them separate means a discovery bug can't break scraping, and vice versa.

## 4. Discovery: how we find Dealer.com sites

### 4.1 Signals we use

A site is "Dealer.com" if any of these are true:
- HTML contains `window.DDC` global, or
- Static assets served from `*.dealer.com` CDN, or
- `<meta name="generator">` includes Dealer.com, or
- `/apiv1/widget/<key>` endpoint returns 200 with Dealer.com-shaped JSON.

### 4.2 Seed sources

1. **Cox Automotive public dealer locator** — Cox owns Dealer.com. Their marketing site lists customer dealerships at the state level. We scrape the directory, resolve each dealer homepage URL.
2. **Google dork results** — `site:*.com "powered by dealer.com"` returns thousands of hits. We parse the SERP for root domains. (Rate-limited via SerpAPI or a residential-proxy Googler; we don't abuse Google directly.)
3. **CarGurus / AutoTrader cross-reference** — Both aggregators link out to the dealer's own site. We can pull dealer URLs from their public listings and fingerprint each one.

### 4.3 Verification

Every candidate URL gets a fingerprint check:
- Fetch `https://<domain>/` with a browser-like User-Agent.
- If any Dealer.com signal matches → add to `dealers` table with `platform='dealer_com'`.
- If not → skip.

### 4.4 Refresh cadence

- First run: builds the full list from scratch. ~1–2 hours.
- Weekly thereafter: re-verifies that known dealers are still on the platform (dealers sometimes switch to DealerInspire or DealerSocket), and scans for new ones.

### 4.5 Schema addition — `dealers` table

```sql
CREATE TABLE IF NOT EXISTS dealers (
  id            bigserial PRIMARY KEY,
  domain        text NOT NULL UNIQUE,         -- 'www.examplechevy.com'
  platform      text NOT NULL,                -- 'dealer_com' (future-proof for other platforms)
  dealer_name   text,                         -- resolved from the homepage
  city          text,
  state         text,                         -- 2-letter
  zip           text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true,
  miss_count    integer NOT NULL DEFAULT 0,   -- consecutive failed scrapes before we deactivate
  notes         text
);

CREATE INDEX IF NOT EXISTS dealers_platform_active_idx
  ON dealers (platform, is_active);
```

## 5. Scrape worker: what runs on the VPS

### 5.1 Loop

```
while true:
  dealers = SELECT * FROM dealers WHERE is_active = true AND platform = 'dealer_com'
  run_id = INSERT INTO scrape_runs (started_at, dealer_count=len(dealers))
  for dealer in dealers:
    try:
      listings = fetch_inventory(dealer)
      upsert_batch(listings)  # 100 at a time
      UPDATE dealers SET last_verified_at=now(), miss_count=0 WHERE id=dealer.id
    except:
      UPDATE dealers SET miss_count = miss_count + 1 WHERE id=dealer.id
      if miss_count >= 7: UPDATE dealers SET is_active = false  # a week of failures = retired
    sleep(0.5)  # 2 req/sec per worker; multiple workers possible later
  mark_sold_sweep()  # listings not seen in 3 days → is_active=false
  UPDATE scrape_runs SET finished_at=now() WHERE id=run_id
  sleep(3600)  # start next pass 1 hour after this one finished
```

Simple, serial, single-process. 2 vCPU can comfortably run two of these in parallel against disjoint halves of the dealer list once we need to scale past one pass/hour.

### 5.2 How we fetch one dealer's inventory

Two-tier strategy:

**Tier 1 — HTML + JSON-LD scrape (fast, cheap, works for ~90% of Dealer.com sites):**
1. Fetch `https://<domain>/new-inventory/index.htm` and `/used-inventory/index.htm`.
2. Follow pagination (`?start=0&count=24`, `?start=24&count=24`, etc.) until the "next page" link is gone.
3. Each listing-card page block contains a `<script type="application/ld+json">` with full `Vehicle` schema. Parse that.
4. For specs the JSON-LD omits (transmission detail, drivetrain, carfax hints), hit the VDP URL and parse the same way.

**Tier 2 — Playwright fallback (slow, resource-heavy, for ~10% of sites that bot-block Tier 1):**
Keep the Playwright adapter stubbed and off by default in v1. If a dealer errors 7 times in a row with 403/429/captcha challenge, flip them to the Playwright adapter. Add this in v2 — don't over-engineer upfront.

### 5.3 Dedup + change detection

- **Primary key:** `listing_url` (same as the existing MarketCheck/Auto.dev mirror).
- **Upsert behavior:** `ON CONFLICT (listing_url) DO UPDATE` sets `date_last_seen=now()`, refreshes `price/mileage/is_active=true`, resets `miss_count=0`.
- **Price history (change-only):** on upsert, we read the most recent `price_history` row for this listing. If today's `price` matches that row's price → **no insert**. If it differs → insert a new row with today's date. Same car at the same price across hundreds of scrapes = zero new history rows. First time we see a listing → always seed one row with the starting price.
- **Sold detection:** every pass, after processing all dealers, run `UPDATE listings SET is_active=false WHERE date_last_seen < now() - interval '3 days' AND is_active=true`. Three missing passes = sold. **Row stays in the DB forever** — this is a permanent archive, not a live-inventory mirror. `is_active=false` just flags "this car is no longer available at this dealer."

### 5.4 Schema addition — `scrape_runs` table

```sql
CREATE TABLE IF NOT EXISTS scrape_runs (
  id              bigserial PRIMARY KEY,
  platform        text NOT NULL,            -- 'dealer_com'
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  dealer_count    integer,
  vehicles_seen   integer,
  vehicles_new    integer,                  -- INSERTs
  vehicles_updated integer,                 -- UPDATEs on existing listing_url
  vehicles_sold   integer,                  -- flipped is_active=false this pass
  errors          integer NOT NULL DEFAULT 0,
  notes           text
);

CREATE INDEX IF NOT EXISTS scrape_runs_started_idx ON scrape_runs (started_at DESC);
```

Used for the daily health check and for troubleshooting.

### 5.5 Schema change — drop `source` from `listings`

```sql
ALTER TABLE listings DROP COLUMN IF EXISTS source;
```

**Code impact:** `src/lib/comps-db/mirror-listings.ts` loses the `sourceSlugFromUrl` helper and the `source: ...` field in the row builder. The MarketCheck/Auto.dev → mirror path keeps working identically.

Migration + rollback live in `supabase/migration-comps-drop-source.sql` + `-rollback.sql`.

## 6. What gets saved per comp (final column list)

Columns written to `listings` by both the existing mirror code and the new scraper:

| Column | Source | Notes |
|---|---|---|
| `listing_url` | VDP URL | Unique index; dedup key |
| `vin` | JSON-LD `vehicleIdentificationNumber` | Null-safe; drop row if VIN is missing |
| `year`, `make`, `model`, `trim` | JSON-LD `modelDate`, `brand`, `model`, `vehicleConfiguration` | |
| `mileage` | JSON-LD `mileageFromOdometer.value` | |
| `price` | JSON-LD `offers.price` | |
| `city`, `state`, `zip` | Dealer address (from Cox-published info in header/footer) | |
| `dealer_name`, `dealer_phone` | Dealer header + schema.org `AutoDealer` block | |
| `is_dealer` | Always `true` | |
| `photo_url` | JSON-LD `image[0]` | |
| `transmission`, `drivetrain`, `fuel`, `engine_summary` | VDP specs table | |
| `is_active` | `true` on upsert; set `false` by the sold-sweep | |
| `date_listed` | Dealer-exposed "listed on" date if present | Null otherwise |
| `prior_accident`, `prior_owner_count` | Carfax snippet on VDP if present | Null for most Dealer.com sites |
| `data_provider` | `'scrape'` | Matches existing MarketCheck/Auto.dev mirror value |
| `date_first_scraped` | First time we saw this `listing_url` | |
| `date_last_seen` | Refreshed every pass | |
| `miss_count` | +1 per pass we expected it but didn't see it | |

Dropped: `source`. Everything else stays as it is today.

## 7. Secrets + env setup

New env vars on the VPS (not in HamsPortal):

```
COMPS_DB_URL=https://<xsfa-comps>.supabase.co
COMPS_DB_SERVICE_KEY=<service role key>
DISCOVERY_SERPAPI_KEY=<if we use SerpAPI for Google dorking>
USER_AGENT=HamsPortalCompResearch/1.0 (contact@...)
```

HamsPortal's `.env.local` already has `COMPS_DB_URL` and `COMPS_DB_SERVICE_KEY` — same values on the VPS.

## 8. Legal + ethical posture

- Private VPS, no public API or product built on top of this data.
- Rate ≤ 2 req/sec per dealer domain; slower than a human browsing.
- Honest User-Agent identifying who we are. Not spoofing a browser to evade detection.
- Robots.txt: we read it on first contact per dealer. If a dealer disallows crawling, we skip them and flag the dealer row `is_active=false` with `notes='robots.txt disallow'`.
- Public inventory data only. No login-walled content, no API-key theft.

Henry confirmed OK with this posture 2026-10-13.

## 8.5 Storage projection — nothing gets deleted, ever

Henry's directive 2026-10-13: this is a comp **archive**, not a live-inventory cache. Sold vehicles stay. Dead listings stay. Price history grows forever (change-only). We plan capacity accordingly.

### Growth model

- ~490k live listings at any time (7,000 dealers × ~70 cars).
- ~15% daily churn → ~70k new vehicle rows enter the system per day.
- Average vehicle lifecycle: ~45–60 days on lot, ~2–3 price changes.
- Steady-state price_history inserts: ~100k/day (70k initial seeds + ~30k price-change inserts for still-active cars).

### Projected table sizes

| Table | Row size | After 1 year | After 3 years | After 5 years |
|---|---|---|---|---|
| `listings` | ~700 bytes | 25M rows / ~18 GB | 76M / ~54 GB | 128M / ~90 GB |
| `price_history` | ~40 bytes | 36M / ~1.5 GB | 110M / ~4.5 GB | 183M / ~7.5 GB |
| `scrape_runs` | ~100 bytes | ~1 MB | ~3 MB | ~5 MB |
| `dealers` | ~200 bytes | ~2 MB | ~2 MB | ~2 MB |
| **Total** | | **~20 GB** | **~59 GB** | **~98 GB** |

### Supabase cost implications

Supabase Pro ($25/mo) includes 8 GB. Additional disk storage is ~$0.125 /GB/month.

| Year | Overage | Monthly storage cost | Monthly total (Pro + storage) |
|---|---|---|---|
| 1 | ~12 GB | ~$1.50 | ~$26 |
| 3 | ~51 GB | ~$6.40 | ~$31 |
| 5 | ~90 GB | ~$11.30 | ~$36 |

Not a big dollar risk. A real business running a permanent comp archive at under $40/mo in year 5 is a bargain.

### Query performance at scale

Once `listings` is in the tens of millions of rows, naive ACV queries slow down. Required indexes (added as part of this project):

```sql
CREATE INDEX IF NOT EXISTS listings_vin_idx         ON listings (vin);
CREATE INDEX IF NOT EXISTS listings_ymm_idx         ON listings (year, make, model);
CREATE INDEX IF NOT EXISTS listings_active_idx      ON listings (is_active, date_last_seen DESC);
CREATE INDEX IF NOT EXISTS listings_state_zip_idx   ON listings (state, zip);
CREATE INDEX IF NOT EXISTS price_history_listing_idx ON price_history (listing_id, date_scraped DESC);
```

The ACV tool already filters by year/make/model + geography, so these indexes cover the hot paths.

### What happens if we blow past 100 GB

Supabase Pro supports up to 500 GB — plenty of runway. If we ever get there, options:
- Move inactive rows older than N years to a cheaper cold-storage table (`listings_archive`) still in the same DB. Queryable, just not hot-indexed.
- Partition `listings` and `price_history` by year.

Both are future-us problems. Nothing to do now except ship it and let it grow.

## 9. Observability + failure modes

- `scrape_runs` is the primary health signal. A 24h window with zero rows = something's dead on the VPS.
- systemd auto-restarts the service on crash. Logs go to `journalctl -u hams-scraper`.
- Daily email: a tiny script runs via systemd timer at 7am ET, queries `scrape_runs` for the last 24h, emails Henry if either (a) no passes completed, (b) `errors > 10% of dealer_count`, or (c) `vehicles_seen` dropped >30% vs the trailing-7-day average.
- Nothing in HamsPortal breaks if the scraper is down. The comps DB keeps serving existing rows. ACV just doesn't get fresh inventory until it's back up.

## 10. Scope boundaries — what this does NOT do

- Does not scrape multi-platform (DealerInspire, DealerSocket, etc.). Those are future expansions.
- Does not integrate with HamsPortal UI. Fully autonomous backend.
- Does not expose a dashboard. v1 is log-driven. If Henry wants a web dashboard, that's v2.
- Does not do VIN decoding or ACV adjustments. Raw data in, raw data stored.
- Does not touch the HamsPortal Supabase (`ektglhdstobaipdqssjx`). Writes exclusively to the XSFA comps DB.

## 11. Rollout plan (plan doc will expand this)

1. SQL migration — add `dealers` + `scrape_runs`, drop `source`.
2. `src/lib/comps-db/mirror-listings.ts` — remove `source` field + helper (keeps the MarketCheck/Auto.dev mirror path working after migration).
3. Discovery worker (standalone Node project in a new repo on the VPS, not in HamsPortal).
4. Scrape worker (same new repo).
5. systemd units for both.
6. Daily health email.
7. First week: monitor + tune. Fix the 5–10 Dealer.com sites that fail; stub Playwright for them in v2.

## 12. Open items

None blocking. Everything above is decided.
