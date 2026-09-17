# 2026-09-11 — CSV Claim Sync + Handling-Appraiser List Toggle

## Context

Two independent asks, shipped in the same session because they share a migration:

1. **One-time CSV sync.** Henry pulled `Current-Claims26-09-11.csv` (164 rows, 33 columns) from Modern Appraisers' upstream assignment system. He wants Modern Tools' claim book to reflect it: add missing, close orphans, reassign per the CSV appraiser column.
2. **Handling-appraiser list toggle.** The "Handling Appraiser" `<select>` on the Claim Info tab currently shows every active profile. Henry wants a per-user flag so admins can remove people from that list without demoting them (they stay fully assignable via the reassign dropdown). Initial removals: Arthur Aleksanyan, Wendy Castro, Maeli Sotelo.

Deploy order: migration first (Henry runs it), then Feature 2 code, then Feature 1 sync script (dry-run → approve → --apply).

---

## Feature 2 — Handling-appraiser list flag

### Schema change

New column on `profiles`:

```sql
alter table profiles
  add column show_in_handling_appraiser_list boolean not null default true;
```

Server-side guard: the existing `profiles_role_guard` trigger (from 2026-08-30 Batch B, S6, already run in prod) needs the new column in its admin-only whitelist so appraisers can't self-toggle it via the browser client.

### Data migrations (bundled in the same file)

- Set `show_in_handling_appraiser_list = false` for Arthur Aleksanyan, Wendy Castro, Maeli Sotelo (by profile id, not name, so a future rename doesn't undo this).
- Rename profile `Vahan Zurnachnyan` → `Vahan Zurnachyan` (CSV canonical spelling).
- Insert profile for **Fabian Barahona** (role='appraiser', email='fabian.barahona.placeholder@modernappraisers.com', `is_active=true`) so the CSV sync can assign him his 2 claims.

### Rollback

`supabase/migration-handling-appraiser-flag-rollback.sql` — drop the column, drop the trigger extension, revert Vahan rename, delete Fabian's profile. (Note: rollback for Fabian's profile is only safe if no claims have been assigned to him yet. If sync has already run, the FK on `acv_history.assigned_to` will block the delete — this is a feature, not a bug. Rollback then requires reassigning his claims first.)

### Client-side type

`Profile` interface in `src/lib/supabase/profiles.ts` (or wherever `Profile` is defined) grows a `showInHandlingAppraiserList: boolean` field, wired through the existing camelCase mapping helper.

### Admin UI

`src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` gains one more checkbox row: **"Show in handling-appraiser list"** (default checked). Same PATCH endpoint that handles the other permission flags; I extend its allowed-keys set to include `show_in_handling_appraiser_list`.

### Workspace filter

`src/components/claim/ClaimWorkspace.tsx` line ~466:

```ts
// before
{allProfiles.filter(p => p.isActive).map(...)}
// after
{allProfiles
  .filter(p => p.isActive && p.showInHandlingAppraiserList !== false)
  .map(...)}
```

`!== false` (not `=== true`) so legacy profile rows that predate the migration in a stale cache still show up. Belt-and-suspenders — the migration sets `default true`, so this only matters if a browser is running stale data.

### What DOES NOT change

- `assignedTo` (profile UUID on `acv_history.assigned_to`) — Arthur/Wendy/Maeli remain fully assignable via the reassign dropdown, bulk reassign, and API.
- Any existing profile permission flag.
- The `claim.handlingAppraiser` string field on already-saved claims (they keep whatever name they had).

---

## Feature 1 — One-time CSV sync script

### Path & invocation

`scripts/sync-claims-from-csv.mjs`

```
node scripts/sync-claims-from-csv.mjs <csv-path>                        # dry-run (default)
node scripts/sync-claims-from-csv.mjs <csv-path> --apply                 # writes to DB
node scripts/sync-claims-from-csv.mjs <csv-path> --apply --confirm-closes=N   # required if close count > 40
```

Reads `SUPABASE_SERVICE_ROLE_KEY` from env. URL hardcoded to project `ektglhdstobaipdqssjx`.

### Matching key

`acv_history.claim->>'maNumber' == csv.assignment_id`. Raw digits both sides. Any Modern Tools row where `maNumber` is empty or non-digit (test/demo/legacy) is SKIPPED with a warning — not managed by the CSV.

### Appraiser resolution

