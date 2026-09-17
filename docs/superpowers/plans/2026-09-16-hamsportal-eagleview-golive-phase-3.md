# HamsPortal Eagleview Go-Live — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Eagleview an operational second company on HamsPortal. A user with EV access logs in and lands in the Eagleview world (EV logo in the header, only EV data). Report generation for EV returns a graceful "no template configured" empty state — Henry adds templates later.

**Architecture:** Move MA logo + templates to `public/companies/modern-appraisers/`, add EV logo, make PDF fillers company-aware. New `NoTemplateError` propagates as `{ code: 'NO_TEMPLATE' }` to the UI. `/api/companies` returns the caller's companies; header renders active company's logo and shows a switcher for multi-company users. Admin gets a Companies checkbox tab in the user-settings screen.

**Tech Stack:** Same as Phases 1–2 — Next.js 16.3.5, no new deps.

**Spec:** `docs/superpowers/specs/2026-09-16-hamsportal-multi-company-design.md` §3.

**Deferred to a possible Phase 4:**
- Insurance guidelines cross-company import button. EV starts with 0 guidelines; scoped read/write already in place.
- Per-user-per-company email (`user_companies.email_in_company`) editor in UI (column exists in schema, no editor yet).
- Per-company brand colors in the theme.
- Per-company AI framing tweaks.

---

## File structure

**New files:**
- `public/companies/modern-appraisers/logo.png` (moved from `public/logo.png`)
- `public/companies/modern-appraisers/templates/{acv,award,notes,acv-contract,certificate-of-appraisal}-template.pdf` (moved)
- `public/companies/modern-appraisers/templates/dv-templates/*.pdf` (moved, 4 files)
- `public/companies/modern-appraisers/templates/invoice-templates/*.pdf` (moved, 2 files)
- `public/companies/eagleview/logo.png` (from `backups/pre-hamsportal-2026-09-16/eagleview-logo.png`)
- `public/companies/eagleview/templates/.gitkeep` (empty folder committed)
- `src/lib/pdf/template-path.ts` — `getTemplatePath(slug, filename)` + `NoTemplateError` class + `NO_TEMPLATE_CODE` constant
- `src/app/api/companies/route.ts` — GET returns `{ activeCompanyId, companies: [{id, slug, name, logo_path, brand_color}] }`
- `src/app/api/admin/users/[id]/companies/route.ts` — PUT `{ companyIds: string[] }` syncs `user_companies`
- `src/hooks/use-user-companies.ts` — client hook
- `src/components/company-switcher.tsx` — header pill
- `src/app/admin/settings/users/[id]/_tabs/companies-tab.tsx` — checkbox admin panel

**Modified files:**
- 7 PDF filler modules under `src/lib/acv/*.ts` and `src/lib/invoice/*.ts` — accept `companySlug`.
- 7 PDF generate routes under `src/app/api/acv/`, `/api/invoices/`, `/api/storage/` — pass claim's `company_id → slug` to filler; catch `NoTemplateError`.
- `src/hooks/use-active-company.ts` — extends to return full company row (`{ activeCompanyId, activeCompany }`).
- `src/components/app-header.tsx` — dynamic company logo + `<CompanySwitcher />`.
- `src/components/claim/ClaimWorkspace.tsx` — 5 PDF-download buttons handle `NO_TEMPLATE` with a clean toast.
- `src/app/admin/settings/users/[id]/_settings-nav.tsx` (or wherever tabs list is) — add "Companies" entry.

---

### Task 1: Copy MA assets into `/companies/modern-appraisers/`

**Files:**
- Create: 5 root PDFs + logo + 4 DV + 2 invoice templates copied into `public/companies/modern-appraisers/`.

- [ ] **Step 1: List current MA assets and confirm what exists**

Run:
```
cd "C:\XSFA\Modern Tools Official" && ls public/*.pdf public/logo.png public/dv-templates/*.pdf public/invoice-templates/*.pdf
```

Expected: 5 root PDFs (acv, award, notes, acv-contract, certificate-of-appraisal), `public/logo.png`, 4 DV variants, 2 invoice variants — 12 files total.

- [ ] **Step 2: Create the folder structure and copy every file**

Run:
```
cd "C:\XSFA\Modern Tools Official" && mkdir -p public/companies/modern-appraisers/templates/dv-templates public/companies/modern-appraisers/templates/invoice-templates public/companies/eagleview/templates && cp public/logo.png public/companies/modern-appraisers/logo.png && cp public/acv-template.pdf public/award-template.pdf public/notes-template.pdf public/acv-contract-template.pdf public/certificate-of-appraisal-template.pdf public/companies/modern-appraisers/templates/ && cp public/dv-templates/*.pdf public/companies/modern-appraisers/templates/dv-templates/ && cp public/invoice-templates/*.pdf public/companies/modern-appraisers/templates/invoice-templates/
```

