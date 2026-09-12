# Session log

Running log of every working session on Modern Tools. **Newest entry on top.**

Each entry follows this shape:

```
## YYYY-MM-DD — one-line title

**Worked on:** what the session was about.
**Changed:** files touched + one-line summary of each.
**Deploy status:** live? deploy id? alias verified? rollback URL for the previous good build?
**In progress / broken / unknowns:** anything half-done, known bugs, or things you couldn't verify.
**Next:** the punch list for the next session.
```

Read `CLAUDE.md` first if you haven't. Then read the top entry here before touching anything.

---

## 2026-09-11 (late night) — Super-admin activity tracking: code complete, migration + bootstrap + deploy pending

**Worked on:** New feature — a "super admin" tier for Henry Admin (henryaleksanyan@gmail.com) that can see per-user active-time analytics on Modern Tools. Regular admins/appraisers are still tracked but see no UI change. All four windows requested (today / this week / this month / last 6 months) supported. Full brainstorm → spec → plan → subagent-driven implementation flow completed in one session. All 11 code tasks committed and reviewed; only Task 12 (Henry-run migration + bootstrap script + Vercel deploy) remains.

**Changed (13 commits `08ed09a`..`aa54912`, all still on `main` — NOT deployed yet):**

- `supabase/migration-super-admin-activity.sql` + rollback — adds `profiles.is_super_admin`, extends `profiles_role_guard` so the flag can ONLY be flipped by service role (hoisted above the admin bypass), creates `user_activity_daily` table (composite PK `(user_id, activity_date)`, RLS SELECT-only for super-admins, service-role writes).
- `scripts/bootstrap-henry-admin.mjs` — idempotent one-shot, creates auth user + profile with `is_super_admin=true`. Reads `.env.local` inline; password `Hratch33!` in source.
- `src/lib/supabase/profiles.ts` — `Profile.isSuperAdmin` + mapper (defaulted `false` via `=== true` check).
- `src/lib/auth/require-admin.ts` — `CallerContext.isSuperAdmin`; extended `getCaller` select; new `requireSuperAdmin()` returning 403 `Super-admin only`. Also carried the earlier session's `statusPhase` edits that were sitting uncommitted in the working tree (already deployed as `dpl_6VmQhf97hgcNatYMgyw222mAkcRX`, just belatedly committed here).
- `src/app/admin/_guard.tsx` — new `SuperAdminGuard()` server component (`notFound()` on anyone without `is_super_admin=true`).
- `src/lib/activity/formatters.ts` — new. `formatHoursMinutes`, `formatRelativeTime` (patched to handle future timestamps + close the 335–364d "0 years ago" gap), `laCalendarDate`, `laMondayOf`, `laMonthStart`, `laMinusDays`. All client-safe, no server imports.
- `src/components/activity-heartbeat.tsx` + mount in `src/app/layout.tsx` — client hook fires `POST /api/activity/heartbeat` every 60s while tab is visible + focused + user interacted in last 2 min. Multi-tab dedup is server-side.
- `src/app/api/activity/heartbeat/route.ts` — CAS-guarded per-minute dedup upsert. Silent 204 on every path.
- `src/app/api/activity/summary/route.ts` — GET, super-admin only, per-user totals for the four windows. 42P01 fallback so UI stays alive if migration not run.
- `src/app/api/activity/summary/[userId]/route.ts` — GET, super-admin only, last-180-day rows for one user.
- `src/app/admin/settings/activity/page.tsx` + `activity-client.tsx` — landing page with sortable table (Today/Week/Month/6mo/Last Active) + Show-inactive toggle. Rows link to per-user drilldown.
- `src/app/admin/settings/activity/[userId]/page.tsx` + `user-activity-client.tsx` — drilldown with 4 summary cards, 30-day bar chart (pure Tailwind divs), monthly-totals table for the last 6 months. Fixed a 30-day-stride bug in `build6MonthTotals` mid-session (now uses month arithmetic; would otherwise silently drop Feb / duplicate long months depending on today's date).
- `src/app/admin/settings/_settings-nav.tsx` — new 7th "Activity" section, filtered out unless `profile.isSuperAdmin === true`. Uses `useCurrentProfile()`.
- `docs/superpowers/specs/2026-09-11-super-admin-activity-tracking-design.md` + `docs/superpowers/plans/2026-09-11-super-admin-activity-tracking.md` — full spec + 12-task plan.

**Deploy status:** NOT DEPLOYED. Prod is still on `dpl_6VmQhf97hgcNatYMgyw222mAkcRX` from the Completed-phase feature earlier today. All 13 activity-tracking commits are local on `main`.

**Verification so far:** Every task passed spec-compliance review AND code-quality review by fresh subagents. `npx tsc --noEmit` clean at HEAD. `npm run build` clean at HEAD. No browser smoke-tests yet (deferred until migration is applied).

**IMMEDIATE PENDING WORK for Henry (in this order):**

1. **Run the migration** in Supabase SQL Editor: paste `supabase/migration-super-admin-activity.sql`. Expected verification output: `1, 1, 1` (column, table, RLS).
2. **Run the bootstrap script** locally: `node scripts/bootstrap-henry-admin.mjs`. Expected output ends with `Done. Henry can now log in.` Idempotent — safe to re-run.
3. Reply "done" (or paste errors) in the next Claude session — Claude will then run Task 12: capture rollback URL via `vercel inspect`, deploy via `npx vercel --prod --scope henry-as-projects-88caed67 --yes`, verify alias flip, and update this SESSIONS entry with deploy id + rollback URL.

**Rollback commands (queued for Task 12 — DO NOT run until we deploy):**
- Code rollback (if the deploy breaks): `npx vercel promote https://modern-tools-e7u4molv0-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (that's `dpl_6VmQhf97hgcNatYMgyw222mAkcRX`, the current live build).
- Migration rollback: paste `supabase/migration-super-admin-activity-rollback.sql` in SQL Editor. Cleanly reverses table + column + trigger.
- Henry Admin account: leaves behind a plain admin account after migration rollback. To delete outright: Supabase Dashboard → Authentication → find `henryaleksanyan@gmail.com` → delete (cascades profile).

**In progress / broken / unknowns:**
- **Password `Hratch33!` is in `scripts/bootstrap-henry-admin.mjs` source.** This repo periodically syncs to GitHub (`Crazexdlol/modern-tools`). Reviewer flagged — recommend Henry rotate the password via `/admin/settings/users/<id>` after first login. Non-blocking.
- **Multi-tab dedup, DST behavior, and the 6-month rolling window all reasoned-through but not yet exercised in prod.** The heartbeat CAS logic prevents double-counting mathematically, but hasn't been observed with real users open in multiple tabs. Watch after deploy.
- **Existing pre-session uncommitted files still sitting in the working tree** (`M getting-started/launching-claude.md`, `M public/acv-template.pdf`, `M src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx`, `M src/app/api/admin/users/[id]/route.ts`, `M src/app/api/claims/[id]/*.ts`, `M src/app/page.tsx`, `M src/components/claim/ClaimWorkspace.tsx`, `M src/lib/supabase/history.ts`, deleted `src/app/completed-assignments/*`, plus untracked `cleanup-post-sync-*.log`, `csv-sync-*.log`, `scripts/inspect-*.mjs`, `scripts/csv-*.mjs`, `scripts/cleanup-post-sync.mjs`, `scripts/count-aps.mjs`, `scripts/dump-ap.mjs`, `scripts/fix-acv-quadding.mjs`, `scripts/sync-claims-from-csv.mjs`, `scripts/test-fill-acv.mjs`, `supabase/migration-completed-phase*.sql`, `supabase/migration-handling-appraiser-flag*.sql`). Most are from the prior 2 sessions (all shipped to prod already, just uncommitted). Cleanup + commit is a follow-up.
- Reviewer nits (all non-blocking, all logged): sort-nulls behavior in the activity table, keyboard accessibility of the sortable `<Th>` headers, monthly bar chart bars aren't focusable. All inherited from spec.

**Next (for the next Claude session, after Henry replies "done"):**
1. Verify migration ran (ask Henry to paste the `1,1,1` output OR run `select is_super_admin from public.profiles where email='henryaleksanyan@gmail.com'` via service role → should return `true`).
2. Task 12 Steps 2–7 verbatim from `docs/superpowers/plans/2026-09-11-super-admin-activity-tracking.md`: capture rollback URL, deploy, verify alias, smoke-test as Henry Admin + as a regular admin, edit this SESSIONS entry to record the new deploy id.
3. Optional: prune the working-tree carry-over from prior sessions (see In progress list above).

---

## 2026-09-11 (evening, follow-up) — Post-sync cleanup: 213 → 164 open, 1:1 with CSV

**Worked on:** Henry noticed MT had 213 open claims but the CSV only had 164. Root-cause investigation surfaced three separate data-integrity issues that the morning's CSV sync couldn't fully resolve on its own:

1. **32 MAs with duplicate rows in `acv_history`** — same claim created twice at different times (probably a "New Claim" restart after an accidental close), both instances got real ACV work done. Sync's dedup-by-MA logic only touched one row per MA#; the sibling stayed open and undetected.
2. **16 empty-MA orphans** — rows where someone hit "New Claim" but never filled in an MA# and abandoned. They have no MA to match against the CSV, so the sync skipped them entirely.
3. **24 rows the sync had closed but were open again** — every one of these was actually the "kept-open sibling" of a dupe pair, not a true post-sync reopen. Rooted in issue #1.

**Changed:**
- `scripts/cleanup-post-sync.mjs` — three-pass ETL. Pass 1 dedupes: per MA, keeps the newest data-having row open, closes older data-having siblings (preserves audit), deletes fully-blank siblings. Pass 2 closes empty-MA orphans. Pass 3 closes any digit-MA row that's still open but missing from the CSV.
- One follow-up ad-hoc close pass to catch 15 dupe-consolidated rows for MAs that weren't in the CSV (pass 1 kept them open by default; that behavior only makes sense for CSV MAs, and I fixed it inline rather than re-run the whole cleanup).

**Applied (Supabase writes, all via service role):**
- 16 OPEN — closed dupe rows that were actually the newest data-having row for their MA (swapped stale-open ↔ current-closed).
- 50 CLOSE (first pass) — 24 older data-having dupe siblings + 16 empty-MA orphans + 10 non-dupe non-CSV open rows.
- 15 CLOSE (follow-up) — dupe-consolidation "winners" whose MA wasn't in CSV, so they got closed to match the CSV.
- 0 deletes. Nothing was hard-removed; every consolidated row lives on in the closed pile.

**Verification (post-cleanup):**
```
Open rows total:            164
Open unique MAs:            164
CSV MAs total:              164
CSV MAs present in open:    164 ✓
CSV MAs MISSING from open:  0   ✓
Open MAs NOT in CSV:        0   ✓
MAs with >1 open row:       0   ✓
```
Modern Tools open queue is now a perfect 1:1 with the CSV.

**Deploy status:** No prod deploy for this — data-only cleanup via Supabase service role. The morning's Feature 3 deploy (`dpl_6VmQhf97hgcNatYMgyw222mAkcRX`) still stands.

**Rollback:** No auto-revert. Individual actions are recoverable via workspace Reopen / admin Close. Full audit trail in `cleanup-post-sync-2026-09-11T10-26-13-510Z.log` (repo root) — includes every id + before/after status. If you need a batch revert, that log has the row IDs to plug into a "set all these back to their previous state" inverse script.

**In progress / broken / unknowns:**
- The dupe pattern (same MA# → 2 acv_history rows) is real and probably ongoing. Root cause: when someone closes a claim and then hits "New Claim" and enters the same MA#, we create a fresh row instead of catching the collision. Not addressed this session — flagged as a follow-up.
- Some closed claims now hold "shadow" work data that used to be on the primary row. If Henry ever needs the historical version of a claim, `select * from acv_history where claim->>'maNumber' = 'X'` returns both rows; the closed one is the archived duplicate.
- Feature 3 UX-verify (submit → claim stays on dashboard with Completed pill) still pending Henry's spot-check.

**Next:**
- Consider adding a create-time uniqueness check on `claim->>'maNumber'` to prevent the "duplicate row per MA" pattern going forward. Would need to reconcile with the current claim-lifecycle (closed claims should still allow their MA to be re-used? or should closing archive the MA? — a design decision, not a straight bug fix).

---

## 2026-09-11 (evening) — Completed queue → Completed phase (one dashboard, filter button)

**Worked on:** Henry: the separate `/completed-assignments` route is dead weight. Fold "completed" into the status-phase system so submitted claims stay on the dashboard with a Completed pill, and repurpose the top-right Completed button as a filter toggle instead of a route link. No more two-views-of-the-book split.

**Changed:**
- `supabase/migration-completed-phase.sql` (+ rollback) — adds `completed` (blue, sort_order=6) to `status_phase_configs`, backfills `status_phase='completed'` + `status_phase_set_at=submitted_at` on any currently-open+submitted row whose phase was null. **RUN by Henry, verified `1, 2, 0` (1 config row, 2 backfilled, 0 stragglers).**
- `src/lib/auth/require-admin.ts` — `WorkflowClaim` now carries `statusPhase`; `fetchClaim` selects `status_phase` so the submit/send-back/reassign/reopen routes can inspect it.
- `src/app/api/claims/[id]/submit/route.ts` — on submit, also set `status_phase='completed'` + `status_phase_set_at=now`.
- `src/app/api/claims/[id]/send-back/route.ts` — clears `status_phase` alongside `submitted_at` IF the current phase is `'completed'`. Other admin-set phases (Umpire, Hold, etc.) are left alone.
- `src/app/api/claims/[id]/assign/route.ts` — same conditional phase-clear on reassignment. (Existing behavior of clearing `submitted_at/by/last_status_request_at` unchanged.)
- `src/app/api/claims/[id]/reopen/route.ts` — same conditional phase-clear when reopening a closed claim.
- `src/app/page.tsx` — dashboard now shows every non-closed claim (dropped the `!e.submittedAt` filter). Top-right Completed button is a filter toggle (`onClick`: flip `phaseFilter` between `null` and `'completed'`); count badge = current-view completed count; active state gets blue background + inverted badge. Icon `Inbox` → `CheckCircle2` to match the "filter" intent instead of "inbox destination."
- Deleted `src/app/completed-assignments/page.tsx` and `src/app/completed-assignments/completed-client.tsx`. Directory removed.
- `src/lib/supabase/history.ts` — stale comment mentioning `/completed-assignments` updated.

**Deploy status:** LIVE. `dpl_6VmQhf97hgcNatYMgyw222mAkcRX` (URL `https://modern-tools-e7u4molv0-henry-as-projects-88caed67.vercel.app`). Alias `modern-tools-rho.vercel.app` verified flipped, ● Ready. `npx tsc --noEmit` clean, `npm run build` clean.

**Rollback:**
- Code: `npx vercel promote https://modern-tools-jf8hvlot2-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (previous good build `dpl_AnVu4CQ5ZEBMRCJJW9KZMv5deYdR`, the handling-appraiser-list build).
- Migration: `supabase/migration-completed-phase-rollback.sql` in the SQL editor. Clears `status_phase='completed'` from any acv_history row and drops the config row.
- **Rolling back the migration without also reverting the code** will leave the submit route trying to write `status_phase='completed'` to a code that isn't in `status_phase_configs`. Rows would still write fine (no FK), but the phase pill would render `—` on the dashboard because the config lookup misses. Revert both together if you need to roll back.

**In progress / broken / unknowns:**
- `showSubmittedColumn` prop on `ClaimsTable` is now dead (only `/completed-assignments` used it). Left in place — pruning it is a follow-up cleanup. Filed under "Next" below.
- The old submit button still works exactly as before from the appraiser's side; only the server-side effect (adding phase=completed) changed. UX-verify by having an appraiser submit a claim and confirm the Completed pill appears + it stays on the dashboard.

**Next:**
- Optional cleanup: prune `showSubmittedColumn` from `src/components/claims-table.tsx` (~3 references, all reachable code paths pass false / omit it).
- Optional cleanup: delete recon scripts from earlier sessions (`scripts/inspect-*.mjs`, `csv-inventory.mjs`, `csv-profile-match-check.mjs`, `fix-acv-quadding.mjs`, `test-fill-acv.mjs`, `dump-ap.mjs`, `count-aps.mjs`).

---

## 2026-09-11 (late) — CSV claim-book sync + handling-appraiser list toggle

**Worked on:** Henry pulled `Current-Claims26-09-11.csv` (164 rows, 33 cols, from Modern Appraisers' upstream assignment system) and asked me to reconcile Modern Tools against it: add missing, close orphans, reassign per the CSV `appraiser` column. Separate ask same session: add an admin toggle to remove specific people from the "Handling Appraiser" `<select>` on Claim Info without touching their assign-ability — first cut removes Arthur Aleksanyan, Wendy Castro, Maeli Sotelo from that list. Spec: `docs/superpowers/specs/2026-09-11-csv-sync-and-handling-appraiser-list-design.md`.

**Changed:**
- `supabase/migration-handling-appraiser-flag.sql` (+ `-rollback.sql`) — adds `profiles.show_in_handling_appraiser_list` (bool, default true), turns it off for the three profiles, renames profile `Vahan Zurnachnyan` → `Vahan Zurnachyan` (CSV canonical spelling, needed for name-matching), extends the existing `profiles_role_guard` trigger. **RUN by Henry, verified `1,3,1` (column exists, 3 hidden, Vahan renamed).**
- `src/lib/supabase/profiles.ts` — `Profile.showInHandlingAppraiserList` + camelCase mapping.
- `src/app/api/admin/users/[id]/route.ts` — PATCH accepts `showInHandlingAppraiserList`.
- `src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` — new toggle row.
- `src/components/claim/ClaimWorkspace.tsx` — handling-appraiser `<select>` filters on `showInHandlingAppraiserList !== false` in addition to `isActive`; and preserves the currently-saved value as a disabled `— (not in list)` option so an existing claim with Arthur/Wendy/Maeli as handling appraiser doesn't silently render blank.
- `scripts/sync-claims-from-csv.mjs` — one-shot ETL. Dry-run by default, `--apply` writes, `--confirm-closes=N` gate required when CLOSE > 40. Bootstraps Fabian Barahona's profile (`fabian.barahona.placeholder@modernappraisers.com`, appraiser, random pw, email_confirm=true) and the `dv_response` status_phase_configs code on first --apply. Matches by digit-only maNumber. For NEW rows: full Claim Info backfill (no comps/ACV/DV/estimate/documents/invoice/reports_state touched). For EXISTING rows: only assign_to/assigned_at/submitted_at/submitted_by/last_status_request_at/status/status_phase/status_phase_set_at, plus `handlingAppraiser` merged into the existing `claim` jsonb — every other claim.jsonb key + every other jsonb column left alone. Reports Claim Info diffs for existing rows without applying them. Never posts auto-messages. Log file per run.
- `scripts/csv-inventory.mjs`, `scripts/csv-profile-match-check.mjs`, `scripts/inspect-flatten-flow.mjs`, `scripts/inspect-page1-labels.mjs` — reconnaissance scripts left in place. Safe to delete when the tree gets swept.

**Deploy status:** LIVE. `dpl_AnVu4CQ5ZEBMRCJJW9KZMv5deYdR` (URL `https://modern-tools-jf8hvlot2-henry-as-projects-88caed67.vercel.app`). Alias `modern-tools-rho.vercel.app` verified flipped, ● Ready. `npx tsc --noEmit` clean, `npm run build` clean. This deploy is the Feature 2 code — sync script runs off-Vercel via `node`.

**Rollback:**
- Feature 2 code: `npx vercel promote https://modern-tools-excne6jp6-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (previous build `dpl_Kkb55QSnyZZkq4SUoSMUJd95WWja`, the earlier-today MA/CL# gap fix).
- Migration: `supabase/migration-handling-appraiser-flag-rollback.sql` in the SQL editor.
- Sync `--apply`: no auto-revert. Actions ARE recoverable in-app (admin re-open, admin reassign, admin approve/close, admin phase change). Log at `csv-sync-2026-09-11T09-50-03-211Z.log` in repo root is the audit trail.

**Sync results (applied 2026-09-11):**
- ADD 105 (new claims from CSV) — includes Fabian's 2 rows after his profile bootstrap.
- REOPEN 2 (closed in MT, still active in CSV).
- REASSIGN 31 (open in MT, CSV appraiser differed).
- PHASE 17 (open in MT, only phase differed).
- CLOSE 418 (open in MT, absent from CSV — Henry confirmed CSV is authoritative before I applied).
- NO-OP 9.
- Non-digit MA# MT rows skipped from the CLOSE pass (16 seen at load, kept as-is).
- 0 errors, all 573 writes succeeded.
- Post-apply verify: 213 open / 433 closed total; Fabian 2 open claims; Vahan Zurnachyan 11 open claims; `dv_response` phase config present.

**Also fixed same session (earlier):** deployed the MA# / CL# gap fix that was sitting in the modified template (widget-level Q=0 override, prior debug session had never shipped). That build was `dpl_Kkb55QSnyZZkq4SUoSMUJd95WWja`.

**In progress / broken / unknowns:**
- 39+ Claim Info diffs flagged in the pre-apply dry-run log. Mostly cosmetic (case, whitespace, model detail) but a few substantive: `MA 3950898` claimNumber went from `"WAITING4##S"` placeholder to `"260487717"`; `MA 3951452` similar (`"WAITING4#Sae"` → `"021508847-800"`, insurance `"na"` → `"USAA Ins. Co."`); `MA 3846985` VIN differs in one char (`1FTNW21L04EA39835` MT vs. `1FTNW21LO4EA39835` CSV — one has "0", other has "O"); `MA 3924276` insuredName has duplicated substring in CSV (`"GO ALL OUT CHAMPAIGN GO ALL OUT CHAMPAIGN"`). Not auto-updated per spec — flagged for Henry to reconcile in-app.
- Fabian's profile email is a placeholder (`fabian.barahona.placeholder@modernappraisers.com`) — he can't log in until Henry swaps for his real email via `/admin/settings/users/<id>`.

**Next:**
- Rotate the Supabase service role key.
- Swap Fabian's placeholder email if he needs to log in.
- Optional cleanup: delete the leftover recon scripts (`csv-inventory.mjs`, `csv-profile-match-check.mjs`, `inspect-flatten-flow.mjs`, `inspect-page1-labels.mjs`, `inspect-ma-cl.mjs`, `inspect-current.mjs`, `inspect-page2*.mjs`, `dump-ap.mjs`, `count-aps.mjs`, `fix-acv-quadding.mjs`, `test-fill-acv.mjs`).

---

## 2026-09-11 — Ship the MA# / CL# gap fix (left-align cover-page values)

**Worked on:** Henry reported the ACV cover page still prints a gap between the "MA#" label and its value, and between "Claim:" and its value. Prior sessions had modified the template locally (via `scripts/fix-acv-quadding.mjs`) to remove field-level `/Q = 1` on `Modern file #` and `Ins Claim #` and pin widget-level `/Q = 0`, but the fix was never deployed. Verified prod's template (git HEAD `f7acdca`) still has `field Q = 1` on both fields → pdf-lib's `defaultUpdateAppearances` centers the value inside the wide widget rect (rect widths 102.7 and 155.4 pts), leaving a big empty span between label-end and value-start on the flattened output. Local template has `field Q = undefined` + `widget Q = 0` → left-aligned. Ran the full pdf-filler flow through `scripts/inspect-flatten-flow.mjs` and confirmed the regenerated `/AP` streams put text at `Tm x=1` (1pt padding inside widget bbox) for MA#, CL#, and the control fields (Client, Owner Name, Date of Loss) — same left-align behavior for all of them now.

**Changed:**
- `public/acv-template.pdf` — locally-modified copy (field-level `Q` deleted, widget-level `Q=0` on both `Modern file #` and `Ins Claim #`) is what Vercel picked up on this deploy. On-disk file was already in the fixed state from the prior in-progress session; this deploy is the first that actually ships it. No source code changes needed.

**Deploy status:** LIVE. `dpl_Kkb55QSnyZZkq4SUoSMUJd95WWja` (URL `https://modern-tools-excne6jp6-henry-as-projects-88caed67.vercel.app`). Alias `modern-tools-rho.vercel.app` verified flipped, ● Ready. `npx tsc --noEmit` clean, `npm run build` clean.

**Rollback:** `npx vercel promote https://modern-tools-8j5i3c3g3-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (previous good build `dpl_tPb24TeuXVTZLDjKgSwaVnK28cDm`, the 09-08 revert-to-original build).

**In progress / broken / unknowns:** Waiting on Henry to eyeball a real generated ACV report to confirm MA# and CL# are now flush against their labels. If a small residual gap remains after this deploy, the next lever is nudging `rect.x` on those two widgets leftward — the current left edges (MA# rect.x=101.2, CL# rect.x=108.5) are still a few pt to the right of where the labels end (label "MA#" ends ≈ x=96, "Claim:" ends ≈ x=107). Untracked leftover scripts (`scripts/inspect-*.mjs`, `scripts/fix-acv-quadding.mjs`, `scripts/test-fill-acv.mjs`, `scripts/count-aps.mjs`, `scripts/dump-ap.mjs`) are debugging aids from this and the prior gap-hunting session — left in place for now, safe to delete if Henry wants a clean tree.

**Next:** Await Henry's review. If still not flush, do a small `rect.x` shift (probably −5 to −8 pt on `Modern file #` widget 1 and −1 to −2 pt on `Ins Claim #` widget 1). If it looks good, close out and delete the leftover debug scripts.

---

## 2026-09-08 — Revert Sept 5 ACV template surgery (was inverted — restored white text on info block)

**Worked on:** Henry reported "the top of the ACV report doesn't have white letters anymore and is just black — we need to fix the report." Root-cause: the 2026-09-05 fix stripped the widget-level white `/DA` (`/TiRo 12 Tf 1 1 1 rg`) from 9 page-1 widgets on the assumption they rendered "white on white paper." Wrong — those 9 widgets form a left-column info block on page 1 (`Modern file #` w1 through `Date of Loss` w1, all clustered at yFromTop ≈ 268–448 and x ≈ 97–146) that sits on a dark image background. White text on that block was the design intent, and it had been rendering correctly in production from 2026-03-09 through 2026-09-05. The Sept 5 fix made all 9 fall back to field-level black → invisible/near-invisible on the dark block. Verified by diffing the pre-Sept-5 (git HEAD) template vs. the on-disk one: pre-Sept-5 had white widget-level DA on exactly those 9 widgets; current had them stripped.

**Changed:**
- `public/acv-template.pdf` — `git checkout HEAD --` restored the original template (5+ months of prior production use). Widget-level white `/DA` back on all 9 info-block widgets. `pdf-filler.ts`'s existing `w.dict.delete(PDFName.of('AP'))` + `NeedAppearances=true` handle appearance regen on each fill, so no code changes needed.

**Deploy status:** LIVE. `dpl_tPb24TeuXVTZLDjKgSwaVnK28cDm` (URL `https://modern-tools-8j5i3c3g3-henry-as-projects-88caed67.vercel.app`). Alias `modern-tools-rho.vercel.app` verified flipped, ● Ready. `npx tsc --noEmit` clean, `npm run build` clean.

**Rollback:** `npx vercel promote https://modern-tools-31kikq38b-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (previous build `dpl_9Ubkt3XE5UP8GX3dVPQbeS9XKTz1`, the broken Sept 5 build).

**In progress / broken / unknowns:** The Sept 5 report claimed CL# (Ins Claim #) was printing as a blank space with the original template. That symptom was NOT reproduced this session — the pdf-filler already clears widget `/AP` and sets `NeedAppearances=true` on every fill, so appearance regeneration from the widget's DA should work. If CL# comes back invisible on a real generated PDF, investigate the specific widget (Ins Claim # widget 1 at x=108.5 y=446.8) rather than mass-stripping again. Test-filled PDF saved to `C:/Users/Owner/Downloads/acv-test-filled.pdf` for eyeball verification.

**Next:** If Henry confirms the info block reads correctly now, close this out. If CL# specifically is blank, single-widget investigation only — do NOT touch the other 8 info-block widgets.

---

## 2026-09-05 — Fix white-text bug on ACV cover page

**Worked on:** Henry reported CL# printed as a blank space on the ACV. Investigation showed page-1 header widgets in `public/acv-template.pdf` had a widget-level `/DA` of `"/TiRo 12 Tf 1 1 1 rg"` — the `1 1 1 rg` renders white text on white paper, so the values were being filled but printing invisibly. Same bug on 9 page-1 widgets total (not just CL#). Field-level DA is black; widget-level DA was overriding it.

**Changed:**
- `public/acv-template.pdf` — one-time PDF surgery via `pdf-lib` to strip the white widget-level `/DA` from all 9 affected page-1 widgets (`Modern file #`, `Ins Claim #`, `Date2_af_date`, `Date of Loss`, `Client`, `Owner Name`, `complete vehicle information`, `VIN`, `mileage`). Widgets now fall back to field-level DA (`"0 0 0 rg /TiRo 13.011 Tf"` — black text). Also cleared their stale `/AP` streams so readers regenerate. Page 2 widgets untouched (they were rendering fine). Verified via re-inspection: 0 page-1 widgets still white.

**Deploy status:** LIVE. `dpl_9Ubkt3XE5UP8GX3dVPQbeS9XKTz1` (URL `https://modern-tools-31kikq38b-henry-as-projects-88caed67.vercel.app`). Alias `modern-tools-rho.vercel.app` verified flipped, ● Ready. `npx tsc --noEmit` clean, `npm run build` clean.

**Rollback:** `npx vercel promote https://modern-tools-qpwkbmjs8-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (previous good build `dpl_49gQkCFTMRncASEv6CmZGLAfo6TT`).

**In progress / broken / unknowns:** None. Test-filled PDF saved to `C:/Users/Owner/Downloads/acv-test-filled.pdf` for Henry to eyeball if he wants pre-flight confirmation.

**Next:** Watch for the same bug pattern on `award-template.pdf`, `notes-template.pdf`, `dv-templates/*.pdf`, and `invoice-templates/*.pdf` — if a future template re-export re-introduces white-DA overrides, run the same strip on that template. Consider a defensive `setField` guard in `pdf-filler.ts` (skipped this time to avoid scope creep, but flagged).

---

## 2026-09-04 — Rename "Dashboard" → "GEVO", then reverted

**Worked on:** Henry asked to rename Dashboard to GEVO across the UI and deploy. Deployed. Then he asked to change it back — reverted the source and promoted the pre-GEVO build back to prod.

**Changed (net):** Nothing. All source edits from the GEVO rename were reverted:
- `src/components/app-header.tsx` — nav label back to "Dashboard".
- `src/app/page.tsx` — h2 heading back to "Dashboard".
- `src/components/claim/ClaimWorkspace.tsx` — back-arrow pill and "Back to Dashboard" (claim-not-found) restored.
- `src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` — description restored to "Can create new claims from the Dashboard."

**Deploy status:** LIVE on the pre-rename build. Alias `modern-tools-rho.vercel.app` promoted back to `dpl_49gQkCFTMRncASEv6CmZGLAfo6TT` (Ready). The GEVO deploy (`dpl_DnGofepq7Cpat79oMubzNrVuRKoF`) is still in Vercel history but no longer aliased.

**In progress / broken / unknowns:** None.

**Next:** Nothing queued.

---

## 2026-08-30 (late) — Full security + bug audit sweep (4 fix batches shipped)

**Worked on:** Henry asked for a full security + bug audit of the site. Dispatched 3 parallel review agents (security audit, API/data-layer bug hunt, client/UI bug hunt) — 20 unique findings across Critical / High / Medium / Low. Then blasted through the fix list autonomously (Henry: "stop asking me and proceed until all is fixed").

**Findings shipped as 4 batches, one prod deploy each so we can rollback independently:**

- **Batch A — Recovery commit + Batch A fixes (S2, S3, S4).** `dpl_CMeCrZfkFqp777TnksfrMAnB88bn`.
  - S2: `/api/claims/[id]/phase` auto-message insert was silently failing every phase change because `messages.id` (PK, no default) and `messages.recipient_names` (NOT NULL) were missing from the insert. Route always returned 200 because insert was fire-and-forget. Added `crypto.randomUUID()` + `recipient_names: []`.
  - S3: Contract fill dropdowns rendered as text inputs — 7 fields declared `type: 'dropdown'` fell through to `<input type="text">`. Added a real `<select>` branch with option lists inlined from the PDF (extracted via `scripts/inspect-contract-pdf.mjs`). Also swapped `List Box 4` (empty-options stub) for `List Box 5` (Yes/No dropdown) as the Prior Damages surface. Updated `/api/acv/generate-contract-pdf` to prefer `.select()` on PDFDropdowns.
  - S4: `<strong>{...linkifyChunk(...)}</strong>` in `guidelines-tab.tsx` spread an array as JSX props — every `**bold**` in an insurance guideline rendered empty. One-char fix.

- **Batch B — Auth/RLS hardening (S1, S6, S7, S8, S9).** `dpl_4aS5Yq7wG7biQrhVFFGnT85zGsNC` + new migration.
  - S1: `/api/claims/[id]/auto-message` accepted caller-supplied `senderName`, letting any authenticated user post spoofed messages ("Admin — Henry") signed with `sender_id=null`. Server now ignores the field and always writes `'Modern Tools (Auto)'`.
  - S6: `profiles_role_guard` trigger didn't cover the newer permission columns (`can_reassign_claims`, `can_edit_claim_info`, `can_create_claims`, `auto_status_requests_override`, `is_active`). Combined with `profiles_update_self` allowing browser writes, any appraiser could self-grant permissions. Migration extends the trigger to reject writes on those columns unless caller is admin or service role. Uses `to_jsonb(new/old)->>` so the guard is idempotent when a column doesn't exist yet.
  - S7: `acv_history_appraiser_guard` ran only BEFORE UPDATE. An appraiser INSERT could self-set `status='closed'`, `submitted_at`, `submitted_by`. New matching BEFORE INSERT trigger force-nulls the workflow columns and forces `user_id = auth.uid()` for non-admin inserts.
  - S8: `/api/claims/[id]/assign` had no target validation. A `can_reassign_claims` holder could dump a claim onto any user id. Added a profile lookup — `assignedTo` must be null or map to an existing, active profile.
  - S9: Admin-branch of assign route skipped `fetchClaim`; a bad id returned `{ok:true}` with 0 rows touched. Added existence check → 404 if the row doesn't exist.
  - **Migration file: `supabase/migration-audit-trigger-hardening.sql` (+ rollback). Needs to be run in Supabase SQL editor for S6/S7 to activate at the DB layer.**

- **Batch C — Silent failures + autosave clobbering (S5, S10, S11, S12).** `dpl_37mc4cfDk7zWtjWNUex1QxrbVsg9`.
  - S5: Bulk Delete reported success on every failure (`deleteACVHistory` swallowed errors, always resolved). Changed helper to return `Promise<boolean>`; bulk runner + workspace both now surface a real alert.
  - S10: In-workspace reassign was clobbered by the 2s autosave (assign route wrote `claim.handlingAppraiser` server-side, `runReassign` only refreshed `assignedTo`, autosave then wrote stale name back). Now re-hydrates the full `claim` jsonb from the refreshed entry.
  - S11: `saveACVHistory` insert errors only `console.error`'d — auto-save left a stale "Unsaved changes" pill. Now throws so the awaiter surfaces the error.
  - S12: Invoice defaults regenerated every render (`new Date()` tick + drift from claim edits). Wrapped in `useMemo(..., [claim])`.

- **Batch D — Data leak + upload validation + UX polish (S13, S14, S17-S20 + LOW cleanup).** `dpl_49gQkCFTMRncASEv6CmZGLAfo6TT`.
  - S13: `/api/claims/duplicates` leaked the entire claim book to any authenticated user (MA#, insured, vehicle, date returned for every match). Non-admins now get counts only; matches array empty. UI shows "Contact an admin for details" instead of per-row rows.
  - S14: File uploads (`lib/supabase/documents.ts`) had no MIME allowlist or size cap. Added 25 MB cap + tight MIME allowlist (PDF, Office, images, text/csv, zip).
  - S17: Bulk Reassign could accidentally mass-unassign because the picker defaulted to `''` which resolved to `null`. Added explicit `— Unassigned —` sentinel option, disabled Confirm until a target is picked, confirm dialog shows the resolved name.
  - S18: `/api/claims/[id]/messages` accepted any profile id as recipient; recipient display names got stamped even though RLS would hide the message from them. Now restricts to admins + current assignee (the users who can actually SEE the claim under `acv_select`).
  - S19: `/api/insurance-guidelines/[id]` DELETE didn't 404 on unknown id (silent no-op). Added existence check.
  - S20: `site_settings` PATCH still accepted both legacy keys even though the appraiser-profiles migration deleted the rows. Emptied `ALLOWED_KEYS` so the route 400s.
  - LOW: dropped unused `PhaseSelector` import; added `export const runtime = 'nodejs'` to two ACV PDF routes (siblings had it, these two were oversights); ClaimsTable now prunes `selectedIds` on filter/sort change so the "N selected" counter matches what's visible; `ConfirmDialog` Enter-to-confirm (matches native `confirm()` ergonomics; skips textareas).

**Deploy status:** All 4 batches live in prod on `modern-tools-rho.vercel.app`. Current alias: `dpl_49gQkCFTMRncASEv6CmZGLAfo6TT`. Each batch was verified via `npx tsc --noEmit` (clean) + `npm run build` (succeeded) before deploy; each deploy re-verified via `vercel inspect`. Every commit message carries its own rollback URL to the immediately-preceding batch.

**GitHub:** committed everything in 5 commits (baseline + 4 fix batches) but `git push` failed — `xsfabot-boop` isn't authorized on `Crazexdlol/modern-tools`. Push queue is stuck locally until Henry either adds the user as a collaborator on GitHub or switches the git remote to an account with push access. Prod is unaffected (Vercel builds from local).

**Migrations RUN this session (confirmed by Henry):**
- `supabase/migration-audit-trigger-hardening.sql` — RUN. S6 (profile permission-column guard) + S7 (acv_history BEFORE INSERT trigger) now active at the DB layer, matching the code-level protections shipped in Batch B.

**In progress / broken / unknowns:**
- **License Type migration status still unknown** (`supabase/migration-license-type.sql`, from session 5).
- Two audit findings deliberately not shipped as too risky vs benefit: **S15** (auto-save `useEffect` missing `builtComps` dep — fixing risks an infinite re-save loop) and **S16** (`RichField` mount-only effect — fixing risks breaking the standalone editor's `resetKey` remount pattern). Both are low-frequency edge cases; leaving them for a future session with a proper test plan.
- **GitHub push access** still blocked — `xsfabot-boop` denied on `Crazexdlol/modern-tools`. 6 commits queued locally (baseline + 4 fix batches + SESSIONS log). Prod is unaffected (Vercel builds from local).

**Next:** Resolve GitHub push access. Consider a follow-up session to tackle S15/S16 with tests. Verify License Type field actually persists (session 5's unknown).

---

## 2026-08-30 — Fix appraiser-create 404 + reassign clears completed + admin Close/Reassign inline

**Worked on:** Three rolling fixes from Henry's live-ops feedback.

1. **Appraiser-create 404.** Appraiser creates a claim → row created, but they immediately hit the Next.js 404 error page; admin could see the row. Root cause: `migration-roles.sql`'s `acv_select` RLS only exposes `acv_history` rows to non-admins where `assigned_to = auth.uid()`, but `saveACVHistory` inserted without setting `assigned_to`. The insert passed (INSERT policy allowed null) but the follow-up SELECT in `/claims/[id]/page.tsx:32` returned null → `notFound()`. Same bug also caused the 2s-debounced auto-save to try re-INSERTing and hitting 23505. Fix: on INSERT, look up creator's role and set `assigned_to = user.id` for non-admins. Admin creates stay unassigned so the existing admin-create-then-assign UI flow is preserved. No migration — RLS INSERT policy already permitted `assigned_to = auth.uid()` for appraisers.

2. **Reassigning a submitted claim didn't remove it from the Completed queue.** Henry reassigned a submitted claim; it stayed in `/completed-assignments` because `submitted_at` was still set. Fix: `POST /api/claims/[id]/assign` now also clears `submitted_at` + `submitted_by` in the update — no-op when the claim wasn't submitted, correct behavior when it was. Mirrors the send-back route's un-submit shape. Also updated the row-reassign confirm dialog copy (previously said "the claim stays submitted"; now says the claim goes back to active work for the new appraiser).

3. **Remove Send Back button + rename Approve → Close Claim + inline Close/Reassign from lists.** Per Henry: kill Send Back (Reassign is now the un-submit path), rename Approve → Close Claim, and let admins close+reassign without opening the claim. Close now works on any open claim (dropped the `must be submitted` guard on `/api/claims/[id]/approve`). Added a per-row Close button to the completed queue AND the dashboard, alongside the existing per-row Reassign dropdown (dashboard was previously bulk-only). Kept `/api/claims/[id]/send-back` intact per Henry — button-only removal.

4. **Reassign polish + handling-appraiser sync.** On reassign, also sync `claim.handlingAppraiser` (the text field embedded in the claim jsonb that drives the printed assignment sheet + signature block) to the new assignee's display name — otherwise printed docs kept showing the prior appraiser. Fetches the target's profile name/email server-side and merges into the claim jsonb inside the same UPDATE. Also trimmed the row-reassign confirm dialog to just "Reassign claim X to Y?" (dropped the "will drop out of completed queue" explanation Henry didn't want). Added a confirmation dialog to the bulk reassign flow (previously fired immediately when clicking Confirm — now shows "Reassign N claims to X?" first).

5. **Descriptive-text sweep + Certificate of Appraisal removal + ACV Contract labeling + table polish.** Henry: "remove all these stupid descriptions that tell you what to do or define what buttons do what." Stripped helper text from `/reports`, `/rules-laws/appraisal-clause`, `/rules-laws/diminished-value`, `/admin/settings/fee-catalog`, `/admin/settings/status-phases`, `/admin/settings/licensed-states`, `src/components/claim/guidelines-tab.tsx` (empty-state hint + footer), and the ClaimWorkspace Claim Info lock/unlock notice (the box now shows just an icon + Edit/Done button, no text). Removed the Certificate of Appraisal card from the in-claim Reports Hub. Rewrote `/claims/[id]/contract` with real per-field labels (Owner Email, Vehicle Status, Insurance Company ACV Offer, etc.) grouped into six sections that match the printed template; mapping derived by dumping every AcroForm field's page+position via `scripts/inspect-contract-pdf.mjs` and pairing them against the PDF's visible labels. Fixed the auto-populate defaults that were writing claim data into the wrong fields (Text Box 1 was getting the claim number, but it's actually Owner Email; VIN was going into what's actually the Insurance ACV Offer box, etc.). Removed the amber "field names are auto-generated — Henry rename them in Acrobat" banner.

6. **Dashboard table polish + Phase pill fixes + bulk actions rework.** Henry screenshot-driven fixes:
   - Phase pill: dropped the ChevronDown icon (didn't want a "dropdown" affordance), gave the button a min-height so rows with an active phase don't render taller than "No Phase" rows, forced the label + age text to explicit black (was picking up phase color like red-800 for Rush), bumped the age text from 10px → 12/14px.
   - Column headers: gray-500 → gray-900, made "Assigned To" (and every data cell in that column) whitespace-nowrap so "Henry Aleksanyan" stops wrapping to two lines.
   - Body cell colors: gray-500/700 → gray-900 across the board; only "Unassigned" and "—" empty placeholders stay gray-400.
   - Removed the per-row Reassign dropdown column AND the per-row Close button column from both the dashboard and the completed queue — bulk toolbar covers both actions now.
   - Bulk toolbar: added Close + Delete buttons alongside Reassign. Both trigger confirm dialogs (Close counts already-closed as skipped; Delete uses the danger variant and warns the action is permanent).
   - Sortable columns: click any header (MA #, Insured, Client, Vehicle, VIN, State, Date, Ins. Co., Assigned To) to sort asc → desc → clear. Sort chevron shown in blue when active. Small `SortableTh` helper handles rendering.

7. **Follow-up UI polish (workspace + phase pill sizing).**
   - Claim workspace: killed the empty "lock" bubble entirely; the Edit/Done toggle now sits inline on the right side of the "Handling Appraiser" section heading (same vertical spot as before, no gray bar).
   - Handling-appraiser license summary: stripped the bg + border on both variants (green when licensed, red when not). Now it's just colored text, no boxes.
   - Rush pill still showed red text after fix #6 because Tailwind class ordering had `text-red-800` (from `phaseColorClasses`) winning the cascade over the child span's `text-black`. Escalated the child color to `!text-black` (Tailwind's `!important` prefix) — cascade race resolved.
   - Phase pill sizing (fix #6 attempt didn't visibly land because the dashboard passes `size="lg"` to PhaseSelector and I'd been tweaking the `sm` variant, D'oh): rewrote the `lg` variant with `w-full` + fixed `h-[68px]`, so every pill fills the Phase column and is the same height whether it shows "No Phase" or a two-line "Umpire\n1d". Label bumped to `text-xl font-black`. Phase column widened to 220px.

**Deploy status:** Live. Latest deploy `dpl_C7jdRNjzNGe6B2SDNhhs8Jug6mBN` (`modern-tools-9irr4vzlq-henry-as-projects-88caed67.vercel.app`), ● Ready, alias verified. Session shipped 7 total prod deploys over ~90 minutes:
1. `dpl_E5Fx5CqT6yaRkMpetibvAHncLGQc` — fix #1 (appraiser-create 404).
2. `dpl_86KjAZc165Xanbj3TVT4tvdFoEgG` — fix #2 (reassign clears submitted_at).
3. `dpl_FEWsWZL19i9fVwmpHH35M72TM9uh` — fix #3 (Send Back removed, Approve → Close, inline actions).
4. `dpl_BQrAGAPDkatgopiuntiYZdLhShNn` — fix #4 (handling-appraiser sync, dialog polish).
5. `dpl_EKYeC3XzsxTBVez9QTXRCJBuCXCe` — fixes #5 + #6 (description sweep, CoA removed, contract relabeled, dashboard table rework).
6. `dpl_3YZvKiceG5KYEbRhF5AoKjshhT2X` — fix #7 partial (`!text-black` on Rush, workspace bubble removed, license summary un-boxed, wider Phase column).
7. `dpl_C7jdRNjzNGe6B2SDNhhs8Jug6mBN` (current) — fix #7 finale (lg variant sizing + w-full + h-[68px] so pills are uniform + bigger).

Rollback for the current build: `npx vercel promote https://modern-tools-7u0ltwhpl-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (dpl_3YZvKiceG5KYEbRhF5AoKjshhT2X). Pre-session baseline was `dpl_vv52dT8pirUjEgLW3qwUvdmBTo69`.

Verified via `npx tsc --noEmit` (clean) + `npm run build` (succeeded) before each deploy; alias re-checked after each. No end-to-end browser testing — Henry drove UI verification in real time, which caught the `size="lg"` vs `size="sm"` mixup that would have slipped past a code-only review.

**In progress / broken / unknowns:**
- One claim from earlier this session is still in a limbo state (reassigned before fix #2 landed): `assigned_to` = new appraiser, `submitted_at` still set from the previous appraiser. Recovery: re-select the same assignee on it via the completed queue or click the new bulk Close.
- ACV Contract labels are best-effort — Text Box 1_15 ("Claim Number") and Text Box 1_8 ("ACV Offer secondary") were guessed from position; Henry to verify by generating a test PDF and correcting any mislabels.
- Dashboard column count is now high (~13 for admins). If it looks cramped on smaller laptops, either drop a low-value column or make the header more compact.

**Next:** Nothing outstanding. Watch for feedback on the phase pill sizing and the contract fill mapping. If a "close without reassign" workflow ever comes back, the send-back API route is still intact even though the workspace button is gone.

**Changed:**
- `src/lib/supabase/history.ts` — self-assign on INSERT for non-admin creators (fix #1).
- `src/app/api/claims/[id]/assign/route.ts` — clear `submitted_at`/`submitted_by` on every reassign (fix #2).
- `src/app/api/claims/[id]/approve/route.ts` — drop the "must be submitted" guard; refuse only if already closed (fix #3).
- `src/components/claim/ClaimWorkspace.tsx` — remove Send Back button + `handleSendBack`; rename Approve toolbar button to "Close Claim" + rewrite its confirm dialog; update the submit-confirm and read-only-banner copy to mention "close or reassign" instead of "approve or send back" (fix #3).
- `src/components/claims-table.tsx` — new `perRowClose` prop that renders a green Close button per row with a confirm dialog + service-role `POST /api/claims/[id]/approve`; fixed stale Reassign confirm copy (fix #3).
- `src/app/completed-assignments/completed-client.tsx` — pass `perRowClose`.
- `src/app/page.tsx` — pass `perRowReassign={isAdmin}` and `perRowClose={isAdmin}` to the dashboard's open-claims table.

**Deploy status:** Live. Three deploys total this session:
- Final (current): `dpl_FEWsWZL19i9fVwmpHH35M72TM9uh` (`modern-tools-91jh2zuxg-henry-as-projects-88caed67.vercel.app`), ● Ready, alias `modern-tools-rho.vercel.app` verified.
- Rollback command for the current build:
  `npx vercel promote https://modern-tools-930pk83yw-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (dpl_86KjAZc165Xanbj3TVT4tvdFoEgG — the mid-session deploy, has fix #1 + #2 only).
- Earlier good build (pre-session): `dpl_vv52dT8pirUjEgLW3qwUvdmBTo69` (`modern-tools-qcvvec6ij…`).

Verified via `npx tsc --noEmit` (clean) + `npm run build` (succeeded) before each deploy. Alias re-checked after each. Browser end-to-end not run.

**In progress / broken / unknowns:**
- The specific claim Henry reassigned before fix #2 shipped is still stuck: `assigned_to` = new appraiser, `submitted_at` = old appraiser's timestamp. Simplest recovery now that fix #2 is live: re-select the same assignee in the completed queue's per-row Reassign dropdown — the API will now clear `submitted_at` and the claim will drop out of the queue. Alternative: hit the new per-row Close button.
- Dashboard column count now ~13 for admins (checkbox + 8 base + Assigned To + Reassign + Close + Phase). Fine on wide screens; possibly cramped on smaller laptops. If Henry flags, consolidate Reassign + Close into a single Actions column.

**Next:** Watch for feedback on the new dashboard columns; if any live edge case surfaces where an admin needs to un-submit *without* reassigning, that's the case for un-hiding a Send Back path (route is still in place).

---

## 2026-08-29 (session 5) — Phase UI polish, license Type, Reports hub + Contract fill, description sweep

**Worked on:** Long iteration session on top of session 4. Roughly chronological:

1. **Dashboard row phase editing + admin-only guard.** Reused the workspace `PhaseSelector` inline in the dashboard Status column for admins so they can set/change phases without opening the claim. API tightened to `requireAdmin()` (was `requireClaimAccess`).
2. **Phase config admin CRUD + polish.** Full admin editor at `/admin/settings/status-phases` (add/edit/archive/delete, 5-color picker, DELETE refuses when in use). Seeded a new **Hold** phase (blue) via `migration-phase-configs-hold.sql`; changed **Umpire** color from red → amber (so Rush stays the only red). Phase pill got: no icon, "No Phase" placeholder (nowrap), stacked-vertical label+age layout. Filter buttons always use the phase color (was gray when inactive).
3. **License Type field.** New nullable `license_type` text column on `appraiser_licenses` via `migration-license-type.sql`. Admin-only free-text — surfaced only in Settings → Users → Licenses tab, never in the claim workspace's licensing badges. Also earlier in the session: license status pill sizing, State dropdown replaced free-text input, dropped Issued column.
4. **State licensing UX overhaul.** Top badge centered between Print and workflow buttons, no state code, just LICENSED (green) / NOT LICENSED (red) / FORBIDDEN (red). Dashboard row shows green dot when handler licensed, red dot when not (was always red). License filter dropdown removed from the claims-table search bar.
5. **Danger Zone add + revert.** Added a big red "Delete Claim" card at the bottom of the Claim Info tab, then reverted per Henry — kept the existing small toolbar Delete button.
6. **Icon sweep.** Removed decorative Lucide icons from claim workspace status pills, inline warnings (duplicate/PDF/decode error), and comp cards (Gauge/MapPin). Kept AlertCircle in bigger banners + all functional button icons.
7. **Bigger bolder toolbar phase pill.** Added `size="lg"` variant to `PhaseSelector` — text-lg font-black label, border-2, larger padding. Then Henry moved it: workspace toolbar pill retired entirely, dashboard row bumped to `size="lg"` instead.
8. **Reports hub tab.** New "Reports" tab in the CLAIM_TABS row next to Guidelines (step 15). Cards for Invoice / ACV Contract / Certificate of Appraisal. Invoice routes to the existing invoice tab (step 12), which was pulled out of the TOOL_TABS row since it's now surfaced via the hub. Two new PDF templates copied to `public/` (`acv-contract-template.pdf`, `certificate-of-appraisal-template.pdf`).
9. **ACV Contract fill flow.** New `/claims/[id]/contract` route with server page + client. Grid of inputs for all 47 form fields (labeled by generic field name — the template's fields don't have semantic names yet). Auto-populates a few obvious defaults (today's date, best-guess mappings for insured/vin/vehicle). New API `/api/acv/generate-contract-pdf` fills the template and returns the PDF for download. See PDF field-mapping punch-list item #1 below — until Henry renames fields in Acrobat, the fill flow's inputs are labeled by generic names like "Text Box 1_5".
10. **Certificate of Appraisal — NOT fillable yet.** The PDF has zero AcroForm fields. Hub card still opens the blank template. Needs Henry to add form fields in Acrobat before we can build the fill flow.
11. **Perf fix for phase configs.** Was firing one identical Supabase query per admin's PhaseSelector row (~40+ concurrent), stacking behind cold connections and blanking the phase column for ~15s after navigating back from a claim. Added 60s TTL cache + in-flight promise dedup to `fetchStatusPhaseConfigs`; admin editor busts the cache on load.
12. **Description sweep.** Removed helper-text descriptions across the app per Henry's ask (this is supposed to be professional): estimate/estimate-review "Results save to this claim" lines, invoice template note, documents dropzone description, mileage rate description, summary auto-save note, report-selection card description, reports hub top paragraph + per-card descriptions.

**Changed (30+ commits since 56917ff):**

Migrations:
- `supabase/migration-phase-configs-hold.sql` (+ rollback) — NEW: adds Hold phase (blue), sets Umpire → amber
- `supabase/migration-license-type.sql` (+ rollback) — NEW: adds `license_type` column to `appraiser_licenses`

New pages / routes:
- `src/app/admin/settings/status-phases/page.tsx` + `status-phases-client.tsx` — NEW: phase configs admin CRUD
- `src/app/api/admin/status-phase-configs/route.ts` + `[code]/route.ts` — NEW: phase config CRUD API (delete refuses when in use)
- `src/app/api/admin/users/[id]/reset-password/route.ts` + `change-email/route.ts` — NEW: admin password/email actions
- `src/app/claims/[id]/contract/page.tsx` + `contract-client.tsx` — NEW: Contract fill flow (server page + client)
- `src/app/api/acv/generate-contract-pdf/route.ts` — NEW: fills `public/acv-contract-template.pdf` with per-field try/catch, flattens, returns as download

New components:
- `src/components/claim/reports-hub-tab.tsx` — NEW: Reports hub with 3 cards
- `public/acv-contract-template.pdf` + `public/certificate-of-appraisal-template.pdf` — NEW: copied from Henry's Dropbox

Modified (highlights):
- `src/components/claim/ClaimWorkspace.tsx` — retired workspace PhaseSelector, dropped Invoice from TOOL_TABS, added Reports step 15 + `<ReportsHubTab>` render, cleaned up decorative icons in duplicate/PDF/decode warnings + comp cards, dropped unused Gauge/MapPin imports
- `src/components/claims-table.tsx` — dashboard row PhaseSelector size='lg', license filter dropdown removed
- `src/components/claim/phase-selector.tsx` — added `size` prop with 'sm'/'lg' variants, no Tag icon, "No Phase" placeholder, stacked label+age, whitespace-nowrap, active state uses phase-color bg + black text
- `src/app/page.tsx` — colored filter buttons w/ black text, phase-configs fetch logged
- `src/lib/supabase/status-phase-configs.ts` — 60s TTL cache + in-flight dedup + `invalidateStatusPhaseConfigsCache()`
- `src/lib/supabase/appraiser-licenses.ts` — added `licenseType` field
- `src/app/api/admin/appraiser-licenses/{route,[id]/route}.ts` — accept `licenseType`
- `src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx` — Type column + input, dropped Issued, State dropdown, proper Save/Cancel buttons, wider layout
- `src/app/admin/settings/users/[id]/_tabs/info-tab.tsx` — Change Email + Reset Password modal actions
- `src/app/admin/settings/_settings-nav.tsx` — added "Status Phases" nav entry with Tag icon
- `src/app/api/claims/[id]/phase/route.ts` — tightened to `requireAdmin()`
- `src/components/claim/state-licensing-top-badge.tsx` — dropped state code + decorative icons, LICENSED/NOT LICENSED/FORBIDDEN only
- `src/components/claim/handling-appraiser-license-summary.tsx` — dropped decorative Check/AlertTriangle
- Description sweep touched: `estimate-tab.tsx`, `estimate-review-tab.tsx`, `invoice-fields.tsx`, `documents-tab.tsx`, `ClaimWorkspace.tsx` (mileage/summary/report-selection notes)

**Deploy status:**

- **LIVE now:** `dpl_vv52dT8pirUjEgLW3qwUvdmBTo69` → `https://modern-tools-qcvvec6ij-henry-as-projects-88caed67.vercel.app`. Alias `modern-tools-rho.vercel.app` flipped, `● Ready`.
- **Rollback (one step back, pre-description-sweep):** `npx vercel promote https://modern-tools-<pre-88f5a98-url> --scope henry-as-projects-88caed67 --yes` — capture from `vercel inspect` history if needed. Practically, session 4's ship (`dpl_ACT9SVnXsmaU3wobPgNrTzaCgtWE`) is a stable point.

**Migrations RUN this session (confirmed / assumed):**
- `migration-phase-configs-hold.sql` — assumed run since Henry set phases from dashboard
- `migration-license-type.sql` — **STATUS UNKNOWN** — verify before assuming Type field will persist
- `migration-status-phases.sql` — from earlier today, confirmed run

**In progress / broken / unknowns:**

- **HENRY OWES US: PDF field mapping for the Contract + Certificate.** This is why the Contract fill form shows inputs labeled "Text Box 1_5" etc. — the PDF's form fields don't have semantic names. Steps:
  1. Open `public/acv-contract-template.pdf` in Adobe Acrobat
  2. Click each field and rename to something meaningful like `insured_name`, `claim_number`, `date_of_loss`, `vin`, `year_make_model`, etc.
  3. Save the file, re-copy over `public/acv-contract-template.pdf`
  4. Send me the list of field names (or just push the updated PDF)
  5. Same procedure for `public/certificate-of-appraisal-template.pdf` — BUT that PDF has ZERO form fields, so first ADD form fields via Acrobat's Prepare Form tool at the right positions, then name them semantically
  6. Once field names are in, I'll wire the fill flow to auto-populate everything from claim data and hide the generic-name banner
- **License Type migration may not have been run** — if the Type column doesn't save, that's why. See migrations-run block above.
- **Existing uncommitted files in `git status`** (assignment sheet, guidelines tab, insurance-guidelines lib, admin export/import, business-days, etc.) untouched this session — still inherited debt from earlier sessions.

**Next (punch list):**

1. **[NEEDS HENRY] Rename PDF form fields for Contract and add fields to Certificate.** (See "In progress" above.) Once done, wire auto-fill from claim data on both flows.
2. Loss of Use report — new report type, design TBD (carryover).
3. Umpire branch of appraisal-clause process (carryover).
4. Messages for summary page — thread messaging attached to a summary (carryover).
5. RTA declaration — new document/report type, design TBD (carryover).
6. Estimate dispute rework — the `/estimate-dispute` flow needs rework (carryover).
7. Email notifications — SMTP via Bluehost, pending Henry providing SMTP creds (carryover). Would unlock license expiration email alerts + phase-change emails.
8. Consolidate `/profile` and `/my-profile` — one profile page with editable name/password + read-only fees/licenses/docs (carryover from session 2).
9. Automation page cleanup was already handled by consolidating per-user permission toggles into the profile.

---

## 2026-08-29 (session 4) — Status phase feature: phase configs, dashboard pill+filter, workspace selector+delete

**Worked on:** Full status phase feature. Claims can now be tagged with a status phase (pending_payment / rush / umpire, admin-configurable). Phases show as colored pills on the dashboard. Admin can filter the dashboard to phased claims. Phase changes from inside the claim workspace post an auto-message. Elapsed time since phase was set is shown. Delete button moved from the dashboard row into the claim workspace toolbar (admin only).

**Changed (4 commits, on top of state-licensing work):**

- `src/lib/supabase/status-phase-configs.ts` — NEW: `fetchStatusPhaseConfigs`, `formatPhaseAge`, `phaseColorClasses` helpers.
- `src/lib/supabase/history.ts` — extended `ACVHistoryEntry` with `statusPhase` / `statusPhaseSetAt` fields; updated `rowToEntry` + `fetchACVHistory` SELECT to include both new columns.
- `src/app/api/claims/[id]/phase/route.ts` — NEW: POST endpoint to set/clear phase; validates code against `status_phase_configs`, patches `acv_history`, posts auto-message.
- `src/components/claim/phase-selector.tsx` — NEW: compact dropdown component for the claim workspace toolbar; fetches configs on mount, shows pill + age when active, POSTs phase changes.
- `src/components/claims-table.tsx` — add `statusPhaseConfigs` + `phaseFilter` props; Phase column at far right with colored pill + age; phaseFilter applied in `filtered` useMemo; delete column, delete state, and delete ConfirmDialog removed (`onDeleted` made optional).
- `src/app/page.tsx` — fetch `statusPhaseConfigs` on mount; `phaseFilter` state; compact phase filter buttons below Messages link (toggle/clear, colored-active).
- `src/components/claim/ClaimWorkspace.tsx` — `statusPhase` / `statusPhaseSetAt` state hydrated from load; `PhaseSelector` mounted in toolbar after Print; admin-only Delete button in workflow group; `runDeleteClaim` handler; `ConfirmDialog` for delete; imports `Trash2` + `deleteACVHistory`.

**Deploy status:** NOT deployed. tsc and build both pass clean (0 errors). Requires Henry to run `supabase/migration-status-phases.sql` (committed at c10c6d8) first, then deploy.

**In progress / broken / unknowns:**

- **Migration not yet run.** The `status_phase` + `status_phase_set_at` columns on `acv_history` and the `status_phase_configs` table must be created first. Until then: `fetchStatusPhaseConfigs` returns `[]` (no filter buttons rendered, no Phase column rendered), `PhaseSelector` renders nothing, and the phase API route will 400 on every call.
- **Admin settings for phase CRUD not built.** The migration seeds 3 phases (Pending Payment / Rush / Umpire). Adding/editing/archiving phases requires direct SQL or a future admin UI page.
- State licensing feature from session 3 also still pending migration + deploy.

**Next:** Henry runs both pending migrations (state-licensing + status-phases), then deploy. Smoke test: (1) phase filter buttons appear on dashboard, (2) opening a claim shows Phase dropdown, (3) selecting a phase shows pill on dashboard row with age, (4) messages tab shows auto-message, (5) Delete button visible on claim workspace (admin only), confirm dialog works, redirects to dashboard.

---

## 2026-08-29 (session 3) — State licensing feature: licensed-states admin, dashboard badge, claim workspace panel

**Worked on:** Full state licensing feature. Admins can mark which US states require an appraiser license (`Admin > Settings > Licensed States`). The dashboard claims table shows a "State" column with a colored badge (green Licensed / red Not Licensed / amber Unassigned) and a filter dropdown. The Claim Info tab shows a "State Licensing" panel with appraiser's license details. The admin Licenses tab and My Profile now show `status` (active/pending/expired) and issued date.

**Changed (6 commits, on top of ba18f33 migration):**

- `src/lib/claim-state.ts` — NEW: `extractLossState()` regex helper (ZIP-before primary, comma-trail fallback)
- `src/lib/us-states.ts` — NEW: all 50 states + DC constant array
- `src/lib/supabase/licensed-states.ts` — NEW: `fetchLicensedStates()` + `isLicensedState()` helpers
- `src/lib/supabase/appraiser-licenses.ts` — extended `AppraiserLicense` + `AppraiserLicenseRow` with `status`/`issuedDate`; added `isLicenseValid()` helper
- `src/app/api/admin/licensed-states/route.ts` — NEW: POST to create licensed state entry
- `src/app/api/admin/licensed-states/[state]/route.ts` — NEW: PATCH + DELETE for licensed state entries
- `src/app/api/admin/appraiser-licenses/route.ts` — accept `status` + `issuedDate` on POST (default status='active')
- `src/app/api/admin/appraiser-licenses/[id]/route.ts` — accept `status` + `issuedDate` on PATCH
- `src/app/admin/settings/licensed-states/page.tsx` + `licensed-states-client.tsx` — NEW: admin table with add/edit/delete for state licensing requirements
- `src/app/admin/settings/_settings-nav.tsx` — added Licensed States nav item (ShieldCheck icon)
- `src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx` — added status dropdown + issued_date input to add/edit form; `StatusPill` component in read view
- `src/app/my-profile/my-profile-client.tsx` — `SmallStatusPill` shows pending/expired badge next to expiration alert
- `src/components/claims-table.tsx` — new State column with `StateCell` badge; license filter dropdown; accepts `licensedStates` + `licensesByUser` props
- `src/app/page.tsx` — fetch `licensedStates` on mount; fetch licenses (all for admin, own for appraiser) after profile resolves; pass to `ClaimsTable`
- `src/components/claim/state-licensing-panel.tsx` — NEW: panel showing loss state + licensing status (neutral/amber/green/red); admin roster of licensed appraisers
- `src/components/claim/ClaimWorkspace.tsx` — mount `StateLicensingPanel` in Claim Info tab (existing claims only)

**Deploy status:** NOT deployed yet — tsc and build both pass clean. Requires Henry to run `supabase/migration-state-licensing.sql` (ba18f33) first, then deploy.

**In progress / broken / unknowns:**

- **Migration not yet run.** The `licensed_states` table and `status`/`issued_date` columns on `appraiser_licenses` must be created first. Migration SQL is in ba18f33 (`supabase/migration-state-licensing.sql`). Until the migration runs, any page that touches those tables will get a 42703 error (harmless — licensed-states fetch returns `[]`, panel stays hidden).
- **StateLicensingPanel fetches independently** — two Supabase calls on every Claim Info tab view. Fine for now; if perf is a concern later, lift these fetches to ClaimWorkspace state.
- `isLicenseValid()` logic: `status === 'active' AND expirationDate > today`. The existing `getLicenseAlertLevel()` expiration-based alert badges still work independently of status — they show time-to-expiration regardless. This is intentional: a license can be `status=active` but alerting, or `status=pending` and not shown as valid.

**Next:** Run migration + deploy, then smoke test: (1) add a licensed state in admin, (2) open a claim with a matching owner address state, verify panel shows, (3) add a valid license for the assigned appraiser in that state, verify green badge appears on dashboard and in panel.

---

## 2026-08-29 (session 2) — Appraiser Profiles: 5-tab admin page, fee catalog, license expiration alerts, permissions consolidation

**Worked on:** Full appraiser profile system. Every user (appraiser + admin) now has a dedicated profile page at `Settings > Users > [click name]` with 5 tabs — **Information** (name/phone/address/active), **Permissions** (Create claims / Reassign / Edit Info / Auto status requests), **Fees** (per-user amounts across a 43-item shared catalog), **Licenses** (multi-state with expiration tracking), and **Documents** (private storage bucket for W9s, license scans, etc.). Every user also gets a read-only `/my-profile` page (4 tabs, no permissions). Added `/admin/settings/fee-catalog` for editing the shared catalog. License expirations trigger in-app alerts at 90/30/7/expired thresholds on the dashboard for the current user (admins see all users' alerts). **Consolidated all per-user permission toggles into the profile** — deleted the Access + Automation admin pages and their site-wide master toggles entirely. Migration backfills every user's per-user column from the current global value. Inactive users are filtered out of assignment + messages recipient pickers but keep their historical assignments visible.

Full spec + plan committed with the change: `docs/superpowers/specs/2026-08-29-appraiser-profiles-design.md`, `docs/superpowers/plans/2026-08-29-appraiser-profiles.md`.

**Changed (~27 commits):**

- `supabase/migration-appraiser-profiles.sql` + `-rollback.sql` — NEW: extends `profiles` with phone/address/is_active, creates 4 tables (`fee_catalog` seeded with 43 rows, `appraiser_fees`, `appraiser_licenses`, `appraiser_documents`), creates the `appraiser-documents` private storage bucket + RLS inline (no Dashboard step required), backfills per-user permissions from the old site-wide toggles then deletes those two `site_settings` rows. Uses `public.is_admin()` helper and `drop policy if exists` guards for idempotency.
- `src/lib/supabase/profiles.ts` — added phone/addressStreet/City/State/Zip + isActive to Profile type + row conversion
- `src/lib/supabase/fee-catalog.ts` — NEW: browser fetch helper
- `src/lib/supabase/appraiser-fees.ts` — NEW: per-user fee amount map
- `src/lib/supabase/appraiser-licenses.ts` — NEW: fetch helpers + `getLicenseAlertLevel(expiration, today)` utility with cadence (>90=none / 31-90=notice / 8-30=warning / 1-7=urgent / ≤0=expired) + `isBannerLevel()` helper
- `src/lib/supabase/appraiser-documents.ts` — NEW: browser fetch helper
- `src/app/api/admin/users/[id]/route.ts` — extended PATCH to accept phone/address/is_active
- `src/app/api/admin/fee-catalog/route.ts` + `[id]/route.ts` — NEW: catalog CRUD (DELETE refuses if any user has amounts; force-archive instead)
- `src/app/api/admin/appraiser-fees/route.ts` — NEW: bulk upsert route (amount=null triggers delete)
- `src/app/api/admin/appraiser-licenses/route.ts` + `[id]/route.ts` — NEW: license CRUD, state auto-uppercased
- `src/app/api/admin/appraiser-documents/upload/route.ts` + `[id]/route.ts` — NEW: multipart upload → storage + metadata, DELETE removes both
- `src/app/api/appraiser-documents/[id]/download/route.ts` — NEW: 60s signed URL, self or admin
- `src/app/admin/users/users-admin-client.tsx` — name became clickable Link; added Active/Inactive badge column; red-dot next to name when any license in warning/urgent/expired state
- `src/app/admin/settings/users/[id]/page.tsx` + `profile-detail-client.tsx` — NEW: profile detail shell with 5-tab router + back link
- `src/app/admin/settings/users/[id]/_tabs/info-tab.tsx` — NEW: Name/Phone/Address form + Active checkbox with explanation
- `src/app/admin/settings/users/[id]/_tabs/permissions-tab.tsx` — NEW: 4 toggle switches with optimistic updates
- `src/app/admin/settings/users/[id]/_tabs/fees-tab.tsx` — NEW: 43-row catalog table, dirty-tracked bulk save button showing count of pending changes
- `src/app/admin/settings/users/[id]/_tabs/licenses-tab.tsx` — NEW: inline add/edit/delete, alert badges computed live from expiration_date
- `src/app/admin/settings/users/[id]/_tabs/documents-tab.tsx` — NEW: upload/download/delete with optional Kind (W9/License/Contract/Insurance/Other) datalist
- `src/app/admin/settings/fee-catalog/page.tsx` + `fee-catalog-client.tsx` — NEW: add/edit/archive/delete fee types with sort_order + code (immutable after create)
- `src/app/my-profile/page.tsx` + `my-profile-client.tsx` — NEW: read-only 4-tab self view for every authenticated user
- `src/components/license-expiration-banner.tsx` — NEW: session-dismissable dashboard banner. Self view for appraisers (own licenses); admin view shows all users. Cadence semantics: banner is always present while a license is in an alert window (no cron; live evaluation)
- `src/app/page.tsx` — mounted `<LicenseExpirationBanner />` at top of dashboard; also removed the now-defunct `fetchSiteSetting('allow_regular_create_claims')` — per-user `canCreateClaims` is now the only gate
- `src/components/claim/ClaimWorkspace.tsx` — filtered reassign picker by `isActive` at render (kept full list in state so already-assigned inactive users still resolve to names); removed the defunct `allowCreateGlobal` check
- `src/components/claim/messages-tab.tsx` — filtered recipient picker options by `isActive` at the useMemo layer
- `src/app/admin/settings/access/` — **DELETED entire folder** (page.tsx + access-client.tsx); replaced by per-user Permissions tab
- `src/app/admin/settings/automation/` — **DELETED entire folder** (page.tsx + automation-client.tsx); replaced by per-user Permissions tab
- `src/app/admin/settings/_settings-nav.tsx` — removed Access + Automation nav items, added Fee Catalog (DollarSign icon); Users / Fee Catalog / Guidelines / Data
- `src/components/app-header.tsx` — dropdown menu updated: "My Profile" (`/my-profile`) + "Account & Password" (`/profile`, the pre-existing password/name page — kept reachable so users can still change their password)
- `src/lib/supabase/site-settings.ts` — `SiteSettingsKey = never` (no site-settings keys currently in use)
- `src/app/api/cron/status-requests/route.ts` — removed the dead `site_settings.auto_status_requests_enabled` query; per-user `auto_status_requests_override` is the only source of truth after migration, null treated as OFF

**Deploy status:**

- **LIVE now:** `dpl_B82ThBAX89uLAycGDQa5DhEx1686` → `https://modern-tools-14oegqik7-henry-as-projects-88caed67.vercel.app`. Alias `modern-tools-rho.vercel.app` flipped, verified `● Ready`.
- **Rollback (to yesterday's Eagle View build):** `npx vercel promote https://modern-tools-ef2sikn6f-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes`

**Migrations RUN this session (confirmed by Henry):**
- `supabase/migration-appraiser-profiles.sql` — verified: all 7 verification checks returned 1 (bucket exists, all tables exist, profiles.phone + is_active exist), fee_catalog=43 rows, site_settings orphans=0. Pre-migration site_settings values captured for rollback (`allow_regular_create_claims=true`, `auto_status_requests_enabled=false`).

**Method notes:**

- Used subagent-driven-development to execute the 23-task plan. Batched aggressively for speed — combined tasks by file-group (data layers as one batch, API routes as one batch, profile detail + 5 tabs as one batch, etc.). Only Task 1 (migration SQL) got the full spec-review + code-quality-review loop; caught 3 Important issues (use `is_admin()` helper, guard backfill re-runs, add drop-policy-if-exists) and re-verified before ship. Subsequent tasks relied on tsc + build gates plus a spot-check per task.
- Started with the plan calling for a manual Supabase Dashboard step to create the `appraiser-documents` bucket. Henry asked mid-execution to eliminate the manual step; folded the bucket creation + RLS + verification-check into the migration SQL so it's now a single SQL script with zero dashboard clicks.
- One implementer subagent caught a subtle dual-use pattern in `ClaimWorkspace.fetchAllProfilesBrowser` and correctly filtered at the render point (not at fetch/storage) so inactive users' names still resolve when they're on historical assignments — but can't be picked for new ones.
- Discovered the pre-existing `/profile` page (name + password change) mid-execution and added an "Account & Password" nav entry so it stays reachable alongside the new `/my-profile` read-only view. Longer term the two pages should be consolidated.

**In progress / broken / unknowns:**

- **Not yet manually smoke-tested in prod.** Build + tsc pass clean and the migration verification returned all-1s, but nothing has been actually clicked through by a human yet. Full smoke checklist is in the plan's Task 23 Step 6 — Henry, when you have a minute, run through: (1) open a user's profile page, verify all 5 tabs render, (2) add a license with expiration 5 days out and check the red banner appears on dashboard + red dot next to name in Users, (3) upload a doc as admin and confirm the appraiser can download it from their `/my-profile`, (4) toggle a user Inactive and confirm they disappear from the reassign picker but their existing assigned claim still shows their name.
- **`/profile` vs `/my-profile` overlap.** The old `/profile` page (password + name) is kept as "Account & Password" nav entry. UX is fine but there are two profile pages in the menu. Consolidate later — either move password change into `/my-profile` or make `/my-profile` editable.
- **Fee catalog admin permissions:** all admins can add/rename/archive/delete fee types. No audit trail. Fine for now given team size but flag if scaling.
- **License expiration is passive.** No email or push notification — banner only. If Henry wants email alerts, that's parked behind the SMTP creds carryover.
- Existing uncommitted files in `git status` (assignment sheet + settings redesign work from earlier sessions) still untouched this session; still not committed.

**Next (punch list — carryover from last session):**

1. **Loss of Use report** — new report type. Design TBD.
2. **Umpire claims** — support for the umpire branch of the appraisal-clause process. Design TBD.
3. **Messages for summary page** — thread messaging attached to a summary.
4. **RTA declaration** — new document/report type. Design TBD.
5. **Estimate dispute rework** — rework the `/estimate-dispute` flow. Scope TBD.
6. **Email notifications** — SMTP via Bluehost, parked pending Henry providing SMTP creds. Would unlock license expiration email alerts on top of the in-app banner.
7. **Consolidate `/profile` and `/my-profile`** — one profile page with editable name/password + read-only fees/licenses/docs.

---

## 2026-08-29 — Eagle View assignment parser + Claimant block + auto-message on Notes

**Worked on:** Extended the "upload PDF to auto-fill Claim Info" flow to recognise Eagle View Enterprises assignment PDFs alongside the existing Modern Appraisers format. Refactored the two existing parser entry points (client `src/lib/parse-claim-pdf.ts` and orphaned server `/api/acv/parse-claim/route.ts`) to route through a new shared dispatch at `src/lib/acv/parsers/`. Added an optional **Claimant Contact** block to `ClaimInfo` (form + type — no schema migration, jsonb) so PDFs with a separate claimant party (Party=Claimant on the Eagle View form) populate distinct fields from the Insured. Notes captured from Eagle View PDFs auto-post to the claim's Messages tab as an amber-badged "Auto" message from `Modern Tools (Auto)` on first save, with empty recipients (informational only — no unread badge for anyone).

Full spec + plan committed with the change: `docs/superpowers/specs/2026-08-29-eagle-view-assignment-parser-design.md`, `docs/superpowers/plans/2026-08-29-eagle-view-assignment-parser.md`.

**Changed:**

- `src/lib/acv/types.ts` — added 4 optional fields to `ClaimInfo`: `claimantName`, `claimantPhone`, `claimantEmail`, `claimantAddress` (all backward-compatible, non-breaking)
- `src/lib/acv/parsers/types.ts` — NEW: shared `ParsedClaim` interface + `ClaimFormat = 'modern-appraisers' | 'eagle-view'` discriminator
- `src/lib/acv/parsers/detect.ts` — NEW: `detectFormat(text)` — signature phrase check for `Eagle View Enterprises` OR both `Admin Data` + `Appraiser Details` bare-line section headers
- `src/lib/acv/parsers/modern-appraisers.ts` — NEW: extracted `parseModernAppraisers()` verbatim from the pre-existing `parseClaimText` (behavior-preserving move, adds `format` + empty claimant/notes fields)
- `src/lib/acv/parsers/eagle-view.ts` — NEW: `parseEagleView()`. Extracts admin fields (Claim #, Client → insuranceCompany, Party → clientType, Date of Loss), Vehicle fields, splits the 4 party blocks by fixed order (`Company Name` marker → Vehicle Location, Claimant, Insured, Owner), pulls names/addresses/phones/emails, spans the phone value across the newline that separates label-type from digits, and extracts Notes text (strips leaked party-block field lines that leak past the Notes header when Notes appears mid-document like in Sample 2). Explicit `MM/DD/YYYY` regex parse rather than `new Date()` (implementation-defined for non-ISO strings). Landed with two review-loop fixes: (1) Bug 1 initial fix (skipping Notes by offset) dropped Sample 2's notes entirely — reverted and relied purely on the strengthened line filter; (2) Bug 2 phone truncation caught before shipping.
- `src/lib/acv/parsers/index.ts` — NEW: `parseClaim(text)` dispatch that detects format and routes to the correct parser
- `src/lib/parse-claim-pdf.ts` — REFACTOR: 269 lines → 67 lines. Now only browser-side PDF text extraction (pdfjs-dist + tesseract OCR fallback) → `parseClaim(text)`. All parser constants and helpers deleted (they live in `parsers/modern-appraisers.ts` now). Exported surface preserved so `ClaimWorkspace` import is untouched.
- `src/app/api/acv/parse-claim/route.ts` — REFACTOR: 167 lines → 39 lines. Symmetric with the client entry — server-side text extract (unpdf) → `parseClaim(text)`. Minor behavior change: server route now returns `'N/A'` for empty fields (matching client behavior via shared parser) instead of bare empty strings. Route is currently unused by any UI so no user impact.
- `src/app/api/claims/[id]/auto-message/route.ts` — NEW: service-role POST endpoint. Body `{ body, senderName }` — auth-gated via `requireClaimAccess`, uses `SUPABASE_SERVICE_ROLE_KEY` to insert a `messages` row with `sender_id: null`, `recipient_ids: []`, `is_auto_request: true`. Message body max 4000 chars. Auto-message never appears in anyone's unread queue (queue filters `recipient_ids @> [uid]`, empty array never matches).
- `src/components/claim/ClaimWorkspace.tsx` — 4 edits: (1) `ClaimInfoForm` gains an optional `onParsedNotes?: (notes: string) => void` prop; (2) `handlePdfUpload` merges the 4 claimant fields into the parsed onChange call and fires `onParsedNotes?.(data.notes || '')`; (3) new "Claimant Contact" form section (Name / Phone / Email / Address, 2-col grid matching existing Owner section) inserted between Owner and Insurance sections; (4) parent gets a `pendingAutoNoteRef` populated by the callback, and `createClaim` fire-and-forgets `POST /api/claims/[id]/auto-message` immediately after `router.replace` when the ref has content (cleared before fetch to prevent double-post on rapid clicks).
- `src/components/claim/messages-tab.tsx` — guard the `→ recipientNames` render behind `recipientNames.length > 0` so the auto-message's empty recipient list doesn't render a bare arrow.
- `docs/superpowers/specs/2026-08-29-eagle-view-assignment-parser-design.md` — NEW: full design doc
- `docs/superpowers/plans/2026-08-29-eagle-view-assignment-parser.md` — NEW: 12-task implementation plan

**Follow-up tweak (same session):** Henry noted that Eagle View is Sedgwick's assignment platform — every PDF that comes through it is a Sedgwick sub-assignment. Updated `src/lib/acv/parsers/eagle-view.ts` to hardcode `clientName: 'Sedgwick'` instead of leaving it blank. `insuranceCompany` still comes from the PDF's `Client` field (e.g. `Sedgwick Claims Management Servic`, `USAA Sedgwick CAT`) — distinct from `clientName` which is the TPA. Second prod deploy this session for the tweak.

**Deploy status:**

- **LIVE now:** `dpl_9iLvXpFo8wzVXr8dDfte4m3vM4Pb` → `https://modern-tools-ef2sikn6f-henry-as-projects-88caed67.vercel.app`. Alias `modern-tools-rho.vercel.app` flipped, verified. (Includes the Sedgwick clientName tweak.)
- **Rollback (to the first Eagle View deploy without the Sedgwick tweak):** `npx vercel promote https://modern-tools-pq1bot0tz-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes`
- **Rollback (to yesterday's build, pre-Eagle-View):** `npx vercel promote https://modern-tools-o7gdo79x3-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes`

**Migrations RUN this session:** none. Everything lives in existing `acv_history.claim` jsonb (new optional fields) and existing `messages` table (auto-message insert uses existing columns).

**Method notes:**

- Used subagent-driven-development to execute the 10 code tasks — dispatched a fresh implementer subagent per task (haiku for mechanical tasks, sonnet for the two complex tasks — Eagle View parser and ClaimWorkspace wiring). Reviewer subagents did spec + quality passes after each; caught two critical bugs in the Eagle View parser (Notes bleed on Sample 2 + phone truncation) before ship. One follow-up fix loop when the initial Bug 1 fix over-corrected. All build gates passed clean each round (`tsc --noEmit` + `npm run build`).
- Skipped local manual verification and went straight to prod deploy on Henry's explicit ask ("bro why aren't you just deploying").

**In progress / broken / unknowns:**

- **Not yet manually verified against real PDFs.** All logic traced through by reviewer subagents against the actual raw text extractions of both sample PDFs, but nothing has been actually uploaded through the live UI yet. Test on prod with the two samples on Henry's Desktop (`4A2608CJ01D0002 Assignments.pdf`, `003197519000000819001 Assignment.pdf`). If any field is wrong, iterate on `src/lib/acv/parsers/eagle-view.ts`.
- **Auto-message flow depends on `SUPABASE_SERVICE_ROLE_KEY` env var in Vercel.** Existing routes (cron, admin) already use it so it should be set — if missing the route logs `Server misconfigured` and returns 500. Client swallows the error (fire-and-forget with `.catch`), so claim creation still succeeds — the message just doesn't post. Worth confirming on the first Eagle View upload in prod.
- **Only 2 Eagle View sample PDFs seen.** Field-mapping is fitted to these two. Other insurers routed through the Eagle View platform may render fields slightly differently — first mismatch will need a small tweak.
- Existing uncommitted files in `git status` (assignment sheet + settings redesign work from earlier sessions) untouched this session; still not committed.

**Next (punch list — carryover from last session):**

1. **Loss of Use report** — new report type. Design TBD.
2. **Umpire claims** — support for the umpire branch of the appraisal-clause process. Design TBD.
3. **Messages for summary page** — thread messaging attached to a summary.
4. **RTA declaration** — new document/report type. Design TBD.
5. **Estimate dispute rework** — rework the `/estimate-dispute` flow. Scope TBD.
6. **Automation page cleanup** — apply the search-first per-appraiser pattern to Automation settings.
7. **Email notifications** — SMTP via Bluehost, parked pending Henry providing SMTP creds.

---

## 2026-08-27 (session 2) — Repo cleanup + dashboard perf + audit-bundle ship + per-user create-claims

**Worked on:**

1. **Repo folder cleanup.** Moved all root-level `supabase-*.sql` into a new `supabase/` subfolder and dropped the redundant `supabase-` prefix (e.g. `supabase-migration-roles.sql` → `supabase/migration-roles.sql`). Added a `getting-started/` folder with `launching-claude.md` — short how-to on starting a Claude Code session on this repo (cd, `claude`, first-prompt template, common slash commands, deploy quick-ref). Updated CLAUDE.md's data-model table and the code comment at `history.ts:22` to point at the new paths. Historical SESSIONS entries left with old paths (they describe past state accurately at their time — added a one-line note explaining the move).

2. **Dashboard load perf fix.** Diagnosed the "logs in and dashboard takes forever" complaint. Root cause: `fetchACVHistory()` in `src/lib/supabase/history.ts:78` did `select *` on `acv_history`, pulling every fat jsonb blob (`comps`, `auction_listings`, `documents`, `reports_state`, `estimate`, `dv`, `invoice`, `adjustments`, `result`) for all ~390 claims on every login of the dashboard / `/claims` / `/completed-assignments`. None of those list views actually read those fields. Fix: narrowed the SELECT to `id, date, mode, vehicle, vin, ma_number, acv, status, claim, assigned_to, submitted_at, submitted_by`. Kept `claim` (small — dashboard search needs it). `fetchACVEntry(id)` stays fat.

3. **Shipped the un-deployed audit bundle from the last session.** Henry ran `supabase/migration-tighten-summaries-rls.sql` (verified: 4 policies). Then I deployed everything sitting in the local tree: dashboard perf fix + auth on 13 previously-open API routes + XSS sanitization on Summary Page + timing-safe cron secret compare + CSV export cell escape + history.ts existence-check refactor + smart guideline matching + ET business-days + rename-safe guidelines POST + CSV import per-row error isolation + the urgent appraiser-create fix. Deploy 1 of the session.

4. **Per-user `can_create_claims` permission (spec → plan → implementation).** Full flow: brainstorm → design doc (`docs/superpowers/specs/2026-08-27-create-claims-permission-design.md`) → implementation plan (`docs/superpowers/plans/2026-08-27-create-claims-permission.md`) → subagent-driven execution of 7 tasks with spec-compliance + code-quality review after each. Model: master + grant. Site-wide `allow_regular_create_claims` stays as a master kill-switch; new `profiles.can_create_claims` (default false) is the per-user grant. Non-admin needs BOTH. Enforced at three layers: RLS (INSERT policy on `acv_history`), dashboard button visibility (`src/app/page.tsx:44`), and direct-URL redirect (`src/components/claim/ClaimWorkspace.tsx` mount effect). Access settings page fully restructured from three per-permission sections listing every user into a **search-first per-appraiser view** — one picker at the top, click a user to reveal their three toggles (Create / Reassign / Edit Info). Scales to hundreds. Deploy 2.

5. **Picker dropdown fix.** First pass used native HTML `<datalist>` for the picker (cheap, zero-deps, but modify-after-pick clears the selection). Henry wanted a real click-to-open dropdown. Installed shadcn `command` + `popover` primitives (pulled `cmdk` + Base UI's Popover + a few incidental UI primitives — dialog, input, textarea, input-group). Rewrote the picker as `Popover` + `Command` combobox: click chevron button opens a scrollable list, type in the popover to filter, ⬆⬇ Enter Esc for keyboard nav. Selection sticks. Deploy 3.

**Changed:**

- `CLAUDE.md` — data-model table paths (`supabase/schema.sql`, `supabase/migration-*.sql`), plus a paragraph noting the move
- `docs/SESSIONS.md` — top-of-file note about the cleanup + this new entry
- `src/lib/supabase/history.ts` — slim SELECT on list-view `fetchACVHistory` + updated comment ref (`supabase/migration-roles.sql`)
- `src/lib/supabase/profiles.ts` — added `canCreateClaims` to Profile + ProfileRow + rowToProfile
- `src/app/api/admin/users/[id]/route.ts` — accept `canCreateClaims` on PATCH body + patch builder
- `src/app/page.tsx` — dashboard `canCreate` requires per-user grant when non-admin
- `src/components/claim/ClaimWorkspace.tsx` — mount-effect redirect on `/claims/new` if isNew && !canCreate
- `src/app/admin/settings/access/access-client.tsx` — full rewrite: search-first picker + per-user detail panel, then upgraded picker to Popover+Command
- `src/components/ui/{command,popover,dialog,input,input-group,textarea}.tsx` — new shadcn primitives (Base UI variants)
- `package.json`, `package-lock.json` — cmdk + Base UI popover deps
- `supabase/` — new folder; 19 SQL files relocated + renamed (dropped `supabase-` prefix)
- `supabase/migration-can-create-claims.sql` + `-rollback.sql` — new: adds the per-user grant column + updates acv_insert RLS
- `getting-started/launching-claude.md` — new
- `docs/superpowers/specs/2026-08-27-create-claims-permission-design.md` — new
- `docs/superpowers/plans/2026-08-27-create-claims-permission.md` — new

**Migrations RUN this session (confirmed by Henry):**
- `supabase/migration-tighten-summaries-rls.sql` — tightened summaries UPDATE (verified: 4 policies)
- `supabase/migration-can-create-claims.sql` — new column + updated acv_insert (verified: 1 column, 1 INSERT policy)

**Deploy status:**

Three prod deploys this session, chronological:

1. `dpl_41TecRL7mEXjdr9BFA6Rbfaqogdg` — perf fix + audit bundle + urgent appraiser-create fix
2. `dpl_EPgRDycrgb7xNy8GUxFa7kdYNqwi` — per-user create-claims permission + Access page redesign (datalist picker)
3. **LIVE now:** `dpl_2FgdVLVzu5evuWgLiyVGNw5Rb2x9` → `https://modern-tools-o7gdo79x3-henry-as-projects-88caed67.vercel.app` — Popover+Command picker. Alias `modern-tools-rho.vercel.app` flipped, verified.

Rollback (to last-good before the picker fix):
```
npx vercel promote https://modern-tools-7rvahtv69-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes
```

**In progress / broken / unknowns:**

- Automation settings page (`auto_status_requests_override`) still uses the old "list everyone" pattern. Will hit the same scaling wall as the old Access page. Deferred (~30 min follow-up when we get to it).
- Code quality reviewer flagged (Minor) that `ClaimWorkspace`'s new redirect effect uses `profile === null` as the loading sentinel — would be more robust as `const { profile, loading } = useCurrentProfile()` and guard on `loading`. Cold edge case (middleware auth makes the null-profile branch essentially unreachable), left as-is.
- Multiple commits this session unavoidably swept up prior uncommitted work on the same file (audit bundle changes from earlier sessions that had been deployed via `vercel --prod` but never git-committed). Not harmful — the swept work was already live — but commit messages understate the actual diff. Working tree is now much closer to being in sync with git, but a full audit against `dpl_2FgdVLVzu5evuWgLiyVGNw5Rb2x9` would confirm.
- SESSIONS.md still has other unstaged uncommitted work in the repo (see `git status`). None of it is broken; it's inherited from earlier sessions that never got flushed.

**Next (punch list — Henry's requests + carry-overs):**

1. **Loss of Use report** — new report type. Design TBD.
2. **Umpire claims** — support for the umpire branch of the appraisal-clause process (when Us and IA disagree, an umpire is brought in). Design TBD.
3. **Messages for summary page** — thread messaging attached to a summary (currently messages are per-claim).
4. **RTA declaration** — a new document/report type. Design TBD.
5. **Estimate dispute rework** — the existing `/estimate-dispute` flow needs a rework. Scope TBD.
6. **Automation page cleanup** — apply the same search-first per-appraiser pattern the Access page just got.
7. **Email notifications** (carry-over) — SMTP via Bluehost, parked pending Henry providing SMTP creds.

---

## 2026-08-27 — Automation cron + Guidelines + Duplicates + Edit lock + CSV export/import + Full audit

Marathon session. Roughly chronological:

**Worked on:**

1. **Auto 48-hour status request cron** — daily Vercel Cron (`0 14 * * *`) hits `/api/cron/status-requests`. For every open+assigned claim, computes business-days since the last appraiser message (or `assigned_at` if none), fires an in-app "AUTO"-tagged message if ≥48 business hours have passed. Repeat cadence: first at 48h, then every 24h business hours until the appraiser replies. Admin messages don't reset the timer.
2. **Per-user permissions** — added `profiles.can_reassign_claims`, `profiles.auto_status_requests_override` (nullable tri-state), `profiles.can_edit_claim_info`. Wired into the assign API, cron, and the new Access settings page. Handling Appraiser is deliberately never locked (feeds Award / Closing Notes).
3. **Settings page redesign** — collapsed the flat page into a left-sidebar shell at `/admin/settings/*` with pages for Users / Access / Automation / Guidelines / Data. Users moved out of `/admin/users` into `/admin/settings/users`. Header dropdown collapsed to one "Settings" entry.
4. **CSV export for claims** — `/api/admin/export/claims` with filters (Status, From, To). 14 columns, Excel-safe (UTF-8 BOM, CRLF).
5. **CSV import for claims** — template + upload + dry-run preview + confirm. Handles Henry's real external-source CSV: `assignment_id`, `insured_name`, `v_year/v_make/v_model` composite Vehicle, `owner_first_name/owner_last_name` composite Owner, phone-priority mobile→home→work, plus adjuster/mileage/deductible/policy/damage/dateOfLoss into the claim jsonb. Duplicate MA# skipped case-insensitively.
6. **Insurance Guidelines feature** — new `insurance_guidelines` table (name + guidelines text + audit cols), Guidelines tab in every claim workspace (matched by insurance-company name), Settings → Guidelines management (list/search/add/inline-edit/delete + CSV import with template + preview + Overwrite toggle). Read-only for all authed; admin can write.
7. **Insurance Company autocomplete** on the Claim Info form — datalist sourced from `insurance_guidelines.name` so typing "Allstate" surfaces "Allstate Ins. Co." and picks the canonical name for a clean guideline match.
8. **Delete-empty + Delete-all guideline buttons** on the manage page; import route now skips empty-guideline rows.
9. **Guidelines reformatter script** (`scripts/transform-guidelines.mjs`) — one-off tool that read Henry's 364-row `Insurance_Companies_2026-08-26.csv`, decoded HTML entities, added structure (headings/paragraphs/bullets/numbered lists) via known-section whitelist + Title Case matcher. Kept 60 with content, skipped 304 blanks. Output at `C:\Users\Owner\Downloads\Insurance_Companies_reformatted.csv`.
10. **Structured guidelines rendering** — Guidelines tab now scrollable with pinned header/footer; mini formatter for blank-line paragraphs, `# / ##` headings, `- / * / •` bullets, `1.` numbered lists, `**bold**`, URL auto-links. Admin editor got syntax hints.
11. **Claim type selector + tool gating** — `ClaimInfo.claimTypes[]` (`acv | dv | estimate | other`), chip UI in Claim Info, filters TOOL_TABS. Always-on: Award / Notes / Summary / Invoice. Backward compat: empty types = show all.
12. **Duplicate VIN + CL# detection** — `/api/claims/duplicates` (service-role for cross-team visibility), live warnings under VIN + Claim# with 500ms debounce, persistent amber banner at top of any saved claim with duplicates.
13. **Auto-save block on new claims** — `if (!editingIdRef.current) return` in the debounced save effect; user must click Create Claim explicitly. localStorage draft still preserves in-progress work.
14. **Claim Info edit lock** — form locked by default on existing claims; Edit button unlocks for admins + users with `can_edit_claim_info`. Handling Appraiser stays editable regardless. PDF Upload only shows on new-claim creation. Removed the "Pick one or more…" helper text from Claim Type.
15. **Per-row Reassign** on Completed Assignments queue — native select per row + confirm modal + assign API + reload.
16. **Messages tab UX** — recipient picker `max-h` 56 → 96 (~4 → ~9 visible), composer autosize via ref+useEffect (grows to fit any draft up to 50vh).
17. **Full security + correctness audit** — spawned two parallel review agents. Findings prioritized as Critical / Medium and fixes built (see bundle below).
18. **Bug found during audit remediation testing:** `readOnly = !isAdmin && (…!isAssignee)` locked appraisers out of `/claims/new` entirely (new claim has no assignee → `isAssignee=false`). Fixed with `&& !isNew`.

**Migrations RUN this session (confirmed by Henry):**
- `supabase/migration-status-requests.sql` — is_auto_request + assigned_at + last_status_request_at + seeded auto_status_requests_enabled=false
- `supabase/migration-per-user-permissions.sql` — can_reassign_claims + auto_status_requests_override
- `supabase/migration-can-edit-claim-info.sql`
- `supabase/migration-insurance-guidelines.sql`

**Migration PENDING (Henry must run before deploying the audit bundle):**
- `supabase/migration-tighten-summaries-rls.sql` — replaces `Authenticated users can update summaries` with creator/admin/assignee-only policy. Rollback: `-rollback.sql` alongside it.

> **Note (2026-08-27 cleanup):** all `supabase-*.sql` files were moved from repo root into `supabase/` and the `supabase-` prefix dropped (e.g. `supabase-migration-tighten-summaries-rls.sql` → `supabase/migration-tighten-summaries-rls.sql`). Historical entries below still reference the old paths; that's intentional (they describe past state).

**Deploy status:**
- **LAST DEPLOYED (currently live):** `dpl_Bv4bVPRNEefTJ5LBCcLgvchHUcbK` → `modern-tools-l7h9yv7pv-henry-as-projects-88caed67.vercel.app`. Includes the messages tab UX fix as the newest change.
- **BUILT but NOT DEPLOYED:** the full audit bundle + appraiser-create fix. Sits in local working tree, builds clean (`npx tsc --noEmit` + `npm run build` both pass). Blocked on Henry running the summaries RLS migration.
- **Rollback for the eventual audit deploy:** `npx vercel promote https://modern-tools-l7h9yv7pv-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes`

**Audit bundle contents (built, waiting to ship):**
- **CRITICAL** — Auth added to 13 previously-open API routes (`compare-estimates`, `acv/review-estimate`, `acv/search-comps`, `acv/search-autodev`, `acv/search-auction`, `acv/decode-vin`, `acv/depreciation`, `acv/parse-claim`, `acv/generate-pdf`, `acv/generate-award-pdf`, `acv/generate-notes-pdf`, `acv/generate-dv-pdf`, `invoices/generate-pdf`). Anyone on the internet could drain Anthropic + MarketCheck credits.
- **CRITICAL** — Summary Page XSS sanitization on render + save (installed `isomorphic-dompurify`)
- **CRITICAL** — Summaries UPDATE RLS tightened (needs the pending migration)
- **HIGH** — CSV export cell prefix escape (Excel formula injection guard)
- **HIGH** — `history.ts` existence-check refactor (no more silent-fail-then-duplicate-insert)
- **HIGH** — Timing-safe cron secret comparison via `crypto.timingSafeEqual`
- **MEDIUM** — Smart guideline matching (strips legal suffixes/punctuation/digits; falls back to containment match with longest-name-wins). Real impact: most of the ~200 imported claims with names like `PROGRESSIVE INSURANCE TPAC 3250` will now match `Progressive` guidelines.
- **MEDIUM** — `business-days.ts` computed in America/New_York, not UTC. Friday-PM ET assignments were firing nags on Monday instead of Tuesday.
- **MEDIUM** — Rename-safe guidelines POST (SELECT by name_key first, then update or insert — old code could reassign IDs on collision)
- **MEDIUM** — CSV import per-row error isolation (was blaming whole chunk of 100 for one bad row)
- **URGENT BUG FIX** — Appraiser-create fix: added `&& !isNew` to the readOnly gate. Currently on live, appraisers who click "New Claim" get a fully-disabled form (can't type, can't upload PDF).

**In progress / broken / unknowns:**
- **URGENT:** appraisers currently cannot create claims on the live site. Fix is in the pending bundle.
- Email notifications feature (SMTP via Bluehost) parked in task #51 pending Henry providing SMTP creds
- Low-severity audit findings deferred: duplicate-check race with stale responses, fieldset-disabled `<a>` still clickable in browsers, CSV date parsing US-locale dependent, `deleteAll` guidelines uses IN(…) that could hit URL length on 500+ rows, message composer autosize race on Safari huge-paste. See the two audit-agent transcripts in-conversation for the full list.

**Next:**
1. Run `supabase/migration-tighten-summaries-rls.sql` → I deploy the audit bundle + appraiser-create fix. This is the priority — no other work should ship on top of the un-deployed bundle.
2. (or) fast-track just the appraiser-create fix in isolation if the RLS migration is being deferred (revert the RLS-dependent piece from the bundle, deploy everything else + the fix).
3. Then: wire up email notifications (needs Bluehost SMTP creds from Henry).

---

## 2026-08-26 (evening) — Post-Messages UX pass + Assignment Sheet feature

**Worked on:** A long tail of UI polish, workflow cleanup, and one new small feature (Assignment Sheet PDF) that grew out of using the just-shipped role-based-access + Messages rollouts. All small-medium iterations, no schema changes, no new tables.

**Changed — Dashboard + claim tables (bulk reassign, confirm modals, layout):**
- Bulk reassign in the claims table: per-row checkboxes + a top action bar that appears when 1+ selected ("N selected · Reassign to [dropdown] [Confirm]"). Confirm fires parallel assign API calls then reloads the page. Replaced the per-row inline assign dropdown entirely.
- Delete claim is admin-only in the UI (RLS was already blocking the server call). Trash column hidden for appraisers.
- New `src/components/ui/confirm-dialog.tsx` — replaces every `confirm()` browser popup. Used for delete (danger variant), Submit / Approve / Send Back / Reopen (primary), and Reassign. ESC / click-outside cancels; busy state shows "Working…".
- Completed Assignments moved off the dashboard into its own `/completed-assignments` page. Dashboard header shows a "Completed Assignments (N)" button next to the new "Messages" button and "New Claim".
- Claim search now also matches the assigned appraiser's name/email (in addition to MA #, VIN, claim #, vehicle, insured, insurance co.).
- Row single-click no longer opens claims (was interfering with checkbox selection). Two ways to open now: click the MA # cell (styled as hover-underlined link) OR double-click anywhere on the row. Applied to Dashboard, All Claims, Completed Assignments, and the Messages queue table.
- Messages: sender never gets an unread badge for a message they sent (server-side `.neq('sender_id', user.id)` on the queue query + client-side reply-defaults now use "last message's sender + recipients MINUS current user" instead of just "last message's recipients").

**Changed — claim workspace visual polish:**
- Centered underline tabs for **Claim Info / Documents / Messages** on the top row (was rounded-pill bubbles; Henry didn't like them). Larger text (`text-lg font-bold`), centered with `justify-center gap-12`, full-width bottom border. Same centered-underline treatment applied to the tools row (ACV Report / DV / Award / Notes / Summary / Estimate / Invoice).
- Removed the tools-row horizontal scroll arrow (was appearing next to the Invoice tab from `overflow-x-auto`). Now uses `flex-wrap` — tabs wrap if they don't fit, no scroll indicator.
- Removed the top-left green/gray Open/Closed status pill (admin-only) plus its `toggleStatus` handler and `setClaimStatus` import — Submit/Approve/Reopen fully cover status changes now.
- Added a **Reassign button** to the claim's workflow-button cluster (admin only). Click → popover of appraisers (current assignee marked) → in-app confirm modal → save without a full page reload.
- Header stats card (MA# / CL# / Vehicle / Client / Owner) no longer has a visible border. Responsive grid layout (2 cols small / 3 medium / 5 wide) with values that wrap in-cell instead of being truncated with an ellipsis. Font dropped from text-lg to text-base to keep wrapped values from feeling oversized. Divider bars between stats removed.
- Removed the old inline "Assigned to:" dropdown from the header — Reassign button replaces it.

**Changed — Assignment Sheet (NEW feature):**
- New **`src/components/claim/assignment-sheet.tsx`** — a single-page printable summary of the claim: Modern Appraisers logo top-left, then Claim / Insured-Owner / Vehicle / Insurance / Appraisers / Valuations / Status sections. Every field always present; missing money = `$0.00`, missing text = `—`. Times New Roman font, ~7.7in wide, tight vertical rhythm to always fit one Letter page.
- Print button top-left of the workspace, next to the Dashboard back button (anyone with claim access, any existing claim).
- **Print pipeline:** captures the off-screen assignment-sheet portal with `html2canvas-pro` (drop-in fork of html2canvas that supports Tailwind v4's `oklch()`/`lab()` color functions — stock html2canvas throws on those), composes a single Letter-size PDF via `jspdf`, and OPENS THE PDF IN A NEW BROWSER TAB for preview (via `window.open(blobUrl)`). User previews, then saves to any folder or prints from the PDF viewer. Popup-blocked fallback: prompts the OS Save-As dialog.
- Logo displays black via `filter: brightness(0)` (the source asset is white, would be invisible on white paper).
- Portal renders via `createPortal(document.body)` with `position: absolute; left: -99999px` so it's off-screen but fully rendered (`display: none` broke image loading + html2canvas capture).
- New dep: `html2canvas-pro` (Tailwind v4 compat fix). Stock `html2canvas` stays for the Summary page (works for now — same fix if it ever breaks).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `dpl_9RrBoWqw4tNGWzWcWMQssDLkfW9T` (`modern-tools-4mulg9dy7`). Alias verified.

**Rollback if anything's broken:**
- Code: `npx vercel promote modern-tools-aw4ony2ps-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (this is the assignment-sheet-with-Save-As build; pre-preview-tab).
- Or roll all the way back to pre-Messages: `npx vercel promote modern-tools-r74hffh9g-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (the "fix header truncation" build before Messages went out).

**In progress / broken / unknowns:**
- **Assignment sheet: preview-in-new-tab depends on popups being allowed.** Henry's browser hasn't reported issues. If any user hits a popup blocker, the fallback fires the OS Save-As dialog instead — feature still works, just no preview.
- **Summary page still uses stock html2canvas.** Fine today because the DOM it captures doesn't trigger the lab-color path. If we ever add Tailwind v4 accent colors to the summary print doc, same drop-in swap fixes it.
- **All the earlier known limitations still apply.** Messages: no push (polling only), no email, no attachments, no edit/delete. Role-based access: no invite-email flow, session cache staleness on role change is cosmetic.

**Next:**
- **Add guidelines for each insurance company.** Reference material per insurer (Sedgwick, Nationwide, Allstate, etc.) that appraisers can consult while working a claim. Details TBD — will scope out with Henry at start of next session (where the content lives, what fields per insurer, how it surfaces in the app).

---

## 2026-08-26 (later) — Messages feature shipped

**Worked on:** New team-communication feature on claims. **Messages tab** joins Claim Info + Documents on the top row of the claim workspace. Chat-app layout — chronological thread, composer fixed at the bottom, recipient chip picker searchable over all profiles. Every message persists on the claim permanently (reassignment cannot touch messages — verified structurally, no assignment-linked columns in the schema). Per-user unread tracking via a high-water-mark timestamp table. New Dashboard header button "**Messages (N)**" shows the caller's total unread count and links to `/messages` — a page listing every claim with unread messages for that user. Opening a claim's Messages tab marks that claim's thread as read for the caller and clears it from their queue.

Full design at `docs/superpowers/specs/2026-08-26-messages-design.md`; implementation plan at `docs/superpowers/plans/2026-08-26-messages.md`. Built via subagent-driven-development.

**Changed (new files):**
- `supabase-migration-messages.sql` + `supabase-migration-messages-rollback.sql` — two new tables (`messages` + `message_reads`), their RLS policies + indexes.
- `src/lib/auth/require-claim-access.ts` — server helper for the four API routes (auth + admin-or-assignee check).
- `src/lib/supabase/messages.ts` — `Message`, `UnreadClaim`, `SendMessagePayload` types + fetch/send/mark-read/queue/count helpers.
- `src/app/api/claims/[id]/messages/route.ts` — GET list + POST send. Body validation (max 4000 chars, non-empty recipients, all recipient ids must be real profiles). Server captures sender_name + recipient_names at send time so history renders sensibly after any user rename/delete.
- `src/app/api/claims/[id]/messages/read/route.ts` — POST mark-as-read (upserts `message_reads`).
- `src/app/api/messages/queue/route.ts` — GET per-user unread queue. Buckets messages by claim, joins with acv_history, sorts by recency.
- `src/components/claim/messages-tab.tsx` — the tab component. Auto-scroll to bottom. Composer defaults to previous message's recipients (reply-style). URL auto-linkifier (regex-based, no library). Ctrl/Cmd+Enter to send. Soft warn at 20+ recipients.
- `src/app/messages/page.tsx` + `messages-queue-client.tsx` — `/messages` queue page with claim rows, unread badges, last-message metadata, click-to-open.

**Changed (modified files):**
- `src/components/claim/ClaimWorkspace.tsx` — imported MessagesTab, added `{ id: 'messages', label: 'Messages', step: 13 }` to `CLAIM_TABS`, extended `tabForStep` with step 13, rendered the tab OUTSIDE the `<fieldset disabled={readOnly}>` wrapper so messaging stays active on submitted/closed claims (per design §7.2 — meta-conversation about the work).
- `src/app/page.tsx` — added `MessageSquare` icon import + `fetchUnreadCount` import + `unreadMessages` state, extended `load()`'s Promise.all to include the unread count, added the Messages Link as the first header button (visible to both admins AND appraisers, unlike Completed Assignments which is admin-only).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `dpl_HHCAt3rYrEcAvWBVJPHVu9SPMtdi` (`modern-tools-fcefct4lp`). Alias verified. Prod sanity check: `GET /api/messages/queue` without a session returns HTTP 401 `Not authenticated` (guard active).

Prerequisite step Henry completed before deploy:
- `supabase-migration-messages.sql` executed in Supabase SQL Editor. Verification query confirmed 2 tables + 3 policies + all constraints.

**Rollback:**
- Code: `npx vercel promote modern-tools-rlwwzav2o-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (prior good build from earlier this session — post-header-truncation-fix, pre-Messages).
- Schema: run `supabase-migration-messages-rollback.sql` in Supabase SQL editor (drops both tables + policies; no other data touched).

**In progress / broken / unknowns:**
- **Real end-to-end validation is on Henry.** Individual tasks each verified via tsc + build + lint at baseline. Real flow (send between two accounts, badges track correctly, reassignment preserves thread) needs a live second account.
- **No push updates yet.** Unread counts refresh only when the Dashboard loads or you navigate. If someone sends a message while you're staring at another page, you won't see it until you reload. Realtime subscription is a v2 add.
- **No email notifications.** In-app only per design.
- **No file attachments in v1.** Use Documents tab and reference in message body (URL auto-linkifier catches app-relative paths like `/claims/abc`).
- **No message editing or deleting.** Append-only per design. Enforced at RLS level (no UPDATE/DELETE policies).
- **User rename** — captured names in message history stay at the send-time snapshot. New messages show the current name. Documented; not a bug.
- **Recipient dropdown shows all profiles**, not filtered to "users who could plausibly access this claim". Simplifies the picker; server-side no harm since recipients without claim access simply can't SELECT the message. Could tighten later.

**Next:**
- Henry validates the flow — send a message from admin to himself, verify badge/queue, then create a second test account and walk the two-way flow.
- Whatever Henry surfaces after real-world usage.

---

## 2026-08-26 — Role-based access shipped (admin + appraiser roles, claim assignment, submit workflow)

**Worked on:** Split Modern Tools' single-shared-login model into two roles. **Admin** sees everything, creates users, assigns claims, and approves/reopens; **appraiser** sees only claims assigned to them and can only submit a claim for admin review, not close or reassign. Includes admin user-management page, personal profile page (name + password change for everyone), an admin-controlled site setting that gates whether appraisers can create claims (default ON), a Completed Assignments queue on the admin dashboard, and full server-side enforcement via RLS + triggers + service-role-guarded API routes. Existing ~487 claims stayed untouched; all start unassigned. Bootstrap admin is the single pre-existing account (xsfabot@gmail.com).

Full design at `docs/superpowers/specs/2026-08-26-role-based-access-design.md`; implementation plan at `docs/superpowers/plans/2026-08-26-role-based-access.md`. Built via superpowers brainstorming → writing-plans → subagent-driven-development (12 tasks, each with implementer + spec review + code-quality review).

**Changed (new files):**
- `supabase-migration-roles.sql` + `supabase-migration-roles-rollback.sql` — schema for `profiles`, `site_settings`, `assigned_to`/`submitted_at`/`submitted_by` on `acv_history`, RLS policies, column-guard triggers, storage bucket scoping.
- `src/lib/supabase/service.ts` — server-only `createServiceClient()` using `SUPABASE_SERVICE_ROLE_KEY`.
- `src/lib/supabase/profiles.ts` — `Role`, `Profile` types + `fetchCurrentProfileBrowser`, `fetchAllProfilesBrowser`, `useCurrentProfile` (session-cached).
- `src/lib/supabase/site-settings.ts` — `fetchSiteSetting<T>()`.
- `src/lib/auth/require-admin.ts` — `requireAdmin`, `requireAuth`, `fetchClaim` for API-route guards.
- `src/app/api/admin/users/route.ts` + `[id]/route.ts` — POST create, PATCH update role/name, DELETE.
- `src/app/api/admin/site-settings/route.ts` — PATCH allow_regular_create_claims.
- `src/app/api/claims/[id]/{assign,submit,send-back,approve,reopen}/route.ts` — 5 workflow endpoints, service-role internally, caller identity validated in each.
- `src/app/api/profile/route.ts` — PATCH own name (user session, not service role).
- `src/app/profile/page.tsx` — personal Profile page (name + password change via reauth + updateUser).
- `src/app/admin/_guard.tsx` — server component that 404s non-admins.
- `src/app/admin/page.tsx` — redirects to /admin/users.
- `src/app/admin/users/page.tsx` + `users-admin-client.tsx` — users table with role dropdown, inline name edit, add-user modal, delete guard.
- `src/app/admin/settings/page.tsx` + `settings-admin-client.tsx` — allow-appraisers-to-create-claims toggle.

**Changed (modified files):**
- `src/lib/supabase/history.ts` — `ACVHistoryEntry` now surfaces `assignedTo`/`submittedAt`/`submittedBy` (workflow-controlled — not written from `saveACVHistory`).
- `src/components/app-header.tsx` — profile dropdown with Profile / Admin (admin-only) / Sign out.
- `src/components/claims-table.tsx` — role-aware Assigned To column with inline assign dropdown (admin only), Submitted column for the admin queue.
- `src/app/page.tsx` — Dashboard: admin dual-card (Open Claims + Completed Assignments); appraiser single-card filtered to their assigned open. New Claim button gated by role + site setting.
- `src/app/claims/page.tsx` — extends existing table with `adminView` + `profiles`; RLS handles row-level scoping automatically.
- `src/components/claim/ClaimWorkspace.tsx` — Submit / Approve / Send-Back / Reopen buttons in top toolbar (state-appropriate); submitted-read-only banner + `<fieldset disabled>` for appraiser view of submitted claims; admin inline assign dropdown in header stats; hides open/closed status pill + Save Changes button for non-admins; auto-save timer skips when read-only. Removed the old Step-1 "Submit Claim" button (which bypassed the new workflow by writing status='closed' directly).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `dpl_BC1157BCgHqeVntL7uEWQnTwrfWn` (`modern-tools-cc2p2lzgv`). Alias verified. Sanity-checked prod: `POST /api/admin/users` with no session returns HTTP 401 `Not authenticated` (guard active).

Prerequisite steps completed by Henry BEFORE the code deploy:
- `supabase-migration-roles.sql` executed in Supabase SQL editor. Verification query confirmed **487 claims preserved**, **1 admin profile** (his account), **1 site_settings row**.
- `SUPABASE_SERVICE_ROLE_KEY` added to Vercel Production environment.

**Rollback:**
- Code: `npx vercel promote modern-tools-fwomnen8n-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes` (prior good build from 2026-08-26 earlier).
- Schema: run `supabase-migration-roles-rollback.sql` in Supabase SQL editor (drops all new columns/tables/policies/triggers, restores prior authenticated-wide RLS). Loss-free since existing rows were never modified.

**In progress / broken / unknowns:**
- **First-run validation is on Henry.** The AI test path is identical to prior features and each task was reviewed for spec + quality, but full end-to-end (create appraiser account → assign claim → appraiser sees only assigned → submit → admin approves → closed) requires a real second user account. Henry needs to (1) log in, (2) go to /admin/users, (3) create a test appraiser account, (4) assign a claim to them, (5) log in as that appraiser and walk the full loop.
- **Session cache staleness.** `useCurrentProfile` caches role per session; if an admin demotes an active user session, the client keeps showing admin UI until reload. RLS enforces server-side so no data risk, just cosmetic. Documented; can add Realtime sub later.
- **No email invites, no notifications.** Admin sets password directly (told to user out-of-band); no notification on assign/submit/send-back. Deferred per design.
- **Column-guard trigger relies on Postgres RLS + trigger cooperation.** If someone drops the trigger via the Supabase dashboard, appraisers regain the ability to change protected columns. Not a common risk but noted.

**Next:**
- Henry: create the first appraiser account and run the end-to-end test.
- If flags surface (broken flow, unexpected access, styling issues), file them as small follow-ups.
- Long-term: email invite flow, in-app notifications, admin impersonation, audit-log viewer — all out of scope for v1 and easy to add on top.

---

## 2026-08-25 (evening) — Estimate Review feature: shipped

**Worked on:** New AI tool inside the claim workspace's **Estimate Dispute** tab: **Estimate Review**. The Estimate Dispute tab now has two underline sub-tabs — **Compare Two Estimates** (existing, unchanged) and **Estimate Review** (new). Estimate Review uploads 1+ auto-body estimate PDFs plus up to 10 optional reference photos, sends everything to Claude Sonnet 4.6 with the full CCC/MOTOR P-Pages rulebook attached (prompt caching), and returns a table of flagged line items. Each flag cites the P-Pages rule, quotes the relevant text verbatim, suggests a corrected value, and shows the $ impact. There is no auto-computed proposed grand total — Henry decides what to argue. Reviews accumulate on the claim (list of cards, newest on top). Each completed review auto-files a PDF into the claim's Documents tab.

Full design at `docs/superpowers/specs/2026-08-25-estimate-review-design.md`; implementation plan at `docs/superpowers/plans/2026-08-25-estimate-review.md`. The whole build was done via the superpowers brainstorming → writing-plans → executing-plans flow.

**Changed:**
- `scripts/extract-p-pages.mjs` — NEW. One-shot script: extracts the P-Pages PDF text into `p-pages.txt`. Run manually whenever the rulebook source updates.
- `src/lib/estimate-review/p-pages.txt` — NEW. Extracted MOTOR/CCC P-Pages content (40 pages, ~132k chars). **⚠️ Copyright: proprietary to MOTOR/CCC.** Keep the repo private.
- `src/lib/estimate-review/types.ts` — NEW. `Flag`, `EstimateReview`, `FlagCategory`, `FlagSeverity`, `SuggestedAction` types + `CATEGORY_LABEL` map.
- `src/lib/estimate-review/prompt.ts` — NEW. `buildSystemBlocks()` (uncached instructions + P-Pages with `cache_control: ephemeral`), `buildUserMessage()` (estimate text + photo image blocks), `parseReviewResponse()`, `buildReview()`.
- `src/lib/estimate-review/pdf.ts` — NEW. Client-side `captureReviewPdf(el)` using html2canvas + jspdf (paginated Letter, same pattern as `summary-pdf.ts`). Plus `reviewPdfFileName()` helper.
- `src/app/api/acv/review-estimate/route.ts` — NEW. POST endpoint, multipart form (`estimates`, `photos`, `nextReviewNumber`), Node runtime, `maxDuration = 300`. Parallel processing at concurrency 3. Failed reviews come back in-band with `{ error, flags: [] }` so a bad file doesn't fail a batch.
- `src/components/claim/estimate-review-tab.tsx` — NEW. Upload panel (`MultiDropZone` for estimates + up to 10 photos), Run Review button, review cards (newest on top), compact flag table (visual layout A — Line / IA Billed / Rule / Suggested / Impact), color-coded category badges (red/blue/amber/purple), delete-with-confirm, auto-file to Documents on successful reviews.
- `src/components/claim/estimate-tab.tsx` — MODIFIED. Refactored the existing top-level `EstimateTab` into an internal `CompareEstimates` (unchanged behavior). New top-level `EstimateTab` shell adds the underline sub-tab bar (Compare | Review) and routes between them. Also extended `ClaimEstimate` with `reviews?: EstimateReview[]` and added `onDocumentSaved?` prop.
- `src/lib/supabase/documents.ts` — MODIFIED. Added `'estimate-review'` to the `ClaimDocument['source']` union.
- `src/components/claim/documents-tab.tsx` — MODIFIED. Added `'estimate-review': 'Estimate Review'` to the source-label map.
- `src/components/claim/ClaimWorkspace.tsx` — MODIFIED. Passes `onDocumentSaved` prop to `EstimateTab` so reviews auto-file via the existing `addDocument` helper.
- `docs/superpowers/specs/2026-08-25-estimate-review-design.md` — NEW. Full design spec.
- `docs/superpowers/plans/2026-08-25-estimate-review.md` — NEW. 9-task implementation plan.
- `.gitignore` — added `.superpowers/` (for brainstorming visual-companion mockup files, kept out of git).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `dpl_9HpdLhXUcE4umffdNjwHrojcrLhZ` (`modern-tools-k0ref1wxp`). Alias verified. Production route sanity-checked: `POST /api/acv/review-estimate` with an empty form returns HTTP 400 with `"At least one estimate file is required"`, confirming the route is loaded and validation works.

**Rollback target if this deploy breaks anything:** `dpl_6q2maUbqNEVpUUWQFA7Fi996vZXL` (`modern-tools-fj67nvbne`, from earlier today):
```
npx vercel promote modern-tools-fj67nvbne-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes
```

**In progress / broken / unknowns:**
- **Full AI end-to-end test was NOT run locally.** `.env.local` doesn't exist on this machine (Henry stores keys in Vercel project settings; production has them). The dev-server test confirmed: route loads, multipart parsing works, Anthropic SDK initializes, graceful error handling catches auth failure. The AI path itself is identical to `/api/compare-estimates`'s (same SDK, same auth mechanism, same prompt-caching flag), which is production-verified. **Henry should run a real review as the first thing next time he opens the app** — that's the actual end-to-end validation.
- **P-Pages copyright.** The `p-pages.txt` file is proprietary MOTOR/CCC content committed to the repo for internal use only. Repo must stay private. Do NOT expose via any public route or open-source the project without revisiting this.
- **Prompt-cache warm-up.** First review of a 5-min window costs ~10¢ in input tokens (35k uncached). Subsequent reviews in that window hit cache and cost ~1¢. If Henry does 100 reviews/month with typical usage patterns, this is a few dollars/month at most.
- **AI false positives.** The tool flags P-Pages violations. It may occasionally flag legitimate line items. Users are expected to review each flag before disputing — the tool is a "second-appraiser checklist", not a judgment engine. If Henry finds it flags too aggressively/permissively, we can tune the prompt in `src/lib/estimate-review/prompt.ts`.
- **Concurrent-edit last-write-wins.** Reviews are added to `acv_history.estimate.reviews` array; two users adding reviews to the same claim at the same time could lose one. Same model as summaries. Documented, not fixed.

**Next:**
- Henry validates the feature by uploading a real IA estimate + running a review, then confirms the output shape is useful.
- If flags are too aggressive/permissive, tune `SYSTEM_INSTRUCTIONS` in `src/lib/estimate-review/prompt.ts`.
- No other pending work on this feature.

---

## 2026-08-25 — Vercel relink, autonomous-deploy authorization, CLAUDE.md rewrite

**Worked on:** First session in ~5 weeks. Relinked local folder to Vercel after the CLI token expired. Ran a live smoke-test deploy (Dashboard → Dashboar → revert) to prove the pipeline was intact. Henry authorized fully autonomous deploys going forward. Rewrote `CLAUDE.md` (cleaner, more efficient) and stood up this session log at Henry's request. Also verified that the codebase / architecture described in the old Work Log still matches what's on disk — the "big changes" Henry mentioned were the Aug 13 sync commit (`6b2f3d9`), which committed the claim-centric redesign + Reports/Invoice + DV PDF work into git. Nothing has drifted in the working tree since.

**Changed:**
- `.vercel/` — recreated by `vercel link` (folder wasn't linked to `henry-as-projects-88caed67/modern-tools`).
- `src/app/page.tsx` — Dashboard heading text: changed to "Dashboar" for the smoke-test deploy, then reverted back to "Dashboard". Net change to file: none.
- `CLAUDE.md` — reorganized end-to-end. Moved dated Work Log entries out to this file. Added a Session Workflow section (read `docs/SESSIONS.md` first, prepend an entry at end of every session). Added standing rules (ask/don't-assume, no sloppy code, verify before claiming done, no unscoped reverts, autonomous deploy authorization). Updated the git-status wording (repo now periodically synced from local; still never git-push-to-deploy). Fixed the stale macOS folder-path reference to the actual Windows path (`C:\XSFA\Modern Tools Official`). Consolidated the architecture section — same coverage, tighter.
- `docs/SESSIONS.md` — NEW. This file, with the Work Log history migrated from CLAUDE.md and this entry on top.
- Memory: saved `feedback_autonomous_deploy.md` in `~/.claude/projects/C--XSFA-Modern-Tools-Official/memory/` recording that Henry cleared me to deploy without per-change approval (2026-08-25).

**Deploy status:** LIVE. `modern-tools-rho.vercel.app` → `dpl_6q2maUbqNEVpUUWQFA7Fi996vZXL` (`modern-tools-fj67nvbne`), which is the Dashboard-restored build. Deploy sequence today, newest first:
- `dpl_6q2maUbqNEVpUUWQFA7Fi996vZXL` (`fj67nvbne`) — revert to "Dashboard" — **CURRENT**
- `dpl_GeB6FZAS9o5LNY8oSDNk9N4SUMXe` (`fy2fxr1wy`) — "Dashboar" smoke test
- `dpl_DjrEvo5sVqj4mz6JjAQz3RfcNKDu` (`2sisn5y5s`, from 2026-08-16) — the pre-session build, **rollback target if today's changes need to be undone**:
  ```
  npx vercel promote modern-tools-2sisn5y5s-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes
  ```
- Today's doc rewrites (`CLAUDE.md`, `docs/SESSIONS.md`) are docs-only, uncommitted, not deployed. No code change to deploy.

**In progress / broken / unknowns:**
- **`supabase-migration-invoice.sql` status is UNKNOWN.** It was flagged "not yet run" on 2026-07-20. Unknown whether Henry ran it in the intervening 5 weeks. Until confirmed, Invoice-tab state on a claim silently won't persist — the 42703 fallback in `saveACVHistory` drops the `invoice` field so the save doesn't fail, but the data is thrown away. **First priority next session: confirm this migration's status.**
- The 2026-07-20 "NEXT SESSION" TODO list (invoice migration, download path clarification, umpire tab, DV tab redesign, arrows-bug screenshot, DV PDF re-save, git reconciliation) was **explicitly scrapped by Henry** at the start of this session. Do not carry any of it forward. The one exception is the invoice migration status — that's still worth confirming since it silently corrupts Invoice-tab saves.
- `dv-nationwide-sedgwick.pdf` corruption from 07-18 — status unclear as of this session (I didn't test-generate against the API). If Henry has re-saved it in Acrobat since then, all four DV variants should work. Not verified.

**Next:**
- Confirm `supabase-migration-invoice.sql` has been run (query Supabase or ask Henry).
- Whatever Henry surfaces.

---

## 2026-07-20 (later still) — Claim workspace Back/Next nav bugs

**What we did (Henry: "in acv report when i click next it takes my to weird pages... it takes my to summary page, when i click back from the award it just gives me all the tools"):** two separate stale-navigation bugs in `ClaimWorkspace.tsx`, both leftovers from before the app became tab-based:
1. **ACV Report "Next: Summary" button** — the Review & Generate step (step 4, inside the ACV Report tab) had a hardcoded `onNext={() => setStep(5)}` that jumped straight to the Summary tab, a relic of the old linear wizard from before tool tabs existed. Since the reorder on an earlier 07-20 session, Summary isn't even next in tab order anymore (DV/Award/Closing Notes come between ACV Report and Summary now). Same root cause as the earlier "Next: Select Comps" button removal on Claim Info — the tool tabs already let you jump to any tool, so a forced-linear "Next" is dead weight and actively misleading. Removed the button and the `onNext` prop from `ReviewStep` entirely.
2. **Award tab's bottom "Back" button gave "all the tools"** — `ReportsStep` (the one component behind Award/Closing Notes/Summary, controlled by tab clicks via its `view` prop) has each report form's *top* "Back to Tools" button correctly hidden with `{!view && (...)}` so it doesn't fight the tab bar. Closing Notes' *bottom* Back button (next to Download) had the same guard. **Award's bottom Back button was missing it** — clicking it called `setSelectedReport(null)` while `view` stayed pinned to `'award-agreement'`, which fell through to `ReportsStep`'s internal "pick a report type" hub (Award/Closing Notes/Summary cards) — exactly the "all the tools" Henry described. Added the same `{!view && (...)}` guard so it matches its Closing Notes sibling.
- Checked for the same pattern elsewhere (`grep setStep(` across the file) — every other `setStep` call is either a direct tab click or legitimate within-tab stepper navigation (steps 2↔3↔4 inside the ACV Report tab, or the Loss Search toggle). No other instances found.
- Verified: `npx tsc --noEmit` clean, `npm run build` green. Lint unchanged (pre-existing warnings/errors only — the `editId`/`mileageRate`/`reportsState` unused-var warnings on `ReviewStep` predate this change, not introduced by it).

**On disk, deployed:** `src/components/claim/ClaimWorkspace.tsx`.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-mtqtksgek` (deployed via `vercel --prod`, alias verified, `/login` responds 200). Rollback target if needed: `modern-tools-6p8325hhm` (previous prod build, same day — Invoice tool follow-ups).

### 2026-07-20 NEXT SESSION list (scrapped 2026-08-25)

Preserved here for history only. Henry scrapped this list at the start of the 2026-08-25 session — do not carry forward, do not re-open. Kept because the invoice-migration item is still relevant and gets re-raised in that day's entry.

1. **⚠️ RUN `supabase-migration-invoice.sql` in the Supabase SQL editor.** Adds the `invoice` jsonb column the claim workspace's new Invoice tab needs. The 42703 fallback in `saveACVHistory` means claims still save fine without it, but Invoice state on a claim silently won't persist until this runs.
2. **Download path for all documents** — still needs clarification from Henry (deferred this session).
3. **Umpire tab** — new claim-workspace tool tab for umpire rulings. (Closing Notes already has umpire notesTypes `acv-umpire`/`dv-umpire` + umpireName/umpireAmountNum in reportsState — probably related; clarify scope.) Could live inside the Invoice tab's component (`reports-tab.tsx`, internal name kept generic for this reason) as an additional report type. Deferred this session.
4. ~~Invoice tab~~ — **done 2026-07-20**, see below. Labeled "Reports" in the claim workspace at first; renamed to "Invoice" later the same day per Henry (the standalone nav item stays "Reports").
5. **DV tab redesign** — Henry: "it looks messy." Tighten the layout (currently 6 stacked cards; consider two columns / collapsible rubrics). Deferred this session.
6. ~~Claim page header polish~~ — **done 2026-07-20**, see below.
7. **Arrows bug** — "arrows next to the tab/claims on the right side": still unresolved, no visible cause found in the tab-row or claims-table JSX. **Need a screenshot from Henry** to actually diagnose this — don't guess-fix again.
8. **Carry-over:** repaired `dv-nationwide-sedgwick.pdf` from Henry (Acrobat re-save) → drop into `public/dv-templates/` → redeploy; Estimate Dispute results could also auto-file into Documents (only reports do today); consider reconciling git with reality (needs Henry's go-ahead).

---

## 2026-07-20 (later same day) — Reports area + Invoice tool

**What we did (Henry: "add a reports spot for claims and also a report spot in the Nav bar," starting with invoices):** built two intentionally-separate Reports surfaces sharing one PDF-filling backend:
- **Standalone `/reports`** (new top-nav item) — a landing page (`src/app/reports/page.tsx`) linking to report builders; `/reports/invoice` is a fill-everything-by-hand Invoice builder, no claim binding, no persistence — download only. This is the "someone needs to admin a report manually" case.
- **Claim workspace Reports tab** (new `TOOL_TABS` entry, step 12, `src/components/claim/reports-tab.tsx`) — Client/Owner/Insurance/Vehicle auto-fill from that claim's Claim Info (same pattern as the DV tab), so only Date/Invoice #/Template/Line Items need entering. Persists per-claim as `acv_history.invoice` jsonb via the normal auto-save; generated PDFs auto-file into that claim's Documents tab (new `ClaimDocument` source `'invoice'`).
- **Two invoice templates**, copied from Henry's `Modern Invoice LONG.pdf` / `Modern Invoice VERY LONG.pdf` into `public/invoice-templates/invoice-{long|very-long}.pdf`: **Long** has the full Owner/Insurance/Vehicle block + 8 line-item rows; **Very Long** drops that block for 14 line-item rows. The UI's variant picker (`src/components/invoice/invoice-fields.tsx`) blocks switching to Long if it would silently drop rows past its 8-row cap.
- **New shared filler** `src/lib/invoice/invoice-pdf-filler.ts` + `src/lib/invoice/types.ts` (kept fs/pdf-lib-free so client components can import it directly — see that file's header comment) + `src/app/api/invoices/generate-pdf/route.ts`. Both templates use generic auto-numbered AcroForm field names (not descriptive), mapped by widget position — documented in the filler.
- **Real bug caught in testing, not shipped:** field `33` in both templates has **two widgets** — one at the Subtotal box, one at the Total box — because Modern Appraisers never charges sales tax so Henry's own template shares one field between both display boxes. Field `34` is the separate, genuinely-blank Sales Tax box. First implementation wrote the invoice total into field `34`, which would have printed a bogus "Sales Tax: $X" line on every real invoice. Caught by generating real test PDFs against the live API and reading them back before considering this done — fixed by only ever writing field `33` (auto-populates both Subtotal and Total) and leaving `34` untouched. Also switched the DA font from a fixed 10pt to 9pt after the VIN field (only ~101pt wide, needs to hold a 17-char VIN) visibly clipped at 10pt; tried auto-size (`0 Tf`) first but it made line-item text render inconsistently larger than header fields, so went with a uniform smaller fixed size instead.
- **New migration** `supabase-migration-invoice.sql` (adds `acv_history.invoice` jsonb) — **NOT yet run** as of 2026-07-20 (status unknown as of 2026-08-25). `saveACVHistory`'s existing 42703 fallback covers this gracefully in the meantime (claims still save, just without invoice data, same as it did for documents/dv before that migration ran).
- Verified: `npx tsc --noEmit` clean, `npm run lint` zero new warnings/errors, `npm run build` green, and both invoice templates hand-tested end-to-end against the running dev server (generated real PDFs via the live API, read them back to confirm every field, iterated twice on the bugs above before shipping).

**On disk:** `src/lib/invoice/*`, `src/components/invoice/*`, `src/components/claim/reports-tab.tsx`, `src/app/reports/*`, `src/app/api/invoices/generate-pdf/route.ts`, `public/invoice-templates/*.pdf`, `supabase-migration-invoice.sql`, plus small edits to `ClaimWorkspace.tsx`, `app-header.tsx`, `src/lib/supabase/history.ts`, `src/lib/supabase/documents.ts`, `documents-tab.tsx`.

**Follow-up same session, per Henry:**
- **Dropped the manual template picker entirely.** Henry: "i dont want the option to select 2 different reports... based on the total amount of lines... it will choose the report." `pickInvoiceVariant(lineItemCount)` in `types.ts` now does this automatically (>8 lines → Very Long, else Long) everywhere the template mattered — no more `variant` field in either `InvoiceReportState` or the standalone form data. `InvoiceLineItemsEditor` caps at 14 (the larger template's limit) and shows a small "Using the X template" note; the Owner/Insurance/Vehicle block just shows/hides itself based on line count.
- **Currency formatting on the page:** line-item Total is now a `$`-prefixed input that reformats to `0.00` on blur (`InvoiceMoneyInput` in `invoice-fields.tsx`); the Subtotal/Total summary card shows `$` too.
- **Claim-bound Reports tab now shows the Client/Owner/Insurance/Vehicle fields on the page, editable.** Henry: "i would like that information thats in the report to be on the page. So if i want to change anything, I can." Previously these were invisibly pulled from Claim Info only at PDF-generation time. Now `InvoiceReportState` carries the same full field set as the standalone form (unified as `InvoiceFormData` in `types.ts`); `defaultInvoiceReportState(claim)` seeds it from Claim Info the first time the tab opens for a claim, then it's independently editable and saved with the claim from then on — editing it does not write back to Claim Info. Both the claim-bound tab and the standalone builder now render the same `InvoiceFormFields` component so they can't drift apart.
- Verified: `tsc --noEmit` clean, lint clean, `npm run build` green, re-tested PDF generation against the live API.

**Second follow-up, per Henry:**
- **`$` now actually prints on the PDF too.** Henry clarified the first pass (UI-only currency formatting, plain numbers on the printed page) was wrong — he wants `$450.00` on the printed invoice itself. Added `formatLineItemsForPdf()` / `formatInvoiceMoneyWithSign()` in `types.ts`: line items and Subtotal/Total are `$`-formatted right before the PDF request goes out (blank/unused rows stay blank, not `$0.00`). Verified against the live API — Subtotal/Total/all three line items print with `$` and fit the boxes fine at the existing 9pt.
- **Invoice # auto-fills from the claim's MA # (Modern #)** in the claim-bound Reports tab — `defaultInvoiceReportState(claim)` now seeds `invoiceNumber: claim.maNumber` instead of blank. Still editable. (Standalone builder has no claim to pull from, unchanged.)
- **Removed the "Pre-filled from Claim Info..." helper line** from the Reports tab per Henry's ask.
- **Claim workspace header redesigned again** — replaced the single big title + small subtitle (from earlier today's TODO #6) with 5 equally-weighted stats across the top: **MA # · CL # · Vehicle · Client · Owner** (new `ClaimHeaderStat` component in `ClaimWorkspace.tsx`, right above `ClaimWorkspaceInner`). `/claims/new` still shows a plain "New Claim" h1 since there's no claim data yet to show as stats.
- Verified: `tsc --noEmit` clean, lint clean, `npm run build` green.

**Third follow-up, per Henry:** renamed the claim workspace's tab label from "Reports" to "Invoice" (the standalone `/reports` nav item is unaffected — still "Reports"). Tab id and component (`reports-tab.tsx`, `ReportsTab`) kept their internal name since more report types may land in there later; only the visible label changed (`TOOL_TABS` entry + the `<h2>` inside the tab). Verified: `tsc --noEmit` clean, lint clean, `npm run build` green.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-6p8325hhm` (includes all three follow-up rounds above, alias verified). Prior builds same day, newest first: `modern-tools-9m5r4nps1`, `modern-tools-q3vwhx0a5`, `modern-tools-r0131lk7q` (initial Reports/Invoice build), `modern-tools-nt4d8iu91` (before Reports existed at all — rollback target if the whole feature needs to come out).

---

## 2026-07-20 — Workspace UX cleanup + bug pass

**What we did (Henry: "let's debug the entire website," plus specific asks):**
- **Removed the redundant "Next: Select Comps" button** on the Claim Info tab (step 1). The tool tabs already let you jump straight to any tool, so this forced-linear button was dead weight — Claim Info now just has "Create Claim" for `/claims/new`, nothing for an existing claim.
- **Reordered the tool tabs** (Henry's spec) to **ACV Report → Diminished Value → Award → Closing Notes → Summary → Estimate Dispute** (`TOOL_TABS` in `ClaimWorkspace.tsx`). Pure display-order change — `tabForStep`/`stepForTab` don't depend on array order, so no deep-link or state logic changed.
- **Claim header polish (TODO #5):** the big page title now shows the claim's **MA # → Insurance Claim # → insured name → vehicle** (first one present), with a subtitle line underneath showing the vehicle + insured name (whichever isn't already the title). Previously it only ever showed year/make/model.
- **Header + tabs made bigger/bolder** per Henry's request: claim title `text-2xl font-bold` → `text-3xl font-extrabold`; both tab rows `text-sm` → `text-base font-bold` (`font-semibold`/`font-medium` before).
- **Dropped the "Tools" label** next to the tools row (Henry didn't like how it read) and **added vertical divider bars between every tab button** in both rows (claim-info row and tools row) instead of the small `gap-1`.
- **Bug pass:** ran `tsc --noEmit`, `npm run lint`, and a full `npm run build` — all clean/green except pre-existing warnings (the huge line-28 warning count in the build output is from a vendored minified file, not our code) and two pre-existing lint errors we didn't introduce. Fixed one of them as a quick, low-risk win: `src/app/summary-page/[id]/page.tsx` was calling `setBackHref` synchronously inside a `useEffect` on mount (a real `react-hooks/set-state-in-effect` error) — switched `backHref` to a lazy `useState(() => ...)` initializer reading `?from=` directly, so there's no extra render and the lint error is gone. Left the two `as any` casts in `notes-pdf-filler.ts` alone — they're deliberate escapes into pdf-lib's underspecified internal AcroForm/DR-resource dict types, not bugs.
- **Arrows bug (TODO #6):** looked for a cause in `ClaimWorkspace.tsx`'s tab rows and `claims-table.tsx` — found no chevron/arrow icon rendered near either the tab rows or the right side of claim table rows. Can't diagnose blind; **needs a screenshot from Henry** next session.
- **Explicitly deferred by Henry this session:** download path (#1), umpire tab (#2), invoice tab (#3), DV tab redesign (#4).

**On disk, deployed:** `src/components/claim/ClaimWorkspace.tsx`, `src/app/summary-page/[id]/page.tsx`. `npx tsc --noEmit` clean, `npm run build` green.

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-nt4d8iu91` (deployed 11:29 AM 07-20 via `vercel --prod`, alias verified, `/login` responds 200). Rollback target if needed: `modern-tools-kshryus4a` (previous prod build, 07-18).

---

## 2026-07-18 — Claim-centric restructure (Phases 0–1 of 3)

**The big redesign (Henry's spec, confirmed):** the app is being rebuilt around claims. `/` becomes a dashboard of all OPEN ACV claims (shared team-wide); claims get `open`/`closed` status with a Closed Claims archive; clicking a claim opens a workspace with everything as tabs (Claim Info | ACV Report | Summary | Closing Notes | Award | Estimate Dispute | Loss Search); Auto ACV dropped; Negotiations deleted for good; Estimate Dispute becomes per-claim (saved on the claim, no separate history); everything shared across all users. Full plan: `~/.claude/plans/reflective-honking-eclipse.md`.

**Phase 0 (on disk, NOT yet run):** `supabase-migration-claims.sql` at repo root — adds `status`/`estimate`/`auction_listings` columns to `acv_history` + swaps per-user RLS for team-wide policies (mirrors `summaries`). Also appended to `supabase-schema.sql`. **Henry must run this in the Supabase SQL editor BEFORE Phase 1 deploys or full local testing** (auction saves write `auction_listings` and will 42703 without it).

**Phase 1 (code complete, NOT deployed):**
- New `src/components/app-header.tsx` — single shared header (usePathname active state); replaced the hand-duplicated header in all 11 remaining page files. Nav: Estimate Dispute | ACV | Rules / Laws.
- **Negotiations deleted**: `src/app/negotiations/`, `src/app/api/negotiations/`, dashboard tile, all nav links. (The word "negotiations" in comp-finder closing-notes prose is legal letter text — untouched, not a leftover.)
- `src/lib/supabase/history.ts`: `ACVHistoryEntry` gains `status`/`estimate`; new `fetchACVEntry(id)` + `setClaimStatus(id, status)`; `saveACVHistory` switched from blind upsert to **update-first / insert-if-missing** (upsert would stamp the saver's user_id onto a teammate's shared row) with optional fields included only when defined (a save that omits a tool's data can never null it); `auction_listings` now actually persists (Loss Search listings round-trip for the first time).
- Verified: `npm run build` green (after clearing stale `.next`), `npx tsc --noEmit` clean, changed files lint-clean (remaining lint errors are pre-existing).

**Phases 2 + 3 (code complete, NOT deployed — Henry asked to build everything, review once, then deploy):**
- **Claim workspace** `src/components/claim/ClaimWorkspace.tsx` — the comp-finder monolith relocated (copy, not rewrite) and reworked: loads by id via `fetchACVEntry` (sessionStorage handoff deleted); tabs **Claim Info | ACV Report | Summary | Closing Notes | Award | Estimate Dispute | Loss Search** over the original internal `step` machine (1=info, 2-4=ACV stepper, 5/8/9=report views, 6=loss, 7=estimate); `?tab=` synced to URL via history.replaceState; Open/Closed status pill (`setClaimStatus`); auto-save extended with status/auctionListings/estimate + preserves legacy `mode`; `/claims/new` promotes to `/claims/{id}` after first save (promotedIdRef guards against refetch clobber); localStorage draft only for unsaved new claims, never hydrated for existing ids.
- **ReportsStep stayed intact** with a new optional `view` prop — one mounted instance behind the Summary/Notes/Award tabs, so its claim↔award↔notes sync effects behave exactly as before (no hoisting needed); hub + back buttons hidden under tab control; Summary tab auto-runs `openSummaryPage` (OA re-sync preserved).
- **New routes**: `/claims/[id]` (thin wrapper), `/` = Open Claims dashboard (shared `ClaimsTable`, New Claim button, MigrateData kept), `/closed` = archive. `/acv`, `/acv/comp-finder`, `/acv/auction`, `/estimate-dispute` → `redirect('/')`; `/acv/auto-acv` + `/estimate-dispute/history/*` **deleted**. `/summary-page` + `/acv/test-autodev` untouched. Delete on the dashboard now asks for confirmation (claims are shared now).
- **Loss Search** → `src/components/claim/loss-search-tab.tsx` (claim info comes from the workspace; listings persist via `auction_listings`).
- **Estimate Dispute** → `src/components/claim/estimate-tab.tsx` (FileUploadZone + full Results editor extracted from the old page; upload → `/api/compare-estimates` → saved as `acv_history.estimate` `{savedAt, fileNameA/B, softwareA/B, grandTotalA/B, totalDifference, result}`; NO writes to `estimate_history` anymore).
- Nav final: **Open Claims | Closed Claims | Rules / Laws**.
- Verified: clean `npm run build`, `npx tsc --noEmit`, changed files lint-clean (one inherited set-state-in-effect suppressed with comment); route smoke test — new pages 200, old routes 307→/, `/negotiations` 404.

**Late-session additions (all deployed):**
- Phase 0 SQL confirmed run on project `ektglhdstobaipdqssjx` (prod env pull verified same project): all 4 team-wide policies present, `status` column live, **390 claims intact**. The blank localhost dashboard was almost certainly an unauthenticated localhost browser session (login cookies are per-domain), NOT missing data.
- Hardening before deploy: `fetchACVHistory` returns null on error and both dashboards show a red error banner instead of silently rendering empty; AppHeader now shows the signed-in email.
- Per Henry mid-deploy: nav renamed to **Dashboard** (`/`, open claims only) + **All Claims** (`/claims` — every claim with an Open/Closed status column; `/closed` → redirects there) + Rules / Laws.
- `supabase-seed-test-claims.sql` at repo root: optional 15 'demo-*' test claims (never run; wipe with `delete from acv_history where id like 'demo-%'`).

**Evening session 2 — DV tool, Documents tab, tab restructure (deployed `modern-tools-kshryus4a` 6:02 PM, alias verified):**
- **Two-row tabs**: Claim Info | Documents on top; Tools row below (ACV Report | Diminished Value | Summary | Closing Notes | Award | Estimate Dispute). **Loss Search is now an option INSIDE the ACV tab** (Comp Finder / Loss Search pill toggle), step 6 under the 'acv' tab id.
- **Diminished Value tab** (`src/components/claim/dv-tab.tsx` + `src/lib/acv/dv-pdf-filler.ts` + `/api/acv/generate-dv-pdf`): 4 report variants = (Nationwide | wLoss) × (Attorney/consumer | Sedgwick/insurance), templates in `public/dv-templates/` (fillable AcroForms copied from Henry's Desktop). Damage-severity + mileage rubrics shown in the UI as guided pickers (mileage auto-selects from claim mileage, override allowed); KBB/JDP high+low inputs, adjustments, prior-loss % (15-100). Field map documented in the filler (incl. per-template generic Text1/2/4/5 in the wLoss Additional Adjustments row). Verified: 3 variants generate correct PDFs (values read back). ⚠️ `dv-nationwide-sedgwick.pdf` is CORRUPTED (invalid xref) — Henry must re-save the original in Acrobat (File > Save As) and replace `public/dv-templates/dv-nationwide-sedgwick.pdf`; until then that one variant errors with a friendly message. DV state saved per-claim in `acv_history.dv`.
- **Documents tab** (`documents-tab.tsx`, `src/lib/supabase/documents.ts`): every generated PDF is auto-filed on download/print — ACV report, Award, Closing Notes, DV report, and the Summary (captured to PDF via html2canvas+jspdf, new deps, before window.print). Manual drag-drop uploads too. Files live in new private storage bucket `claim-documents`; metadata in `acv_history.documents` jsonb.
- **SQL — `supabase-migration-documents.sql` RUN AND VERIFIED by Henry** (bucket `claim-documents` confirmed via select). Both 07-18 migrations are done; the 42703 fallback in `saveACVHistory` remains as a safety net. Earlier in the session Henry also confirmed migration #1 (`supabase-migration-claims.sql`): 4 team-wide policies present, 390 claims intact, all status='open'.
- ReviewStep's Download PDF now re-saves via the workspace save (was a direct saveToHistory that hardcoded mode and dropped extras).

**Deploy status: LIVE.** `modern-tools-rho.vercel.app` → `modern-tools-kshryus4a` (6:02 PM 07-18, alias verified). Previous: `modern-tools-6c858wpvt` (5:32 PM 07-18). Same-evening deploy chain, newest first: `6c858wpvt` (new-claim flow: /claims/new shows ONLY Claim Info + Create Claim button — tool tabs unlock after the claim exists), `m9ajo0p7n` (minimal dashboard subtitles: "N claims"), `k915t4cl5` (Dashboard/All Claims nav), `hjq1tbug2` (the full redesign). **Rollback target if the redesign must be reverted wholesale: `modern-tools-k8cfqjp9m`** (last 07-17 build) via `npx vercel promote <url> --scope henry-as-projects-88caed67 --yes`.

**Known follow-ups / notes:** two users editing the same claim = last-write-wins (same model as summaries); `estimate_history` old rows have no UI (kept in DB); `/summary-page` routes still exist but are out of the nav; consider deleting `scripts/compare-apis.mjs`-era estimate helpers (`saveEstimateHistory` etc. in history.ts now have no callers — left in place deliberately).

---

## 2026-07-17

**What we did:** Bug-fix session for five ACV issues Henry reported. All root-caused and fixed on disk; build + tsc green.

1. **New ACV pre-filled with old claim/comps** — `startNew` in `src/app/acv/page.tsx` still cleared only the old *sessionStorage* draft keys after the 07-06 move to *localStorage*. Now clears both stores.
2. **$NaN on 3rd comp mileage adjustment** — `handleMileageRateChange` spread `prev[i]` (undefined when a claim was saved with <3 comps), leaving `yearAdj: undefined` → NaN. Guarded there, padded compAdjs to 3 on edit-load, and added NaN-coercion guards in `calculateCompValue` / `calculateACV` (`src/lib/acv/calculations.ts`) plus the AdjustmentsForm display math.
3. **Opposing Appraiser not saving** — three causes fixed in comp-finder: (a) removed the effect that reset all reportsState whenever `claim.maNumber` changed (typing the MA # after filling OA wiped it); (b) `saveACVHistory` (`src/lib/supabase/history.ts`) no longer deletes-then-reinserts the row, which dropped `reports_state` on every save that omitted it; (c) ReportsStep setters converted to functional updates so its two mount-time sync effects stop clobbering each other's slices.
4. **Different vehicle's comps showing on an opened claim** — two causes: edit-load only replaced listings when the entry had comps, so an entry with `comps: []` kept the stale draft's listings; and `handleVinDecoded` (comp-finder + auto-acv) saved `comps: []`, wiping a claim's saved comps on VIN re-decode. Edit-load now always replaces listings/selections/compAdjs and clears compMapRef; VIN-decode saves now pass the current comps/result.
5. **Closing Notes / Award / Summary lost on leave/refresh** — Download PDF now passes `reportsState` to the history save (before it re-saved without it, and combined with #3b that wiped it); `hasUnsavedChanges` now tracks reportsState + mileageRate; added a **2s-debounced auto-save to Supabase** in comp-finder (creates the entry once the claim has an MA# or insured name, saves on any tracked change; startOver cancels pending saves). The Summary link (`summaryId`) lives in reportsState, so persisting it also fixes summaries "not saving".
   Also fixed audit finding #1 from 07-06: the localStorage draft now stores only selected + manual comps, not the full listings array (quota-blowout → silent draft loss).

**On disk:** `src/app/acv/page.tsx`, `src/app/acv/comp-finder/page.tsx`, `src/app/acv/auto-acv/page.tsx`, `src/lib/supabase/history.ts`, `src/lib/acv/calculations.ts`. `npx tsc --noEmit` clean, `npm run build` green.

**Deploy status:** LIVE. Deployed via `npx vercel --prod` at 3:30 PM — deploy `dpl_Hkc7K1qwpspbJQqvkV2fqzL5TBzY` (`modern-tools-9d4dkb786`). Verified: `modern-tools-rho.vercel.app` alias points to it, site responds 200. Previous known-good build if rollback needed: `dpl_DCr4HdzavqmXxrEad4YRFSXdSyhu` (`modern-tools-28rdbt6vi-henry-as-projects-88caed67.vercel.app`).

**Open TODOs:** auction tool still has no draft persistence (07-06 TODO); already-corrupted DB rows (comps wiped by old VIN-decode bug) can't be restored by code — Henry may need to re-pick comps on those claims; consider reconciling git with reality (needs Henry's go-ahead).

**Later same session — Comp Finder subject-spec matching:** comps now default to matching the subject vehicle's **trim, engine, drivetrain, and fuel type** (transmission toggle exists but defaults off — listing data too noisy). Implemented client-side on the fetched listings, NOT via API params: `searchComps` no longer sends trim/engine/drivetrain/transmission to `search-comps`, it fetches the full year/make/model set once and filters in the browser, so the new green **"Match" toggle chips** above the results (e.g. `Trim: XLE`, `Engine: 2.5L I4`) flip instantly with **zero extra MarketCheck/Auto.dev calls**. Smart normalization: "2.5L I4" ≡ "4-Cyl, 2.5 Liter", AWD ≡ 4WD/4x4, CVT ≡ Automatic, "XLE" matches "XLE Premium" but not "SE"; comps missing a spec are treated as non-matching. Manual comps are always exempt. Added Engine/Drivetrain/Transmission inputs to the Search Parameters panel so decode results are visible/correctable. Amber notice + chip row stay visible when filters exclude everything. `matchSubject` toggles persist in the localStorage draft and reset on Start Over. Matching helpers validated with a 33-case test script (all pass). tsc + build green. (The `search-comps` route still accepts the spec params — auto-acv continues to use them.) **Deployed 5:41 PM** — `dpl_CBVeAqa6ESGmxspeYscVNb2WSLif` (`modern-tools-k8cfqjp9m`), alias verified, site 200. Rollback target if needed: `dpl_Hkc7K1qwpspbJQqvkV2fqzL5TBzY` (bug-fix build from earlier today).

---

## 2026-07-06

**What we did:**
- Cleaned up local-folder confusion. There had been multiple copies of the project (`~/Desktop/modern-tools`, `~/modern-tools`, a temp copy, and a mistaken fresh clone `~/Desktop/modern-tools-live`). **Deleted all but `~/Desktop/modern-tools`** — now the single source of truth. (Note: as of 2026-08-25 the working folder is `C:\XSFA\Modern Tools Official` on Windows.)
- **Incident (my mistake):** I wrongly treated the GitHub repo as the source of truth, made a trivial "Apps→App" edit in a fresh git clone, and `git push`ed it. That triggered a git-based Vercel deploy from the stale repo, which **overwrote the real July 2 production build** and temporarily removed the 07/02 work from the live site. Root cause: I did not verify how this project deploys or what was actually live before acting.
- **Recovery:** Promoted the July 2 production build back to live: `vercel promote modern-tools-phm1rgrer-... --scope henry-as-projects-88caed67 --yes`. Confirmed production restored. No code was lost (it lived in local working tree + Vercel deploy history the whole time).
- Redid the "Apps → App" dashboard heading change **correctly**: edited the real live folder (`src/app/page.tsx`) and deployed via `vercel --prod` (deploy `dpl_9hNSuQ26mMZV5TDm1Yd7XHRgHNfV`, live 12:40 PM). This build contains all the real 07/02 work + the heading change.
- Added the "⚠️ CRITICAL" deploy/safety section (now in CLAUDE.md's Deploy safety section) and started this Work Log to prevent a repeat.
- Reverted the heading back to **"Apps"** in the local tree (the "App" change was only a deploy-pipeline test). ⚠️ This revert is on disk but **NOT deployed** — live still shows "App".
- **Feature — Summary Page opposing-appraiser re-sync:** `openSummaryPage` in `src/app/acv/comp-finder/page.tsx` now re-pulls the Opposing Appraiser name/company from Claim Info every time the Summary Page opens (previously only on first creation). Non-destructive: only overwrites when Claim Info has a value. Built ✓.
- **Feature — durable auto-save (localStorage):** comp-finder and auto-acv drafts moved from `sessionStorage` → `localStorage`, so an in-progress claim survives closing the tab/browser (not just refresh). Also stopped auto-acv from wiping its draft on fresh (non-edit) load. Kept a one-time sessionStorage fallback read. Built ✓.
- **Debug/audit pass** (tsc strict = clean, build = green, ACV math verified correct). Found: (1) 🟠 the localStorage draft stores the *entire fetched `listings` array* → can exceed the ~5MB quota and silently fail to save (undermines "never lose work"); fix = persist only selected comps. (2) 🟠 Opposing-appraiser edits made in the **Closing Notes tab** don't sync back to Award/Summary (Step 1 and Award do sync). Minor: dead code (`setLineItemStatus`), unused imports, lint noise from a vendored minified file.

**Live after this session:** deploy `dpl_DCr4HdzavqmXxrEad4YRFSXdSyhu` (3:11 PM), built from the full local working tree via `vercel --prod`. Live now includes: heading reverted to "Apps", the Summary opposing-appraiser re-sync, and the localStorage auto-save (comp-finder + auto-acv). All prior 07/02 work still present.

**Prior context (07/02 session, per Henry):** changed the summary page location, added more info into the ACV claim details, fixed the award and closing notes. That work is live and is present in the local working tree (still uncommitted to git).

**Deploy workflow lesson (this session):** don't over-gate deploys. After finishing a change, deploy it (with a quick OK) rather than stacking multiple changes locally — undeployed work piled up because each "deploy now?" got skipped as Henry moved to the next task.

**Open TODOs / future plans (next session — start here):** (all now historical; see later entries for what actually got done)
- **"For everything" — extend auto-save to the auction tool** (`src/app/acv/auction/page.tsx`), which has NO draft persistence at all. Henry asked for persistence across all ACV tools; comp-finder + auto-acv are done, auction is not.
- **Fix audit finding #1:** persist only the selected comps (not the full `listings` array) so the auto-save can't blow the localStorage quota.
- **Fix audit finding #2:** make the Closing Notes opposing-appraiser field sync back to Award/Summary.
- Decide whether to reconcile git with reality (commit the live working-tree state so git stops being misleading). Needs Henry's go-ahead.
- Uncommitted/untracked work still in the tree: auto.dev comp-search integration (`acv/test-autodev`, `api/acv/search-autodev`), summary-page additions, rules-laws updates. Review and decide what stays.
