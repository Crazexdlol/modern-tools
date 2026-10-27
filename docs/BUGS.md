# Known bugs — needs diagnosis + fix

Open bugs that are reproducible but not yet root-caused. Fix in order of appearance (newest at bottom = oldest at top; add new entries at the bottom).

---

## 2026-10-13 — Blank fields on claim workspace after creating a new claim (regression from today's deploys)

**Severity:** High (would block appraisers from working if deployed to prod again).

**Current status (2026-10-13 later same day):** Patched defensively, deployed as `dpl_AyAdkRndtfJ4dmoEnJikFs9faANF`. Root cause NOT identified. Fix is a session-storage handoff from `createClaim` to the post-navigation ClaimWorkspace mount — guarantees state survives whatever's causing the reset (remount, race, or some other React/Next.js reconciliation quirk), regardless of root cause. See "Defensive fix shipped" section below. Root-cause diagnosis still open for a future session when `npm run dev` is available to reproduce.

### Reproduction

1. User is logged in as admin (Henry SUPER, `henryaleksanyan@gmail.com`, user_id `ebd1466d-2667-4044-9872-703a415ef43d`, super_admin).
2. Navigate to `/claims/new`.
3. Upload an assignment-sheet PDF (confirmed with a Sedgwick/Eagle-View Vista sheet and a Modern Appraisers sheet).
4. Parser populates the form fields visibly in the UI.
5. Click **Create Claim**.
6. URL changes to `/claims/<realId>?tab=info`.
7. **BUG:** The workspace renders with all form fields showing `—` (empty), EXCEPT:
   - `MA Number` field shows the DB-assigned MA# (e.g. `555624`)
   - `Client Type` shows `Insured` (which is `defaultClaim()`'s hardcoded default)
   - Top header stat card shows the correct MA# but every other stat (`CL #`, `Vehicle`, `Client`, `Owner`) is `—`

### Confirmed facts

- **DB write path works.** Henry's test claim 555624 (Alfred Wang, 2011 Scion xB — actually BMW X7, Jerry Kang client, Geico) saved all 36 jsonb keys correctly to `acv_history.claim`. Same for 555625 (Ana Chavez, 2021 Dodge Challenger, GOOGLE client). Confirmed by direct Supabase query.
- **DB read works.** `fetchACVEntry(id)` with `select('*')` returns the full row. `rowToEntry` maps it to a full 36-field `ClaimInfo`.
- **The UI state (`claim` in `ClaimWorkspace.tsx`) is `defaultClaim()` with maNumber overridden.** This is deduced from the exact UI symptom: `clientType='Insured'` (defaultClaim default) + `maNumber=<real>` + everything else empty. No other state shape produces that pattern.
- **Hard refresh (Ctrl+Shift+R + "Clear site data" in DevTools) fixes it.** This means the broken JavaScript was coming from the service worker cache of a previous deploy's build, NOT from the currently-aliased deploy. The bug is in CODE that was deployed earlier today, which is cached in Henry's PWA installation.
- **No console errors.** Henry's console showed normal `[dashboard perf]` logs and `[addDocument] ✓ document filed to Documents: 555626-uploadedassignsheet(1).pdf`. No red errors or exceptions. The bug is a silent state-population failure, not a crash.
- **Not a RLS/permissions issue.** Admin can see the row (per DB inspect and per the server-component page.tsx admin bypass).
- **Not a save-side bug.** Saved rows have full data. The regression is purely on the LOAD / state-population side after `router.replace`.

### Deploys that contained the bug (identified by elimination)

Henry's cached broken JS came from one of these deploys made 2026-10-13:
- Phase A (handlingAppraiser → negotiatingAppraiser rename): `dpl_6YiKDMYc2fbJic8o56PP3SCVzaMA`
- Phase C+D (rough-numbers workflow): `dpl_7WGcpRRuvura7safq7iXU54i2Cw1`
- Auto-status email + Messages queue NULL-sender fix: `dpl_BfZaa5WisXRSmuAg8AsxMw1fgbKo`
- "(Auto)" removal from HamsPortal sender: `dpl_5pzCN4urjbiZdo5Q2zqpqi6ctRA6`
- LOU PDF label fix: `dpl_2m17GXNeCWduJWqZfbTwGmuYPmJ9`
- Vista parser fix: never deployed (held back locally)

The LOU fix, auto-status, and "(Auto)" removal are tiny, surgical changes to isolated files that don't touch the claim-save/load path. **Prime suspects:** Phase A rename or Phase C+D rough-numbers, both of which modified `ClaimWorkspace.tsx` state and effect wiring + `src/lib/supabase/history.ts` `rowToEntry` + `src/lib/auth/require-admin.ts` `fetchClaim`.

### Current local state

Local has ALL today's changes applied on top of the baseline:
- Phase A rename (handlingAppraiser → negotiatingAppraiser, ~25 files touched)
- Phase C+D rough-numbers (new state + effect + UI + schema)
- Auto-status email changes
- "(Auto)" removal
- LOU PDF label fix
- Vista parser fix (tested green on actual Vista PDF; not deployed)

The DB migrations (jsonb key rename + rough-numbers columns) are already applied in prod Supabase. **If local is deployed as-is, the regression returns.**

### Diagnostic plan for the next session

1. **Reproduce locally.** Need user approval to run `npm run dev` (classifier blocked it mid-session; one-time allow would fix). With dev server running, open `/claims/new` in a fresh incognito window, upload a PDF, click Create. React DevTools open on the ClaimWorkspace component. Watch the `claim` state transition at each step: (a) PDF upload fills state, (b) createClaim fires, (c) `router.replace`, (d) post-navigation render. If state resets, that confirms a remount.
2. **If a remount is confirmed**, instrument why. Likely culprit: something in Phase C+D changed the Reactively-identified component tree in a way that invalidates React's reconciliation across the `/claims/new` → `/claims/[id]` transition. Possibly the new `useEffect([clientId, isNew])` dependency change triggers a re-render that interacts weirdly with Next.js app-router soft-nav.
3. **If no remount, the load effect isn't populating state.** Instrument `fetchACVEntry` → `rowToEntry` → `setClaim(entry.claim)` chain with console logs. Possible culprits: `cancelled` flag flipping between fetch start and `.then()`, or a race where the promotedIdRef guard misfires.
4. **Last resort — defensive fix:** add a session-storage handoff in `createClaim` that stashes the full state keyed on the new id, drained in `ClaimWorkspace`'s useState initializer when the id matches. Guarantees state survives any remount/race. Not a root-cause fix but reliable.

### Files I inspected (clean, no obvious cause found)

- `src/components/claim/ClaimWorkspace.tsx` — three `setClaim(...)` call sites, all pass full objects. No code sets just `maNumber`.
- `src/lib/supabase/history.ts` — `rowToEntry` dual-read for `handlingAppraiser` is safe; `fetchACVEntry` uses `select('*')`.
- `src/lib/auth/require-admin.ts` — `fetchClaim` has cascade fallback for missing columns.
- `src/app/claims/[id]/page.tsx` — server component returns `<ClaimWorkspace claimId=... />` in both branches, same JSX structure.
- `src/lib/acv/parsers/eagle-view.ts` — parser works, PDF data IS saved to DB.
- No `setClaim(prev => ...)` anywhere.
- No `claim.handlingAppraiser` references remain in src/ (except intentional dual-read bridges).

### Defensive fix shipped (2026-10-13, `dpl_AyAdkRndtfJ4dmoEnJikFs9faANF`)

Three edits in `src/components/claim/ClaimWorkspace.tsx`:

1. **`createClaim` writes a session-storage handoff before `router.replace`.** Keyed by the new claim id. Payload is `{ claim, clientId, needsRoughNumbers }` — the state items a user is likely to have populated during the create flow.

2. **The useState initializers for `claim`, `clientId`, and `needsRoughNumbers`** check for `sessionStorage.getItem('claim-handoff-${claimId}')` on mount. If present, hydrate from it directly — bypasses the DB load entirely. If absent, falls back to the existing `draft.current?.claim ?? defaultClaim()` logic.

3. **`editingId` useState initializer** now reads from `claimId` when `!isNew` (so just-promoted mounts have the right id without waiting for the fetch).

4. **The load effect's guard** drains the handoff if it's there and skips the fetch. This both cleans up sessionStorage AND prevents a stale DB read from clobbering the just-typed values.

Why this works regardless of root cause: even if ClaimWorkspace remounts (which would reset useState and useRef values), sessionStorage survives. The new component instance reads the handoff on its very first render and starts with the right state. The old (promoted) ref-based guard is kept as belt-and-suspenders for the no-remount case.

Limitation: comps / listings / selectedIds / compAdjs / adjustments / result / mileageRate are NOT in the handoff. If a user built up comp search results on `/claims/new` before clicking Create AND a remount happens, those are still lost. In practice the Create flow is "fill Claim Info → click Create → then search comps on the ACV tab," so this gap doesn't bite real workflows. Can extend handoff if needed.

**Update 2026-10-20:** `reportsState` has been ADDED to the handoff. The original note above said it "doesn't bite real workflows" — that was wrong. Henry fills Opposing Appraiser (`notesData.appraiserName`) + Ins. Co. Offer (`notesData.insuranceOfferNum`) on the Create form before clicking Create. Both fields were being saved to DB correctly, but after the handoff path skipped the load fetch, the new instance initialized reportsState from `defaultReportsState` (empty), and the next autosave overwrote the DB value. Fix: `reportsState` is now in the handoff payload and drained by its useState initializer, matching the pattern already in place for `claim`, `clientId`, and `needsRoughNumbers`.

### Rollback command (keep handy)

If a future deploy re-introduces the regression (or the defensive fix misbehaves):

```
npx vercel promote https://modern-tools-ijqi9k18x-henry-as-projects-88caed67.vercel.app --scope henry-as-projects-88caed67 --yes
```

And tell Henry to hit F12 → Application → Clear site data → close the tab → reopen hamsportal.com (to flush service-worker caches of the broken bundle).