Case-insensitive exact match on `profiles.name`. Blank / "Modern Appraisers" placeholder / no-match → unassigned + warn. Post-migration, all 11 distinct non-blank CSV names resolve.

### Per-CSV-row action table

Given the CSV row's `appraiser` (resolved to `csvAssigneeId | null`) and `phase` (resolved to `csvPhaseCode | null`):

| MT state | Action |
|---|---|
| Not in MT | INSERT new row: `status='open'`, `assigned_to=csvAssigneeId`, `status_phase=csvPhaseCode`, `assigned_at=now if assignee`, `status_phase_set_at=now if phase`. `claim` jsonb backfilled from CSV (see mapping table below). All other columns (`comps`, `adjustments`, `result`, `estimate`, `auction_listings`, `documents`, `dv`, `invoice`, `reports_state`, `mileage_rate`) left as SQL defaults (empty/null). Storage bucket untouched. |
| MT open (active or completed queue), assignee matches CSV | If phase differs: UPDATE `status_phase`. Otherwise no-op. |
| MT open, assignee differs from CSV | REASSIGN: `assigned_to=csvAssigneeId`, `assigned_at=now if assignee`, `submitted_at=null`, `submitted_by=null`, `last_status_request_at=null`, and merge `handlingAppraiser` into the existing `claim` jsonb (no other jsonb keys touched). Update phase if differs. |
| MT closed | REOPEN: `status='open'`, `submitted_at=null`, `submitted_by=null`. Then apply reassign + phase logic above. |

### After all CSV rows processed

For every `acv_history` row where `status='open'` AND `maNumber` is a valid digit string AND `maNumber` is not in the CSV → CLOSE (`status='closed'`). This **explicitly includes claims in the completed queue** (`submitted_at IS NOT NULL`) — they're not exempt from the close pass. Rows with non-digit `maNumber` are skipped (test/demo/legacy).

### Claim-Info-diff flag (dry-run only)

For every MT-open claim that IS in the CSV, compare these fields between the current `claim` jsonb and what the CSV would produce:

- `claimNumber` vs csv `claim_number`
- `vin` vs csv `v_vin`
- `year`, `make`, `model` vs csv `v_year`, `v_make`, `v_model`
- `insuranceCompany` vs csv `insurance`
- `adjuster` vs csv `adjuster`
- `insuredName` vs csv `owner_first_name + " " + owner_last_name`
- `ownerPhone` vs csv `mobile_phone`
- `dateOfLoss` vs csv `date_of_loss` (normalize both to ISO)

Any diff → log with MA# + field name + both values. **The script does NOT auto-update these fields on existing claims** (per Henry's rule: "leave existing claims alone except for assignment/status/phase"). Diffs are reported so Henry can eyeball and manually reconcile if needed.

### CSV field → ClaimInfo mapping (for new inserts only)

| CSV column | ClaimInfo key | Notes |
|---|---|---|
| `assignment_id` | `maNumber` | Raw digits. |
| `claim_number` | `claimNumber` | |
| `insurance` | `insuranceCompany` | |
| `adjuster` | `adjuster` | Trimmed; blank stays blank. |
| `owner_first_name` + `owner_last_name` | `insuredName` | Space-joined, trimmed. |
| `mobile_phone` | `ownerPhone` | As-is (already formatted `(xxx) xxx-xxxx` in the sample). |
| `v_address` + `v_city` + `v_state` + `v_zip` | `ownerAddress` | Comma-joined. Labeled `v_` (vehicle) in CSV but Modern Tools has no vehicle-address slot; this is the best home for it. |
| `v_vin` | `vin` | Uppercased. |
| `v_year` | `year` | Parsed to number; 0 if unparseable. |
| `v_make` | `make` | |
| `v_model` | `model` | |
| `v_zip` | `zip` | Used for comp search radius. |
| `date_of_loss` | `dateOfLoss` | Normalize `"YYYY-MM-DD HH:MM:SS"` → `"YYYY-MM-DD"`. Rows with `"0000-00-00"` → empty string. |
| `date_created` | `dateReceived` | Same normalization. |
| CSV `appraiser` resolved to profile name | `handlingAppraiser` | Blank for unassigned. |
| CSV `ass_type` | `claimTypes[]` | `Auto`→`['acv']`, `Diminished Value`→`['dv']`, `Estimate Review`→`['estimate']`, everything else→`['other']`. |
| — | `clientType` | Default `'Insured'`. |
| — | `clientName` | Empty; the app falls back to `insuredName`. |
| — | `radius`, `trim`, `engine`, `drivetrain`, `transmission`, `fuelType`, `mileage`, `ownerEmail`, `adjusterPhone`, `adjusterEmail` | Empty / zero. Appraiser fills in when they open the claim. |