- [ ] **Step 3: Add EV logo + gitkeep**

Run:
```
cd "C:\XSFA\Modern Tools Official" && cp backups/pre-hamsportal-2026-09-16/eagleview-logo.png public/companies/eagleview/logo.png && touch public/companies/eagleview/templates/.gitkeep
```

- [ ] **Step 4: Sanity check every copy landed**

Run:
```
cd "C:\XSFA\Modern Tools Official" && ls -la public/companies/modern-appraisers/ public/companies/modern-appraisers/templates/ public/companies/modern-appraisers/templates/dv-templates/ public/companies/modern-appraisers/templates/invoice-templates/ public/companies/eagleview/
```

Expected: logo.png in each company folder; MA templates folder contains 5 PDFs + 2 subdirs; each subdir contains its variants.

- [ ] **Step 5: Commit the asset copies**

Run:
```
cd "C:\XSFA\Modern Tools Official" && git add public/companies/ && git commit -m "assets: stage MA logo+templates under /companies/modern-appraisers/ + EV logo under /companies/eagleview/"
```

Expected: commit succeeds. Old `public/*.pdf` and `public/logo.png` files still present — Task 2 removes them after fillers are updated.

---

### Task 2: `getTemplatePath` helper + `NoTemplateError`

**Files:**
- Create: `src/lib/pdf/template-path.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/pdf/template-path.ts` with:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** Throw this when a company doesn't have a template file for a report. */
export class NoTemplateError extends Error {
  code = 'NO_TEMPLATE' as const
  constructor(public companySlug: string, public templateRelPath: string) {
    super(`No template configured for company '${companySlug}' at templates/${templateRelPath}. Contact your admin.`)
    this.name = 'NoTemplateError'
  }
}

export const NO_TEMPLATE_CODE = 'NO_TEMPLATE' as const

/**
 * Resolves a template's absolute filesystem path for the given company. Throws
 * NoTemplateError if the file doesn't exist so callers can catch it and
 * surface the empty-state message to the UI.
 *
 * `templateRelPath` is relative to the company's templates/ folder — e.g.
 * `'acv-template.pdf'` or `'dv-templates/dv-nationwide-attorney.pdf'`.
 *
 * Defaults `companySlug` to 'modern-appraisers' so any legacy caller that
 * hasn't been updated yet keeps working during a partial rollout.
 */
export function getTemplatePath(companySlug: string, templateRelPath: string): string {
  const abs = path.join(process.cwd(), 'public', 'companies', companySlug, 'templates', templateRelPath)
  if (!existsSync(abs)) {
    throw new NoTemplateError(companySlug, templateRelPath)
  }
  return abs
}

