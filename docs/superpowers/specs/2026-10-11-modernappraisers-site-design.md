# modernappraisers.com — new site design spec

**Date:** 2026-10-11
**Status:** approved for implementation (deploy explicitly deferred — build locally first)
**Scope:** replace the current WordPress modernappraisers.com with a bespoke Next.js site that includes a public claim-submission flow + a customer portal + a minimal staff reply surface, writing into the shared HamsPortal Supabase project. HamsPortal (HAMS) UI/code stays untouched.

---

## 1. Repo layout

Standalone Next.js app in a sibling folder; zero shared code with HAMS:

```
C:\XSFA\Modern Tools Official\
├── src/                    (HamsPortal — unchanged)
├── public/                 (HamsPortal — unchanged)
├── package.json            (HamsPortal — unchanged)
└── modernappraisers/       (NEW)
    ├── src/
    ├── public/
    ├── package.json        (own deps)
    ├── next.config.ts
    └── .env.local          (own env, points at same Supabase)
```

No cross-imports, no symlinks. If both apps need the same helper (e.g. VIN decode), it's copied, not shared.

## 2. Tech stack

- Next.js 16, React 19, TypeScript 5
- Tailwind v4 (same config pattern as HAMS: in `globals.css`, no `tailwind.config.*`)
- `@supabase/ssr` + `@supabase/supabase-js`
- `@fontsource-variable/inter` — self-hosted Inter
- No shadcn — small hand-rolled component set (Button, Card, Input, Textarea, Select, Badge, Field)
- Resend for transactional email
- Supabase phone auth for SMS OTP (Twilio under the hood, Supabase-billed)

## 3. Visual system (Direction B — Modern Monochrome)

**Typography:** Inter everywhere. Scale `12 / 14 / 16 / 18 / 20 / 24 / 32 / 48 / 72`. Weights 400 / 500 / 600 / 700. Tracking tight on 48+ (`-0.03em`).

**Palette:**
| Token | Hex | Use |
|---|---|---|
| `bg` | `#ffffff` | page bg |
| `bg-subtle` | `#fafafa` | section bands / cards |
| `ink` | `#0a0a0a` | primary text, hero |
| `ink-muted` | `#4b5563` | body copy |
| `ink-soft` | `#6b7280` | captions |
| `border` | `#e5e7eb` | hairlines |
| `border-strong` | `#d1d5db` | inputs, outline buttons |
| `accent` | `#0ea5e9` | links, focus rings |
| `accent-ink` | `#0369a1` | accent text hover |
| `success` | `#059669` | positive badges |
| `danger` | `#dc2626` | errors |

Radius: `6px` inputs/buttons, `10px` cards, `999px` pills. No decorative gradients, drop shadows, or glass effects. The only shadow: `0 1px 2px rgb(0 0 0 / 0.05)` for elevated cards.

**Anti-slop guardrails:**
- Asymmetric heroes (big headline left, meta right)
- Real content density (stats, specific numbers, no filler)
- Hairline dividers between sections (no color-blocked bands)
- No sparkle/star icons; no rainbow gradients; no three-identical-column feature grids
- Photography placeholders tagged with specific intent, not generic stock
- Font family stays Inter — the HamsPortal "Times New Roman everywhere" rule in CLAUDE.md is scoped to HamsPortal, documented in CLAUDE.md after implementation

## 4. Site map

### Public routes
| Route | Purpose |
|---|---|
| `/` | Home — hero, stat row, services summary (4 cards), 2 testimonials, submit CTA, footer |
| `/about` | About — 1999 history, appraisers, credentials, approach |
| `/services` | Services index |
| `/services/[slug]` | Per-service detail: ACV, Diminished Value, Estimate Dispute, Post-Repair Inspection, Appraisal Clause |
| `/submit` | Submit a Claim — 3-step wizard |
| `/contact` | Contact form, phone, address, hours |
| `/login` | Email + password login |
| `/signup` | Account creation (though typically accounts auto-create via `/submit`) |

