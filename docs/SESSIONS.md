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