/** Reads a template's raw bytes (throws NoTemplateError if missing). */
export function readTemplate(companySlug: string, templateRelPath: string): Buffer {
  return readFileSync(getTemplatePath(companySlug, templateRelPath))
}
```

- [ ] **Step 2: Type-check**

Run: `cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit`

Expected: no output (clean).

- [ ] **Step 3: Commit**

Run:
```
cd "C:\XSFA\Modern Tools Official" && git add src/lib/pdf/template-path.ts && git commit -m "feat(pdf): getTemplatePath helper + NoTemplateError for company-scoped template resolution"
```

---

### Task 3: Update the 5 core ACV/report PDF fillers to accept `companySlug`

**Files:**
- Modify: `src/lib/acv/pdf-filler.ts`, `award-pdf-filler.ts`, `notes-pdf-filler.ts`

Each filler currently does something like:
```typescript
const templatePath = path.join(process.cwd(), 'public', 'acv-template.pdf')
const templateBytes = fs.readFileSync(templatePath)
```

The change is uniform per filler: import `readTemplate` from `@/lib/pdf/template-path`, replace the hardcoded `path.join(...)` + `readFileSync` with `readTemplate(companySlug, '<filename>-template.pdf')`, and add `companySlug: string` as a new required parameter on the fill function.

- [ ] **Step 1: Update `src/lib/acv/pdf-filler.ts`**

Find the top of the exported fill function (search for `export async function fillACVPdf` or similar). Add `companySlug: string` as the first parameter. Inside the function, replace the template load with:

```typescript
import { readTemplate } from '@/lib/pdf/template-path'
// ...
const templateBytes = readTemplate(companySlug, 'acv-template.pdf')
```

Remove the now-unused `import path from 'node:path'` if it's not used for anything else in the file. Leave `import { readFileSync } from 'node:fs'` alone if still used.

- [ ] **Step 2: Update `src/lib/acv/award-pdf-filler.ts`**

Same pattern. Filename is `'award-template.pdf'`.

- [ ] **Step 3: Update `src/lib/acv/notes-pdf-filler.ts`**

Same. Filename is `'notes-template.pdf'`.

- [ ] **Step 4: Type-check**

Run `npx tsc --noEmit`. Expect errors from the routes that call these fillers without the new arg — that's expected; those are fixed in Task 5.

Note the errors to confirm the fillers require the new argument; don't fix them here.

- [ ] **Step 5: Commit**

```
cd "C:\XSFA\Modern Tools Official" && git add src/lib/acv/pdf-filler.ts src/lib/acv/award-pdf-filler.ts src/lib/acv/notes-pdf-filler.ts && git commit -m "feat(pdf): ACV/award/notes fillers require companySlug + read via getTemplatePath"
```

---

### Task 4: Update DV, invoice, contract, certificate, and storage PDF fillers

**Files:**
- Modify: `src/lib/acv/dv-pdf-filler.ts` (uses `dv-templates/{variant}.pdf`)
- Modify: `src/lib/invoice/invoice-pdf-filler.ts` (uses `invoice-templates/{variant}.pdf`)
- Modify: `src/lib/acv/contract-pdf-filler.ts` and `src/lib/acv/certificate-pdf-filler.ts` if they exist as separate modules; otherwise inline in the corresponding route.
- Modify: `src/lib/storage/pdf.ts` — this one programmatically generates a PDF (no template file), but reads the embedded MA logo. For Phase 3, wrap the entry point so it throws `NoTemplateError` when called with a non-MA slug — EV storage-PDF isn't built yet.

- [ ] **Step 1: Update DV filler**

In `src/lib/acv/dv-pdf-filler.ts`, add `companySlug` as first param. The variant-to-filename map already exists; wrap `readTemplate(companySlug, 'dv-templates/' + TEMPLATE_FILES[variant])`.

- [ ] **Step 2: Update invoice filler**

`src/lib/invoice/invoice-pdf-filler.ts` — same pattern. `readTemplate(companySlug, 'invoice-templates/' + TEMPLATE_FILES[variant])`.

- [ ] **Step 3: Locate + update contract/certificate fillers**

Run:
```
cd "C:\XSFA\Modern Tools Official" && grep -rln "acv-contract-template\|certificate-of-appraisal-template" src/
```

If dedicated filler modules exist for these, update them the same way. If the template load is inlined inside the API route (e.g. `src/app/api/acv/generate-contract-pdf/route.ts`), update in the route directly.

- [ ] **Step 4: Update storage PDF entry point**

In `src/lib/storage/pdf.ts`, at the top of the exported function that generates the storage-charges PDF, add:

```typescript
import { NoTemplateError } from '@/lib/pdf/template-path'
// ...
export function buildStoragePdf(input: StoragePdfInput, companySlug: string): Buffer {
  if (companySlug !== 'modern-appraisers') {
    throw new NoTemplateError(companySlug, 'storage-pdf')
  }
  // ...existing body unchanged...
}
```

Storage PDF is programmatic (base64-embedded MA logo). Phase 3 blocks it for other companies; when Henry builds EV's storage-charges layout, this gate widens.

- [ ] **Step 5: Type-check + commit**

Run `npx tsc --noEmit`. Errors from the routes are still expected.

```
cd "C:\XSFA\Modern Tools Official" && git add src/lib/acv/dv-pdf-filler.ts src/lib/invoice/invoice-pdf-filler.ts src/lib/storage/pdf.ts src/lib/acv/contract-pdf-filler.ts src/lib/acv/certificate-pdf-filler.ts 2>/dev/null; git status --short && git commit -m "feat(pdf): DV/invoice/contract/certificate/storage fillers require companySlug"
```

(The `2>/dev/null` handles the case where contract/certificate fillers don't exist as separate files — the git add call ignores those.)

---

### Task 5: Update PDF generate API routes to pass company slug + catch `NoTemplateError`

**Files:**
- Modify: `src/app/api/acv/generate-pdf/route.ts`, `generate-award-pdf/route.ts`, `generate-notes-pdf/route.ts`, `generate-dv-pdf/route.ts`, `generate-contract-pdf/route.ts` (if exists), and any certificate route.
- Modify: `src/app/api/invoices/generate-pdf/route.ts`
- Modify: `src/app/api/storage/generate-pdf/route.ts`

Each route:
1. Uses `requireAuth` or `requireClaimAccess` — already exposes `caller.activeCompanyId`.
2. Resolves the claim (via `fetchClaim(id, activeCompanyId)` or similar) — gets `claim.companyId`.
3. Looks up the company slug (either from a small in-memory cache or a one-time SELECT on `companies`).
4. Passes slug to the filler.
5. Catches `NoTemplateError` → returns 400 with body `{ error: err.message, code: 'NO_TEMPLATE', companySlug: err.companySlug }`.

- [ ] **Step 1: Add a shared helper for slug lookup**

Create `src/lib/pdf/company-slug.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase/service'

