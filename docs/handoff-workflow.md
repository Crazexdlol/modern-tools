# ACV Handoff & Rough-Numbers Workflow

How a claim moves from the report-writing appraiser through to QC, who sees what button, and what the system does when they click it.

Scope: **ACV claims only**. The handoff/override picker and the rough-numbers routing described here apply only to claims where `claimTypes` includes `'acv'`.

Last updated: 2026-10-20

---

## The two concepts

### 1. RTA — Right To Appraisal
A claim-type chip on the file. **Presence of `'rta'` in `claimTypes` means "we're doing the negotiation."** Without `'rta'` the engagement is report-only — we write the report, nobody negotiates, no handoff.

### 2. Rough Numbers
A boolean on the claim (`needs_rough_numbers`). When ON, the first Submit routes to an admin (the "Rough Numbers inbox owner" — Wendy today) for review before the full workup. When the admin reassigns the claim back out, the `rough_numbers_handoff_at` timestamp is already stamped and the claim behaves normally from there.

The two concepts combine into **one of four claim shapes:**

| Shape | RTA | Rough numbers | Behavior |
|---|---|---|---|
| **A** Report-only | ❌ | ❌ or ✓ | Appraiser does the whole report, submits straight to QC. No handoff ever. |
| **B** Full negotiation | ✓ | ❌ | Appraiser does report, Complete Report hands to negotiator, negotiator submits to QC. |
| **C** Rough-numbers first | ❌ (or ✓) | ✓ | Appraiser does rough numbers, Submit routes to admin, admin reassigns, then shape A or B applies to the second half. |
| **D** Rough-numbers + RTA | ✓ | ✓ | Combo of C and B — rough numbers to admin first, then after reassign the handoff to negotiator becomes available. |

---

## The decision tree the appraiser sees

```
┌─ Is the claim still in Main stage, not yet submitted?
│    ├─ NO → No action button (admin controls take over at QC/Billing/Payment)
│    └─ YES ↓
│
├─ Does needs_rough_numbers = true AND rough_numbers_handoff_at = null?
│    ├─ YES → [Submit for Rough Numbers]        → routes to Wendy
│    └─ NO ↓
│
├─ Is claimTypes missing 'rta'?
│    ├─ YES → [Submit for QC]                   → straight to QC
│    └─ NO ↓
│
├─ Is Negotiating Appraiser blank OR = assignee OR unresolvable?
│    ├─ YES → [Submit for QC]                   → straight to QC
│    └─ NO ↓
│
├─ Does the viewer have can_submit_without_handoff = true?
│    ├─ YES → [Submit for QC]                   → straight to QC (bypasses handoff)
│    └─ NO → [Complete Report ▾] (picker)       → see dropdown below
```

### The Complete Report dropdown (picker)

Shown only on ACV + RTA claims where everything above says "handoff needed." Lists:
- **Negotiating Appraiser at the top** (highlighted, labeled `(negotiating appraiser)`), if they're eligible
- **Everyone else below**, alphabetical

Eligibility filter for both rows:
- `role = 'appraiser'` (not admin, not super-admin)
- `is_active = true`
- Not the current assignee
- Their `claim_types` overlaps the claim's types (empty = handles everything)

Click a name → confirm dialog → POST to `/api/claims/[id]/complete-report` with `{ toAssignee }` → claim reassigns to the picked person, stays in Main.

---

## Scenario matrix

Every state an ACV claim can be in while assigned to an appraiser in Main stage.

| # | RTA? | Rough numbers? | Negotiator vs. assignee | Button shown | Clicking it does |
|---|---|---|---|---|---|
| 1 | ✓ | — | **Different person** | **Complete Report ▾** | Opens dropdown. Pick → reassigns to that person. Claim stays in Main. |
| 2 | ✓ | — | Same person | **Submit for QC** | Advances claim to QC, clears assignee, stamps `submitted_by`. |
| 3 | ✓ | — | No negotiator set | **Submit for QC** | Same as #2. |
| 4 | ✓ | ✓ pending | Different person | **Submit for Rough Numbers** | Reassigns to Wendy, phase pill flips to "Rough Numbers", cycle time pauses. Negotiator is NOT touched. |
| 5 | ✓ | ✓ pending | Same person / none | **Submit for Rough Numbers** | Same as #4. |
| 6 | ✓ | ✓ done (handed off already) | Different person | **Complete Report ▾** | Rough-numbers already done, handoff gate reopens. Same as #1. |
| 7 | ❌ | — | Any | **Submit for QC** | Report-only engagement — straight to QC regardless of who's listed as negotiator. |
| 8 | ✓ | — | Different person, viewer has `can_submit_without_handoff` | **Submit for QC** | Henry's and George's accounts bypass the handoff and submit directly. |

---

## Who sees what — the special accounts

| User | Role | Flag | Effect |
|---|---|---|---|
| Henry Aleksanyan | appraiser | `can_submit_without_handoff: false` (toggled off 2026-10-20) | Sees Complete Report dropdown like everyone else. |
| George Aleksanyan | appraiser | `can_submit_without_handoff: true` | Always sees Submit for QC — bypasses handoff entirely. |
| Everyone else | appraiser | `can_submit_without_handoff: false` | Normal flow. |
| Any admin | admin | — | Never sees Submit / Complete Report on the appraiser button row. Gets Send Back / phase controls / advance controls instead. |

The flag is at Admin → Settings → Users → \[user\] → Permissions, labeled *"Can submit directly to QC..."*.

---

## State machine (what the DB does)

### Submit — standard path (not rough-numbers)