### Customer portal (`/portal/*`, auth required, customer role)
| Route | Purpose |
|---|---|
| `/portal` | My Claims — table: MA#, vehicle, status, phase, submitted date |
| `/portal/claims/[id]` | Claim detail — 4 tabs (Details / Status / Documents / Messages) |
| `/portal/claims/new` | Short-form submit for returning customers (contact pre-filled) |
| `/portal/account` | Change password, update phone/email, logout |

### Staff surface (`/staff/*`, auth required, HAMS admin/appraiser role)
| Route | Purpose |
|---|---|
| `/staff/login` | Separate login landing for staff |
| `/staff/inbox` | Claims with unread customer messages, newest first |
| `/staff/claims/[id]` | Admin view of a customer's portal for one claim — read + reply messages, upload docs to share, read "describe" blurb, deep-link to HAMS |

Blog deferred to V2.

## 5. Submit flow (`/submit`)

Three-step wizard with progress bar.

### Step 1 — Vehicle & loss
- VIN (optional, with "Decode" button → NHTSA auto-fills year/make/model)
- Year, Make, Model (editable)
- Mileage
- Loss address (single autocomplete line)
- Date of loss
- Insurance company (text, suggestions later)
- Claim # (CL#)

### Step 2 — Claim details
- Claim type (radio): ACV / Diminished Value / Estimate Dispute / Not sure
- Describe your situation (textarea, 500 char max, optional)
- Documents (drag-and-drop, ≤ 10 files, ≤ 25 MB each; PDF + images + docx)
  - Files upload on form submit (not immediately), so an abandoned wizard doesn't orphan storage

### Step 3 — Contact & verify
- First + last name (required)
- Email (required — becomes login)
- Phone (required)
- Password + confirm (8+ chars)
- Verification method picker: **SMS code** or **Email link**
- Submit → sends OTP / magic link → user verifies → account created → claim written → redirect to `/portal` with success banner

### Server-side write-sequence on verified submit
1. Create `auth.users` row (Supabase auth) with email + password.
2. Insert `customer_users` row (name, phone, verified_at, verification_method).
3. Insert `acv_history` row with `status='open'`, `assigned_to=NULL` (lands in HAMS "New Assignments" tab), `claim={...standard ClaimInfo + customerDescription + source: 'customer' + submittedByCustomerUserId}`. MA# auto-assigned by existing HAMS DB trigger.
4. Insert one HAMS `messages` row for the claim: body = `"[Customer submission]\n\n" + customerDescription`, sender = system/auto (same pattern status-request cron uses — `is_auto_request=true`, `sender_name='Customer Submission'`). Requires `company_id` on the row (per the live cron bug fix precedent).
5. Insert `customer_claim_access` link row (user_id → claim_id).
6. For each uploaded doc: write to `customer-shared` storage bucket, insert `customer_claim_documents` row with `uploaded_by_type='customer'`.
7. Send confirmation email via Resend ("your claim was received, MA# XXXX").

## 6. Customer portal

### `/portal/claims/[id]` — four tabs on a Card
- **Details** (default): read-only vehicle / loss / insurance info as submitted.
- **Status**: current `status_phase` as a chip, plus a reverse-chronological timeline derived from existing HAMS fields (`created_at`, `assigned_at`, `status_phase_set_at`, `closed_at`, etc.) — no new "customer_timeline" table.
- **Documents**: list of docs from `customer_claim_documents` where `claim_id` matches; separate drop zone for new customer uploads.
- **Messages**: thread from `customer_messages`, read + write.

Status-timeline text is derived; no new table needed. Example entries:
- "Claim submitted — Oct 12"
- "Appraiser assigned (Henry A.) — Oct 13"
- "Phase: Awaiting Response — Oct 14"
- "Claim closed as Completed — Oct 20"

## 7. HAMS integration — one paragraph

Customer submissions insert into the shared `acv_history` table as unassigned open claims (`status='open'`, `assigned_to=NULL`). They land in HAMS's New Assignments view like any other new claim. **Zero HAMS code changes. Zero HAMS UI changes.** The "describe your situation" text auto-posts as the first message on the claim's thread via a HAMS `messages` row (same auto-system pattern as the status-request cron), so admins see context in HAMS without opening a different tool. Ongoing customer↔admin dialogue after that first message lives in the separate `customer_messages` table so HAMS's internal admin messaging stays uncluttered.