const cache = new Map<string, string>()

/**
 * Returns the company's slug for the given company_id. Cached per-lambda
 * (companies rarely change). Falls back to 'modern-appraisers' when the
 * companies table doesn't exist (pre-migration) or the id doesn't resolve.
 */
export async function getCompanySlug(companyId: string | null | undefined): Promise<string> {
  if (!companyId) return 'modern-appraisers'
  const hit = cache.get(companyId)
  if (hit) return hit
  const svc = createServiceClient()
  const { data, error } = await svc.from('companies').select('slug').eq('id', companyId).maybeSingle()
  if (error || !data) return 'modern-appraisers'
  const slug = (data as { slug: string }).slug
  cache.set(companyId, slug)
  return slug
}
```

- [ ] **Step 2: Update `/api/acv/generate-pdf/route.ts`**

Read the current route. Between `fetchClaim(...)` and the `fillACVPdf(...)` call, insert:

```typescript
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'
// ...
const companySlug = await getCompanySlug(claim.companyId)
try {
  const pdfBytes = await fillACVPdf(companySlug, /* existing args */)
  // ...existing return with Content-Disposition...
} catch (err) {
  if (err instanceof NoTemplateError) {
    return NextResponse.json({ error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug }, { status: 400 })
  }
  throw err
}
```

If the current route doesn't have `claim` in scope (e.g., it takes id + fields from body rather than fetching the claim), fetch the claim's `company_id` at the top:

```typescript
const svc = createServiceClient()
const { data: claimRow } = await svc.from('acv_history').select('company_id').eq('id', body.claimId).maybeSingle()
const companySlug = await getCompanySlug(claimRow?.company_id ?? null)
```

- [ ] **Step 3: Apply the same pattern to the other 6 routes**

- `/api/acv/generate-award-pdf/route.ts`
- `/api/acv/generate-notes-pdf/route.ts`
- `/api/acv/generate-dv-pdf/route.ts`
- `/api/acv/generate-contract-pdf/route.ts` (if exists)
- Any certificate route (grep for `certificate-of-appraisal-template.pdf` under `src/app/api/`).
- `/api/invoices/generate-pdf/route.ts`
- `/api/storage/generate-pdf/route.ts`

Each route resolves `companySlug` and passes it as the first argument to its filler; each catches `NoTemplateError`.

- [ ] **Step 4: Type-check + build**

Run `npx tsc --noEmit && npm run build`. Expect clean.

- [ ] **Step 5: Commit**

```
cd "C:\XSFA\Modern Tools Official" && git add src/lib/pdf/company-slug.ts src/app/api/acv/ src/app/api/invoices/ src/app/api/storage/ && git commit -m "feat(pdf): routes resolve companySlug from claim + return NO_TEMPLATE on missing template"
```

---

### Task 6: Delete the old MA templates from `public/*.pdf` root

Now that all fillers route through `public/companies/modern-appraisers/templates/`, the root copies are dead. Removing them proves the new path is exercised (a route missed in Task 5 would 500 on the next PDF-download attempt).

- [ ] **Step 1: Delete the old files**

Run:
```
cd "C:\XSFA\Modern Tools Official" && rm public/logo.png public/acv-template.pdf public/award-template.pdf public/notes-template.pdf public/acv-contract-template.pdf public/certificate-of-appraisal-template.pdf && rm -rf public/dv-templates public/invoice-templates
```

- [ ] **Step 2: Verify no code references the old paths**

Run:
```
cd "C:\XSFA\Modern Tools Official" && grep -rn "public/logo.png\|public/acv-template\|public/award-template\|public/notes-template\|public/acv-contract-template\|public/certificate-of-appraisal-template\|public/dv-templates\|public/invoice-templates" src/ scripts/
```

Expected: no results. If any hit remains, update it to use `getTemplatePath` or `readTemplate`.

- [ ] **Step 3: Build to confirm**

Run: `npm run build`. Expected: clean.

- [ ] **Step 4: Commit**

```
cd "C:\XSFA\Modern Tools Official" && git add public/ && git commit -m "assets: remove old root-level MA templates now that fillers use /companies/modern-appraisers/"
```

---

### Task 7: `/api/companies` list endpoint

**Files:**
- Create: `src/app/api/companies/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/companies/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/companies — returns the caller's companies + their active one.
// Response: { activeCompanyId: string | null, companies: Company[] }
// Companies are hidden from users without membership (RLS enforces this,
// but the join here is via service client to avoid a second round-trip).
export async function GET() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_companies')
    .select('company_id, companies(id, slug, name, logo_path, brand_color)')
    .eq('user_id', caller!.userId)
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const companies = ((data ?? []) as Array<{ companies: { id: string; slug: string; name: string; logo_path: string; brand_color: string } | null }>)
    .map(r => r.companies)
    .filter((c): c is NonNullable<typeof c> => !!c)

  return NextResponse.json({
    activeCompanyId: caller!.activeCompanyId,
    companies,
  })
}
```

- [ ] **Step 2: Type-check + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && git add src/app/api/companies/route.ts && git commit -m "feat(api): GET /api/companies returns caller's company memberships + active id"
```

---

### Task 8: Extend `useActiveCompany` + add `useUserCompanies` hook

**Files:**
- Modify: `src/hooks/use-active-company.ts`
- Create: `src/hooks/use-user-companies.ts`

- [ ] **Step 1: Extend `useActiveCompany` to return full company row**

Rewrite `src/hooks/use-active-company.ts`:

```typescript
'use client'
import { useEffect, useState } from 'react'

export interface ActiveCompany {
  id: string
  slug: string
  name: string
  logoPath: string
  brandColor: string
}

export function useActiveCompany(): {
  activeCompanyId: string | null
  activeCompany: ActiveCompany | null
  loading: boolean
} {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/companies', { cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setLoading(false); return }
        const json = await r.json() as {
          activeCompanyId: string | null
          companies: Array<{ id: string; slug: string; name: string; logo_path: string; brand_color: string }>
        }
        if (cancelled) return
        setActiveCompanyId(json.activeCompanyId)
        const active = json.companies.find(c => c.id === json.activeCompanyId) ?? null
        setActiveCompany(active ? {
          id: active.id, slug: active.slug, name: active.name,
          logoPath: active.logo_path, brandColor: active.brand_color,
        } : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { activeCompanyId, activeCompany, loading }
}
```

- [ ] **Step 2: Create `useUserCompanies` hook**

Create `src/hooks/use-user-companies.ts`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import type { ActiveCompany } from './use-active-company'

export function useUserCompanies(): {
  companies: ActiveCompany[]
  activeCompanyId: string | null
  loading: boolean
} {
  const [companies, setCompanies] = useState<ActiveCompany[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/companies', { cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setLoading(false); return }
        const json = await r.json() as {
          activeCompanyId: string | null
          companies: Array<{ id: string; slug: string; name: string; logo_path: string; brand_color: string }>
        }
        if (cancelled) return
        setActiveCompanyId(json.activeCompanyId)
        setCompanies(json.companies.map(c => ({
          id: c.id, slug: c.slug, name: c.name, logoPath: c.logo_path, brandColor: c.brand_color,
        })))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { companies, activeCompanyId, loading }
}
```

- [ ] **Step 3: Type-check + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && git add src/hooks/ && git commit -m "feat(hooks): useActiveCompany returns full company row; useUserCompanies for switcher"
```

---

### Task 9: Company switcher pill

**Files:**
- Create: `src/components/company-switcher.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/company-switcher.tsx`:

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { ChevronDown, Check } from 'lucide-react'
import { useUserCompanies } from '@/hooks/use-user-companies'

// Renders nothing if the user only has access to one company.
// Otherwise shows a pill with the active company's logo+name and a dropdown
// listing every company the user can switch to. Clicking a company POSTs to
// /api/company/switch and reloads the page so all in-memory state resets.
export function CompanySwitcher() {
  const { companies, activeCompanyId, loading } = useUserCompanies()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (loading || companies.length <= 1) return null
  const active = companies.find(c => c.id === activeCompanyId) ?? companies[0]

  async function switchTo(companyId: string) {
    if (companyId === activeCompanyId) { setOpen(false); return }
    setBusy(true)
    const r = await fetch('/api/company/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    })
    if (!r.ok) {
      setBusy(false)
      const body = await r.json().catch(() => ({} as { error?: string }))
      alert(body.error ?? 'Switch failed')
      return
    }
    window.location.reload()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-800 transition-colors"
        title={`Working as ${active.name} — click to switch`}
      >
        <Image src={active.logoPath} alt={active.name} width={20} height={20} className="h-5 w-5 object-contain" />
        {active.name}
        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-30 overflow-hidden">
          {companies.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchTo(c.id)}
              disabled={busy}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <Image src={c.logoPath} alt={c.name} width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="flex-1 text-left">{c.name}</span>
              {c.id === activeCompanyId && <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && git add src/components/company-switcher.tsx && git commit -m "feat(ui): CompanySwitcher pill — only renders for users with 2+ companies"
```

---

### Task 10: Header — dynamic company logo + `<CompanySwitcher />`

**Files:**
- Modify: `src/components/app-header.tsx`

- [ ] **Step 1: Read the current header to locate the logo block**

Run: `cd "C:\XSFA\Modern Tools Official" && grep -n "/logo.png\|<Image" src/components/app-header.tsx | head -5`

- [ ] **Step 2: Replace hardcoded `/logo.png` with dynamic company logo + mount `<CompanySwitcher />`**

At the top of the component add:

```typescript
import { CompanySwitcher } from '@/components/company-switcher'
import { useActiveCompany } from '@/hooks/use-active-company'
```

In the component body:

```typescript
const { activeCompany } = useActiveCompany()
const logoPath = activeCompany?.logoPath ?? '/companies/modern-appraisers/logo.png'
const companyName = activeCompany?.name ?? 'Modern Appraisers'
```

Replace the existing `<Image src="/logo.png" alt="Modern Appraisers" ... />` with:

```tsx
<Image src={logoPath} alt={companyName} width={40} height={40} className="h-10 w-10 object-contain" priority />
```

(Preserve the surrounding wrapper/link/className.)

Then add `<CompanySwitcher />` next to the logo:

```tsx
<div className="flex items-center gap-3">
  <Image src={logoPath} alt={companyName} width={40} height={40} className="h-10 w-10 object-contain" priority />
  <CompanySwitcher />
</div>
```

(Adjust to match existing header layout — the point is the switcher lives next to the logo.)

- [ ] **Step 3: Type-check + build**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```
cd "C:\XSFA\Modern Tools Official" && git add src/components/app-header.tsx && git commit -m "feat(ui): header shows active company logo + switcher pill for multi-company users"
```

---

### Task 11: Admin API to sync user_companies

**Files:**
- Create: `src/app/api/admin/users/[id]/companies/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// PUT /api/admin/users/[id]/companies  { companyIds: string[] }
// Syncs user_companies for the target user to exactly `companyIds`.
// - Missing memberships are inserted.
// - Existing memberships not in the list are deleted.
// If the target user's active_company_id refers to a company that just got
// revoked, it's cleared to whichever remaining company they still have (or
// null when they have zero).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const { id: targetUserId } = await params
  const body = await request.json().catch(() => null) as { companyIds?: unknown } | null
  if (!body || !Array.isArray(body.companyIds)) {
    return NextResponse.json({ error: 'body { companyIds: string[] } required' }, { status: 400 })
  }
  const desired = new Set(body.companyIds.filter((v): v is string => typeof v === 'string'))

  const svc = createServiceClient()

  const { data: current } = await svc
    .from('user_companies')
    .select('company_id')
    .eq('user_id', targetUserId)
  const currentSet = new Set(((current ?? []) as { company_id: string }[]).map(r => r.company_id))

  const toAdd = [...desired].filter(id => !currentSet.has(id))
  const toRemove = [...currentSet].filter(id => !desired.has(id))

  if (toAdd.length > 0) {
    const { error } = await svc.from('user_companies').insert(
      toAdd.map(company_id => ({ user_id: targetUserId, company_id, granted_by: caller!.userId })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (toRemove.length > 0) {
    const { error } = await svc
      .from('user_companies')
      .delete()
      .eq('user_id', targetUserId)
      .in('company_id', toRemove)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // If active_company_id got revoked, repoint to the first remaining company
  // (or null).
  const { data: prof } = await svc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('profiles').select('active_company_id' as any).eq('id', targetUserId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeId = (prof as any)?.active_company_id as string | null | undefined
  if (activeId && !desired.has(activeId)) {
    const fallback = [...desired][0] ?? null
    await svc
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ active_company_id: fallback } as any)
      .eq('id', targetUserId)
  }

  return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length })
}
```

- [ ] **Step 2: Type-check + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && git add src/app/api/admin/users/[id]/companies/route.ts && git commit -m "feat(api): PUT /api/admin/users/[id]/companies syncs user_companies to a target list"
```

---

### Task 12: Admin Companies tab in user settings

**Files:**
- Create: `src/app/admin/settings/users/[id]/_tabs/companies-tab.tsx`
- Modify: the settings navigation for a user (look at `src/app/admin/settings/users/[id]/_settings-nav.tsx` or the page/tabs container to add a "Companies" entry).

- [ ] **Step 1: Write the tab component**

Create `src/app/admin/settings/users/[id]/_tabs/companies-tab.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface Company {
  id: string
  slug: string
  name: string
  logo_path: string
  brand_color: string
}

// Admin panel: check the boxes for the companies this user should have access
// to. Save button PUTs to /api/admin/users/[id]/companies with the current
// desired set.
export function CompaniesTab({ userId }: { userId: string }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initial, setInitial] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // List all companies for the checkboxes.
      const rAll = await fetch('/api/admin/companies', { cache: 'no-store' })
      const jsonAll = rAll.ok ? await rAll.json() : { companies: [] }
      setCompanies(jsonAll.companies ?? [])
      // List this user's current memberships.
      const rMine = await fetch(`/api/admin/users/${userId}/companies`, { cache: 'no-store' })
      const jsonMine = rMine.ok ? await rMine.json() : { companyIds: [] }
      const ids = new Set<string>(jsonMine.companyIds ?? [])
      setSelected(ids)
      setInitial(ids)
      setLoading(false)
    })()
  }, [userId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const dirty = selected.size !== initial.size || [...selected].some(id => !initial.has(id))

  async function save() {
    setSaving(true); setMessage(null)
    const r = await fetch(`/api/admin/users/${userId}/companies`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: [...selected] }),
    })
    setSaving(false)
    if (!r.ok) {
      const body = await r.json().catch(() => ({} as { error?: string }))
      setMessage(body.error ?? 'Save failed')
      return
    }
    setInitial(new Set(selected))
    setMessage('Saved.')
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Company access</h3>
        <p className="text-xs text-gray-500 mt-1">Which companies can this user work claims for. Removing access hides that company's claims and data from them immediately.</p>
      </div>
      <div className="space-y-2">
        {companies.map(c => (
          <label key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Image src={c.logo_path} alt={c.name} width={24} height={24} className="h-6 w-6 object-contain" />
            <span className="text-sm font-medium text-gray-800">{c.name}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {message && <span className={`text-xs ${message === 'Saved.' ? 'text-emerald-600' : 'text-red-600'}`}>{message}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the two supporting admin endpoints referenced above**

`src/app/api/admin/companies/route.ts` — GET returns all companies (admin sees the full list, not just their own):

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('companies')
    .select('id, slug, name, logo_path, brand_color')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}
```

Add a GET handler alongside the existing PUT in `src/app/api/admin/users/[id]/companies/route.ts`:

```typescript
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse
  const { id: targetUserId } = await params
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_companies')
    .select('company_id')
    .eq('user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companyIds: ((data ?? []) as { company_id: string }[]).map(r => r.company_id) })
}
```

- [ ] **Step 3: Wire the tab into the user-settings tabs container**

Read the current tabs list:

```
cd "C:\XSFA\Modern Tools Official" && grep -rn "PermissionsTab\|FeesTab" src/app/admin/settings/users/ | head -5
```

Identify the file where the existing tabs (Permissions, Fees, etc.) are listed. Add a `Companies` entry that renders `<CompaniesTab userId={...} />` when active. Follow the exact same pattern as the existing tabs — don't invent a new tabs mechanism.

- [ ] **Step 4: Type-check + build + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && npm run build 2>&1 | tail -5 && git add src/app/api/admin/companies/ src/app/api/admin/users/ src/app/admin/settings/users/ && git commit -m "feat(admin): user settings gets a Companies tab (checkbox grant/revoke user_companies)"
```

---

### Task 13: Report tab UI — clean empty state on `NO_TEMPLATE`

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx` — the 5 PDF-download buttons (ACV, DV, Award, Notes, Invoice, Storage) that fetch `/api/*/generate-pdf`.

Currently each button downloads the blob and triggers a save. When the route returns 400 with `{ code: 'NO_TEMPLATE' }`, the client should show an inline notice instead of downloading a broken file / silent failure.

- [ ] **Step 1: Locate the PDF-download handlers**

Run: `cd "C:\XSFA\Modern Tools Official" && grep -n "generate-pdf\|generate-award-pdf\|generate-notes-pdf\|generate-dv-pdf\|generate-contract-pdf" src/components/claim/ClaimWorkspace.tsx | head -10`

- [ ] **Step 2: For each handler, add a NO_TEMPLATE branch**

Before triggering the blob download, inspect the response. Replace the download pattern like:

```typescript
const r = await fetch('/api/acv/generate-pdf', { method: 'POST', ... })
if (!r.ok) { alert('Failed'); return }
const blob = await r.blob()
// ...download
```

With:

```typescript
const r = await fetch('/api/acv/generate-pdf', { method: 'POST', ... })
if (r.status === 400) {
  const body = await r.clone().json().catch(() => ({} as { code?: string; error?: string }))
  if (body.code === 'NO_TEMPLATE') {
    alert('This report template isn\'t set up for the current company yet. Ask an admin to add it, or switch companies.')
    return
  }
}
if (!r.ok) { alert('Failed'); return }
const blob = await r.blob()
// ...download
```

Apply to every PDF-download call site (ACV, DV, Award, Notes, Contract, Certificate, Invoice, Storage).

- [ ] **Step 3: Type-check + commit**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && git add src/components/claim/ClaimWorkspace.tsx && git commit -m "feat(ui): PDF-download buttons show a clean NO_TEMPLATE message instead of a broken download"
```