```
BEFORE                           CLICK           AFTER
assigned_to: Vahan        →      Submit    →     assigned_to: NULL
workflow_stage: main                             workflow_stage: qc
submitted_at: NULL                               submitted_at: now()
submitted_by: NULL                               submitted_by: Vahan
```

### Submit — rough-numbers path

```
BEFORE                                            CLICK            AFTER
assigned_to: Vahan                        →       Submit     →     assigned_to: Wendy
workflow_stage: main                                                workflow_stage: main (unchanged)
needs_rough_numbers: true                                           needs_rough_numbers: true (unchanged)
rough_numbers_handoff_at: NULL                                      rough_numbers_handoff_at: now()
status_phase: NULL                                                  status_phase: 'rough_numbers'
                                                                    (cycle_time clock pauses)
```

### Complete Report (ACV + RTA, picker path)

```
BEFORE                           CLICK                                     AFTER
assigned_to: Vahan        →      Complete Report → pick Henry       →      assigned_to: Henry
negotiatingAppraiser: Alex                                                  negotiatingAppraiser: Alex (unchanged — stays for licensing/signature)
workflow_stage: main                                                        workflow_stage: main (unchanged)
```

The claim's `negotiatingAppraiser` display field is **not** overwritten by the picker — only `assigned_to` moves. This is intentional: the Negotiating Appraiser name may be on the file for licensing/signature reasons (e.g., Alex is licensed in the claim's state, so his name signs the report), while the actual work is being done by someone else (Henry).

### Complete Report — rough-numbers blocks it

If the claim has `needs_rough_numbers=true` AND `rough_numbers_handoff_at=null`, the API rejects:

```
POST /api/claims/[id]/complete-report
  { toAssignee: "..." }

400  { "error": "Rough numbers pending — submit for admin review first instead of handing off." }
```

Same enforcement on the frontend — the Complete Report button isn't shown; Submit for Rough Numbers is shown instead.

### Complete Report — report-only (no RTA) blocks it

```
POST /api/claims/[id]/complete-report
  { toAssignee: "..." }

400  { "error": "This is a report-only claim (no RTA). Submit for QC directly instead." }
```

Button is hidden on the frontend.

---

## Full round-trip example

**Setup:** ACV claim, state is Arizona (requires licensed appraiser), `claimTypes = ['acv', 'rta']`, `needs_rough_numbers = true`, Negotiating Appraiser = Alex (licensed in AZ), assigned to Vahan (unlicensed in AZ, but qualified to run numbers).

```
Day 1:
  Admin creates claim.
    DB: assigned_to=Vahan, needs_rough_numbers=true,
        rough_numbers_handoff_at=NULL, status_phase=NULL.

Day 1 (later):
  Vahan opens claim. Sees "Submit for Rough Numbers" (RTA set + rough pending).
  Vahan runs preliminary comps, posts $18,500.
  Vahan clicks Submit for Rough Numbers → confirms.
    DB: assigned_to=Wendy, rough_numbers_handoff_at=now(),
        status_phase='rough_numbers'. Cycle time paused.

Day 2:
  Wendy reads the rough number, talks to the client. Client approves.
  Wendy opens the claim, uses admin Reassign dropdown → picks Vahan.
    DB: assigned_to=Vahan (back), status_phase stays 'rough_numbers'
        until admin clears it or stage advances.

Day 2-5:
  Vahan does the full workup: comps, adjustments, DV, final report.
  Vahan opens claim. Sees "Complete Report ▾" (rough handoff done,
  RTA set, negotiator=Alex ≠ Vahan).

  Vahan clicks dropdown. Alex is at the top labeled (negotiating appraiser).
  Vahan picks Alex → confirms.
    DB: assigned_to=Alex. Claim stays in Main.

Day 5:
  Alex negotiates with the insurance company. Reaches agreement.
  Alex opens claim. Sees "Submit for QC" (negotiator = assignee now).
  Alex clicks Submit for QC.
    DB: assigned_to=NULL, workflow_stage='qc',
        submitted_at=now(), submitted_by=Alex.

Day 5+:
  QC reviews, approves. Admin advances to Billing/Delivery, then Payment, then closes.
```

---

## Backend reference

### POST /api/claims/\[id\]/submit

Branches based on claim state:

| Condition | Action |
|---|---|
| `needs_rough_numbers && !rough_numbers_handoff_at` | Reassign to Rough Numbers inbox owner. Set phase, stamp handoff timestamp. Do NOT advance stage. |
| Otherwise | Clear assignee, stamp `submitted_at` / `submitted_by`, advance `workflow_stage` to `qc`. |

### POST /api/claims/\[id\]/complete-report

Rejects (400) if any of these hold:
- Claim not open / already submitted / not in Main
- Caller is neither admin nor the current assignee
- `claimTypes` doesn't include `'acv'` AND `toAssignee` was provided (override is ACV-only)
- `claimTypes` doesn't include `'rta'` (report-only — no handoff)
- `needs_rough_numbers && !rough_numbers_handoff_at` (rough numbers must come first)
- Target profile missing / inactive / super-admin / not an appraiser
- Target profile doesn't handle any of the claim's `claim_types`
- Target is the current assignee

Otherwise: reassign to target, stamp `assigned_at`, keep stage/phase/submitted fields untouched.

---

## Testing

Live verification: `node scripts/verify-test-matrix.mjs`

Replays the exact frontend `needsReportHandoff` gate + backend validation logic against every TEST-ACV-\* claim and reports PASS/FAIL per scenario. Does not mutate state. Expects `node scripts/create-test-matrix.mjs` has been run first.

Last run (2026-10-20): **✓ ALL 7 SCENARIOS PASS**

Teardown: `node scripts/delete-test-matrix.mjs` nukes every `TEST-ACV-*` claim and its stage events / messages.
