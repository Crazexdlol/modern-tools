# HamsPortal Rebrand — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the "Modern Tools" platform name from every visible surface and every code identifier. The login page shows the HamsPortal logo + name; the browser tab title, package/deploy names, help-assistant, and auto-message senders all become "HamsPortal". Post-login stays branded as Modern Appraisers because Eagleview has no users yet (Phase 3).

**Architecture:** Straight string-and-asset swap driven by the audit inventory. No behavior changes, no new abstractions, no schema changes. Modern Appraisers users see the new login page, log in, and land on their unchanged dashboard.

**Tech Stack:** Same as Phase 1 — Next.js 16.3.5, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-hamsportal-multi-company-design.md` (Section §1 covers this phase).

**Explicitly deferred to Phase 3:**
- Moving `public/logo.png` → `public/companies/modern-appraisers/logo.png`. The MA logo stays at `/logo.png` in Phase 2 (post-login header + storage-pdf still work as-is). Phase 3 does the folder reorg when Eagleview joins.
- Moving PDF templates under `public/companies/{slug}/templates/`. Phase 2 leaves them at `public/*.pdf`; Phase 3 handles the per-company template resolution.
- Renaming existing `-- Modern Tools —` comment headers in old migration files (`supabase/migration-*.sql`). Historical; new migrations use `-- HamsPortal —`.
- Historical spec/plan docs under `docs/superpowers/` — history, not touched.
- `docs/SESSIONS.md` old entries — history, not touched. New entries use "HamsPortal".
- Renaming the local folder `C:\XSFA\Modern Tools Official`, the Vercel project (`modern-tools`), and the GitHub repo (`Crazexdlol/modern-tools`) — per Henry's instruction, leave those alone. The `modern-tools-rho.vercel.app` alias keeps working forever as a legacy URL alongside `hamsportal.com`.

---

## File structure

**New files:**
- `public/hamsportal-logo.png` — the HAMS blue-H logo (staged in `backups/pre-hamsportal-2026-09-16/hamsportal-logo.png`).

**Modified files:**
- `src/app/login/page.tsx` — swap logo to `/hamsportal-logo.png`, swap heading text to "HamsPortal".
- `src/app/layout.tsx` — `metadata.title` becomes `"HamsPortal"`.
- `package.json` — `"name": "hamsportal"`.
- `package-lock.json` — 2 occurrences of `"name": "modern-tools"` become `"name": "hamsportal"`.
- `src/app/help/help-client.tsx` — 2 hits ("Ask me anything about how to do something in Modern Tools" + "Henry only answers how-to questions about Modern Tools").
- `src/app/api/help/ask/route.ts` — 5 hits in the system-prompt string that defines platform identity for the AI.
- `src/app/api/claims/[id]/auto-message/route.ts` — `sender_name: 'Modern Tools (Auto)'` → `'HamsPortal (Auto)'`.
- `src/app/api/claims/[id]/phase/route.ts` — same.
- `src/app/api/cron/status-requests/route.ts` — 2 same.
- `src/components/claim/ClaimWorkspace.tsx` — client-side POST that sends `senderName: 'Modern Tools (Auto)'`.
- `scripts/seed-help-articles.mjs` — 4 hits in seed content that talk about "Modern Tools".
- `CLAUDE.md` — update the top-level intro line that says "Modern Tools" is the app name; the historical body stays.

---

### Task 0: Stage the HamsPortal logo into `public/`

**Files:**
- Create: `public/hamsportal-logo.png` (copy from `backups/pre-hamsportal-2026-09-16/hamsportal-logo.png`)

- [ ] **Step 1: Copy the logo file**

```bash
cd "C:\XSFA\Modern Tools Official" && cp "backups/pre-hamsportal-2026-09-16/hamsportal-logo.png" "public/hamsportal-logo.png" && ls -la public/hamsportal-logo.png
```

Expected: File shown at ~315KB.

- [ ] **Step 2: Confirm it's a valid PNG (magic bytes)**

```bash
cd "C:\XSFA\Modern Tools Official" && head -c 8 public/hamsportal-logo.png | xxd | head -1
```

Expected: `89 50 4e 47 0d 0a 1a 0a` (PNG signature).

- [ ] **Step 3: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add public/hamsportal-logo.png && git commit -m "assets: add HamsPortal logo for login page"
```

---

### Task 1: Rebrand the login page

**Files:**
- Modify: `src/app/login/page.tsx` (lines 44–45)

- [ ] **Step 1: Read the current login page to see the exact block**

```bash
cd "C:\XSFA\Modern Tools Official" && sed -n '35,55p' src/app/login/page.tsx
```

Expected: shows the `<Image src="/logo.png" ... />` and `<h1>Modern Tools</h1>` block.

- [ ] **Step 2: Replace the logo and heading**

Find this block in `src/app/login/page.tsx`:

```tsx
<Image src="/logo.png" alt="Modern Appraisers" width={64} height={64} priority className="mx-auto" />
<h1 className="text-lg font-bold text-gray-900">Modern Tools</h1>
```

Replace with:

```tsx
<Image src="/hamsportal-logo.png" alt="HamsPortal" width={64} height={64} priority className="mx-auto" />
<h1 className="text-lg font-bold text-gray-900">HamsPortal</h1>
```

(If the surrounding attributes differ — width, priority, className — preserve them and only replace `src`, `alt`, and the heading text.)

- [ ] **Step 3: Type-check**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add src/app/login/page.tsx && git commit -m "rebrand: login page shows HamsPortal logo + name"
```

---

### Task 2: Update browser tab title

**Files:**
- Modify: `src/app/layout.tsx` (line 17)

- [ ] **Step 1: Read the current metadata block**

```bash
cd "C:\XSFA\Modern Tools Official" && sed -n '10,25p' src/app/layout.tsx
```

Expected: shows `export const metadata: Metadata = { title: "Modern Tools — Modern Appraisers", ... }`.

- [ ] **Step 2: Replace the title**

In `src/app/layout.tsx`, replace:

```typescript
title: "Modern Tools — Modern Appraisers",
```

With:

```typescript
title: "HamsPortal",
```

- [ ] **Step 3: Type-check + commit**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit 2>&1 | tail -5 && git add src/app/layout.tsx && git commit -m "rebrand: browser tab title is HamsPortal"
```

---

### Task 3: Rename npm package to `hamsportal`

**Files:**
- Modify: `package.json` (line 2)
- Modify: `package-lock.json` (2 occurrences of `"name": "modern-tools"`)

- [ ] **Step 1: Update package.json**

Replace in `package.json`:
```json
"name": "modern-tools",
```
With:
```json
"name": "hamsportal",
```

- [ ] **Step 2: Update package-lock.json**

`package-lock.json` has `"name": "modern-tools"` in two places (root + the packages[""] entry). Update both.

```bash
cd "C:\XSFA\Modern Tools Official" && grep -n '"name": "modern-tools"' package-lock.json
```

Expected: 2 line numbers. Manually edit both to `"name": "hamsportal"`.

- [ ] **Step 3: Verify with npm install (idempotent)**

```bash
cd "C:\XSFA\Modern Tools Official" && npm install 2>&1 | tail -5
```

Expected: no errors, no new dep changes.

- [ ] **Step 4: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add package.json package-lock.json && git commit -m "rebrand: npm package renamed to hamsportal"
```

---

### Task 4: Update help-client.tsx user-facing strings

**Files:**
- Modify: `src/app/help/help-client.tsx` (lines 20 and 291)

- [ ] **Step 1: Find both strings**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -n "Modern Tools" src/app/help/help-client.tsx
```

Expected: 2 line hits (approximate line numbers 20 and 291).

- [ ] **Step 2: Replace both**

In `src/app/help/help-client.tsx`, replace `"Modern Tools"` with `"HamsPortal"` at each hit. Both are user-facing strings shown in the help chatbot UI.

If both hits are identical strings, use `replace_all` with the exact matched text. Otherwise edit each one individually preserving surrounding context.

- [ ] **Step 3: Verify + commit**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -c "Modern Tools" src/app/help/help-client.tsx && git add src/app/help/help-client.tsx && git commit -m "rebrand: help chatbot copy uses HamsPortal"
```

Expected: `grep -c` returns `0`.

---

### Task 5: Update help AI system prompt

**Files:**
- Modify: `src/app/api/help/ask/route.ts` (5 hits around lines 23, 26, 32, 45, 53)

The help assistant's system prompt introduces itself as an assistant for "Modern Tools". Update every mention to "HamsPortal" (the platform), while preserving "Modern Appraisers" wherever it refers to the actual company that uses the platform.

- [ ] **Step 1: Read the current prompt**

```bash
cd "C:\XSFA\Modern Tools Official" && sed -n '20,60p' src/app/api/help/ask/route.ts
```

- [ ] **Step 2: Replace platform-name mentions**

Every string like `"Modern Tools"` (referring to the platform) becomes `"HamsPortal"`. Strings like `"Modern Appraisers"` (referring to the company) stay as-is.

Cases to inspect carefully:
- `the in-app help assistant for **Modern Tools**` → `for **HamsPortal**`.
- `the internal tool Modern Appraisers uses` → keep MA name.

- [ ] **Step 3: Verify + commit**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -c "Modern Tools" src/app/api/help/ask/route.ts && git add src/app/api/help/ask/route.ts && git commit -m "rebrand: help AI system prompt uses HamsPortal as platform name"
```

Expected: `grep -c` returns `0`.

---

### Task 6: Update auto-message sender name in 4 routes

**Files:**
- Modify: `src/app/api/claims/[id]/auto-message/route.ts` (line 34)
- Modify: `src/app/api/claims/[id]/phase/route.ts` (line ~63 — after Phase 1 changes shifted line numbers)
- Modify: `src/app/api/cron/status-requests/route.ts` (2 hits — lines ~15 and ~167)
- Modify: `src/components/claim/ClaimWorkspace.tsx` (1 hit, sends `senderName` to auto-message endpoint)

Every `'Modern Tools (Auto)'` literal becomes `'HamsPortal (Auto)'`. This is the display name that shows up in the messages thread when an automated system message is posted.

- [ ] **Step 1: Locate all hits**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -rn "'Modern Tools (Auto)'" src/
```

Expected: 5 lines total (auto-message, phase, cron x2, ClaimWorkspace).

- [ ] **Step 2: Replace all 5 hits**

At each hit, replace `'Modern Tools (Auto)'` with `'HamsPortal (Auto)'`. Preserve any surrounding whitespace/indentation.

- [ ] **Step 3: Verify + commit**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -rc "'Modern Tools (Auto)'" src/ 2>/dev/null | grep -v ":0" && git add src/ && git commit -m "rebrand: auto-message sender is 'HamsPortal (Auto)'"
```

Expected: grep chain returns no lines (all counts are 0).

Note: this changes what appears in every FUTURE auto-message. Historical messages already in the DB still say "Modern Tools (Auto)" — those are immutable historical records.

---

### Task 7: Update seed-help-articles.mjs (help KB content)

**Files:**
- Modify: `scripts/seed-help-articles.mjs` (4 hits: lines ~67, 125, 130, 204)

This script seeds the help articles KB (`help_articles` table) with pre-canned Q&A that the help assistant uses. Existing rows in the DB still say "Modern Tools" — Henry can re-run the seed later to update them, or leave them (grep for "Modern Tools" in help_articles.answer/question and Henry decides).

- [ ] **Step 1: Find hits**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -n "Modern Tools" scripts/seed-help-articles.mjs
```

Expected: 4 line numbers.

- [ ] **Step 2: Replace each**

At each hit, change `"Modern Tools"` (or 'Modern Tools' single-quoted) to the HamsPortal equivalent. Inspect context — if a hit describes the app as a whole, use "HamsPortal". If it's referring to Modern Appraisers the company, preserve.

- [ ] **Step 3: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add scripts/seed-help-articles.mjs && git commit -m "rebrand: help articles seed content uses HamsPortal"
```

Note: this DOES NOT update existing DB rows. Henry can re-run `SUPABASE_SERVICE_ROLE_KEY='...' node scripts/seed-help-articles.mjs` later to refresh the KB if he wants.

---

### Task 8: Update CLAUDE.md intro line

**Files:**
- Modify: `CLAUDE.md` (the intro sentence around line 3 that says "Modern Tools" is the app name)

Keep the historical body of the file — session logs, deploy history, migration lists — as-is. Only update the top-level intro sentence.

- [ ] **Step 1: Read the top of CLAUDE.md**

```bash
cd "C:\XSFA\Modern Tools Official" && head -20 CLAUDE.md
```

- [ ] **Step 2: Edit the intro line**

Find the sentence in the header block that reads something like "This file tells Claude Code ... how to work on **Modern Tools** ...". Change "Modern Tools" to "HamsPortal (formerly Modern Tools)" — the parenthetical helps future context understand what the historical body is referring to.

Do NOT change any other "Modern Tools" mention in CLAUDE.md — the body describes prior sessions and it would be misleading to rewrite that history.

- [ ] **Step 3: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add CLAUDE.md && git commit -m "docs: CLAUDE.md intro line uses HamsPortal (former Modern Tools) name"
```

---

### Task 9: Pre-deploy verification (tsc, build, lint, tests)

- [ ] **Step 1: Full verification pass**

```bash
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit 2>&1 | tail -5 && echo "---BUILD---" && npm run build 2>&1 | tail -8 && echo "---LINT---" && npm run lint:no-raw-acv-queries 2>&1 | tail -3 && echo "---UNIT TESTS---" && npx vitest run __tests__/scoped-client.test.ts 2>&1 | tail -5
```

Expected: everything clean. If build errors on the login page (broken JSX / stale import), fix inline before proceeding.

- [ ] **Step 2: Confirm the ONLY remaining "Modern Tools" hits are in intentionally-preserved places**

```bash
cd "C:\XSFA\Modern Tools Official" && grep -rn "Modern Tools" src/ scripts/ CLAUDE.md 2>&1 | grep -v "^docs/superpowers/" | grep -v "SESSIONS.md"
```

Expected: EITHER empty, OR the only hits are in files that are intentionally preserving history (per the plan's deferred list).

If unexpected hits appear, decide per-hit whether to update.

- [ ] **Step 3: Capture the current live deploy URL as the rollback target**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|url" | head -2
```

Save the URL — it's the rollback target for Phase 2.

---

### Task 10: Deploy Phase 2 to production

- [ ] **Step 1: Deploy**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel --prod --scope henry-as-projects-88caed67 --yes 2>&1 | tail -12
```

- [ ] **Step 2: Confirm alias flipped to the new deploy**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|status" | head -3
```

Expected: new deploy id, status `● Ready`. Alias flipped.

---

### Task 11: Post-deploy smoke check

- [ ] **Step 1: Ask Henry to eyeball the login page on live**

Report the deploy id + URL. Ask Henry to hit `https://hamsportal.com` (or `modern-tools-rho.vercel.app`) in a private/incognito window without a session, and confirm:
- The HAMS blue-H logo shows.
- The heading reads "HamsPortal".
- The browser tab title reads "HamsPortal".
- After login → dashboard renders normally, Modern Appraisers logo still in the top-left header (post-login is unchanged).
- Opening a claim, sending a message, generating a PDF — all still work.

- [ ] **Step 2: Wait for confirmation before writing SESSIONS entry**

Do not mark this task complete until Henry confirms it looks right. If anything is off, roll back per Task 12.

---

### Task 12: (contingency) Rollback if login page is broken

- [ ] **Step 1: Rollback code deploy**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel promote <URL captured in Task 9 Step 3> --scope henry-as-projects-88caed67 --yes
```

- [ ] **Step 2: Confirm alias flipped back**

```bash
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|status" | head -3
```

No database rollback needed — Phase 2 is pure code / assets. Nothing changed in the DB.

---

### Task 13: SESSIONS.md entry for Phase 2

- [ ] **Step 1: Prepend new entry to `docs/SESSIONS.md`**

Add a new top entry with:
- Date + one-line title: "HamsPortal Phase 2 — login-page rebrand + platform-name swap deployed".
- Worked on: what changed.
- Changed: full file list.
- Deploy status: deploy id, alias verified, rollback URL.
- In progress / broken / unknowns: Phase 3 (Eagleview go-live) still pending.
- Next: Phase 3.

- [ ] **Step 2: Commit**

```bash
cd "C:\XSFA\Modern Tools Official" && git add docs/SESSIONS.md && git commit -m "docs: SESSIONS entry for HamsPortal Phase 2"
```

---

## Self-review

**Spec coverage checked:**
- HAMS logo on login page → Task 1.
- "HamsPortal" heading on login page → Task 1.
- Browser tab title → Task 2.
- Package name → Task 3.
- Help chatbot copy → Task 4.
- Help AI system prompt → Task 5.
- Auto-message sender in 4 routes → Task 6.
- Help articles seed → Task 7.
- CLAUDE.md intro → Task 8.

**Placeholder scan:** None found — every step has actual command or code excerpt.

**Type consistency:** No new types introduced. Text-and-asset swaps only.

**Correctness note:** Historical strings that reference "Modern Tools" as an already-happened session log entry stay put (SESSIONS.md, existing migration comment headers, prior spec/plan docs). Task 8 explicitly preserves the CLAUDE.md body for the same reason.

**Deploy sequencing:** Phase 2 requires no DB migration — pure code and assets. No coordination needed. Deploy safely lands the visible rebrand.