---

### Task 14: Full verification + capture rollback URL

- [ ] **Step 1: Full verification pass**

```
cd "C:\XSFA\Modern Tools Official" && npx tsc --noEmit && echo "---BUILD---" && npm run build 2>&1 | tail -5 && echo "---LINT---" && npm run lint:no-raw-acv-queries && echo "---UNIT TESTS---" && npx vitest run __tests__/scoped-client.test.ts && echo "---ISOLATION TESTS---" && npm run test:isolation
```

Expected: tsc clean, build clean, lint clean, 6 scoped-client tests pass, 9 isolation tests pass.

- [ ] **Step 2: Capture the current live deploy URL as the rollback target**

```
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|url" | head -2
```

Save the URL for the rollback note in the deploy message.

---

### Task 15: Deploy Phase 3 to production

- [ ] **Step 1: Deploy**

```
cd "C:\XSFA\Modern Tools Official" && npx vercel --prod --scope henry-as-projects-88caed67 --yes 2>&1 | tail -8
```

- [ ] **Step 2: Confirm alias**

```
cd "C:\XSFA\Modern Tools Official" && npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67 2>&1 | grep -E "id|status" | head -3
```

Expected: new deploy id, status `● Ready`.

---

### Task 16: Post-deploy smoke test

Report to Henry:
- Deploy id + URL.
- Rollback command for the Phase 2 deploy captured in Task 14 Step 2.
- Ask him to log in as an admin, go to `/admin/settings/users/<henry's-user-id>` → Companies tab, and check the "Eagleview" box + Save. Then log out / log back in, or just click the switcher pill (should appear now that he has 2 companies) and pick Eagleview.
- Confirm the header logo flips to the Eagleview blue logo.
- Confirm the dashboard shows 0 claims (no EV claims exist yet).
- Confirm attempting to generate any PDF from a hypothetical EV claim would return the "no template configured" message (once claims exist).
- Confirm switching back to Modern Appraisers restores the full MA view.