### Phase mapping

Load `status_phase_configs` at script start. For each CSV phase value, slugify (`toLowerCase().replace(/[^a-z0-9_]/g, '_')`) and look up by `code`. Missing → log warning, skip phase-setting for that row. Blank CSV phase → clear MT phase.

### No auto-messages

The script writes columns directly via the service client. It bypasses `/api/claims/[id]/*` routes entirely — those post auto-messages, and 164 bulk operations would flood the message thread. If Henry wants an audit trail, the script writes a `csv-sync-<timestamp>.log` with every row's action.

### Hard safety gate

If the planned CLOSE count exceeds 40, `--apply` refuses to run unless `--confirm-closes=N` is passed with the exact expected count. Prevents accidental mass-close from a malformed CSV. `ADD`, `REOPEN`, `REASSIGN`, `PHASE` counts don't gate — they're recoverable via inverse operations.

### Dry-run output

Sample shape:

```
=== PLAN (dry-run, no writes) ===
CSV rows:        164
Profiles loaded: 13  (post-migration)
MT open rows:    NNN

ADD (new to MT):        X   [first 20 MAs shown]
REOPEN (closed in MT):  Y   [first 20]
REASSIGN (differ):      Z   [first 20 with FROM -> TO]
PHASE (differ):         P   [first 20 with FROM -> TO]
CLOSE (not in CSV):     W   [first 20]
NO-OP:                  N

WARNINGS:
  - K CSV rows with unresolvable appraiser (imported unassigned)
  - J CSV phases don't match a status_phase_configs code (phase skipped)
  - M MT rows have non-digit maNumber (skipped)
  - L MT open rows in completed queue that will be CLOSED (submitted_at set)

CLAIM INFO DIFFS (existing rows, will NOT be updated):
  MA 3554638:  vin: NULL -> "5YJ3E1EA9PF562416"
  MA 3602855:  insuranceCompany: "Geico" -> "Geico Ins. Co."
  ...

Use --apply to execute. If CLOSE > 40, also pass --confirm-closes=W.
```

---

## Deploy sequence

1. Henry runs `supabase/migration-handling-appraiser-flag.sql` in the Supabase SQL editor. Confirms row count for the 3 updates + 1 rename + 1 insert.
2. I deploy the Feature 2 code (workspace filter + admin toggle + Profile type). Standard tsc + build + `vercel --prod` with rollback URL in the deploy message. This is safe to ship even before the sync runs — new `Handling Appraiser` dropdown just filters out Arthur/Wendy/Maeli everywhere. Assignment / reassign still works for them.
3. I run `node scripts/sync-claims-from-csv.mjs <path>` (dry-run). Paste the plan output into chat. Henry approves.
4. I run `--apply` (with `--confirm-closes=N` if needed). Post-run summary + link to log file.

## Rollback

- **Migration:** run `supabase/migration-handling-appraiser-flag-rollback.sql` in the SQL editor.
- **Feature 2 code:** `vercel promote <prior-deploy-url>` — included in the deploy message.
- **Sync script (--apply):** no auto-revert. Actions ARE recoverable:
  - Closed by mistake → admin reopens.
  - Reassigned by mistake → admin reassigns back.
  - Reopened by mistake → admin approves back to closed.
  - Inserted by mistake → admin deletes.
  - Phase changed by mistake → admin changes phase.
  The `csv-sync-<timestamp>.log` file is the audit trail for what changed.

## What Henry needs from me before I start

Approved 2026-09-11. Proceeding with:

- Fabian Barahona: role=appraiser, email=`fabian.barahona.placeholder@modernappraisers.com` (placeholder — he can't log in until Henry swaps the email).
- Vahan profile rename: `Zurnachnyan` → `Zurnachyan`.
- Service role key: provided in-session, must be rotated post-session.
- Admin user id for `approved_by` on closes: **not needed** — the approve route only sets `status='closed'` (no approved_by column exists in `acv_history` per the current schema). Script matches that shape.