## 8. New DB objects

All new tables + storage buckets are modernappraisers.com-only. HAMS does not query any of them.

```sql
-- customers (one row per customer auth user)
create table customer_users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text not null,
  email text not null,
  verification_method text check (verification_method in ('sms','email')),
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- which claims a customer has access to (acv_history isolation via RLS)
create table customer_claim_access (
  user_id uuid references auth.users(id) on delete cascade,
  claim_id text references acv_history(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, claim_id)
);

-- customer↔admin threaded messages (separate from HAMS messages)
create table customer_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references acv_history(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','admin')),
  sender_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- customer-visible document store (separate from HAMS claim-documents)
create table customer_claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references acv_history(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id),
  uploaded_by_type text not null check (uploaded_by_type in ('customer','admin')),
  file_path text not null,
  file_name text not null,
  file_size_bytes bigint,
  mime_type text,
  created_at timestamptz default now()
);

-- RLS: customers see rows via customer_claim_access join. Staff sees all.
-- Policies written as part of implementation plan.

-- Storage bucket: customer-shared (RLS enforced per customer_claim_access).
```

## 9. Auth model

- **Customers**: `auth.users` + `customer_users` row. No `profiles` row. Email+password login; phone OR email verification at signup.
- **Staff** (admin/appraiser): existing HAMS `auth.users` + `profiles` row. Log into modernappraisers.com `/staff` with the same credentials; session cookie scoped to modernappraisers.com (separate from HAMS).
- A single auth user can be ONE role, never both (check constraint on signup — a profile row and a customer_users row for the same user id is rejected).

## 10. RLS summary

| Table | Who reads what |
|---|---|
| `acv_history` | HAMS roles unchanged. Customers: rows joined via `customer_claim_access`. |
| HAMS `messages` | HAMS roles unchanged. Customers: no access. |
| HAMS `claim_documents` | HAMS roles unchanged. Customers: no access. |
| `customer_users` | Customer: own row. Staff: all. |
| `customer_claim_access` | Customer: own rows. Staff: all. |
| `customer_messages` | Customer: own threads. Staff: all. |
| `customer_claim_documents` | Customer: rows where their user is in `customer_claim_access` for that claim, OR their own uploads. Staff: all. |
| `customer-shared` storage | Mirrors `customer_claim_documents` policy. |

## 11. Env vars for modernappraisers.com

```
NEXT_PUBLIC_SUPABASE_URL=... (same as HAMS)
NEXT_PUBLIC_SUPABASE_ANON_KEY=... (same as HAMS)
SUPABASE_SERVICE_ROLE_KEY=... (same as HAMS, server-only)
RESEND_API_KEY=... (new — needs Resend signup)
NEXT_PUBLIC_SITE_URL=https://modernappraisers.com (for email magic links)
HAMSPORTAL_URL=https://hamsportal.com (used for /staff "Open in HAMS" deep link)
```

Supabase phone auth needs a Twilio integration configured in the Supabase dashboard (needs user action before Phase 2 of implementation).

## 12. Out of scope for V1

- Blog
- Rich admin workflow inside modernappraisers.com beyond the inbox + reply + doc-share
- Automated status-change SMS notifications (customers get email only in V1)
- Spanish or any non-English copy
- A/B testing infra
- Analytics / tag manager
- Deploy / DNS cutover (explicitly deferred by user — build locally first)

## 13. Prerequisites / human-in-the-loop items

Before implementation can finish, the user needs to:
1. Sign up for Resend; generate an API key.
2. Configure Supabase phone auth (dashboard → Auth → Phone → provider = Twilio; create or link a Twilio account for SMS).
3. Decide on a specific "New Assignments" phase config in HAMS if a dedicated phase is wanted (optional — current plan leaves `status_phase=null` so claim is just "unassigned open").

Zero of these need to happen before scaffolding + building the public marketing pages + the submit form UI shell.