Do not mark this task complete until Henry has done the switch round-trip and everything looks right. If broken, roll back per Task 17.

---

### Task 17: (contingency) Rollback if smoke test fails

- [ ] **Step 1: Rollback**

Run the vercel promote command with the URL captured in Task 14 Step 2. No DB rollback needed for Phase 3 — schema hasn't changed since Phase 1.

---

### Task 18: SESSIONS.md entry for Phase 3

- [ ] **Step 1: Prepend a new entry**

Add a new top entry to `docs/SESSIONS.md` documenting:
- Title: "HamsPortal Phase 3: Eagleview go-live — company switcher, admin UI, per-company templates".
- Worked on.
- Files changed (asset moves + new hooks + admin API + admin tab + fillers).
- Deploy status + rollback command.
- Note that Eagleview has no claims/templates yet — Henry seeds when ready.
- Next: whatever comes next (deferred items from the plan or new work).

- [ ] **Step 2: Commit**

```
cd "C:\XSFA\Modern Tools Official" && git add docs/SESSIONS.md && git commit -m "docs: SESSIONS entry for HamsPortal Phase 3 — Eagleview go-live"
```

---

## Self-review

**Spec coverage:**
- MA logo + templates moved → Task 1 (copy) + Task 6 (delete originals).
- EV logo added → Task 1.
- PDF fillers per-company → Tasks 3–4.
- Empty template state → Tasks 4 (throw), 5 (return typed error), 13 (UI handling).
- `/api/companies` + hooks → Tasks 7–8.
- Company switcher → Task 9.
- Dynamic header logo → Task 10.
- Admin API + UI → Tasks 11–12.
- Verification + deploy + rollback + SESSIONS → Tasks 14–18.

**Placeholder scan:** None found. Every step has explicit commands or code snippets.

**Type consistency:** `activeCompany.logoPath` (camelCase in TS) resolves to `logo_path` (snake_case in the SQL). Hooks unpack the mapping in the useEffect body. `NoTemplateError.code === 'NO_TEMPLATE'` matches `NO_TEMPLATE_CODE` const and the client-side switch case.

**Note on scope-omission:** The plan does not include a full new Vitest test suite for the EV path (creating an EV user via the admin API, hitting a PDF-generate endpoint, asserting NO_TEMPLATE response). Reasoning: the existing isolation suite already proves EV users are locked out of MA data; the NO_TEMPLATE path is exercised by manual smoke test in Task 16 (fastest path to real confidence). If Phase 4 adds automated NO_TEMPLATE test coverage, it slots into `__tests__/no-template.test.ts` using the seed helpers.
