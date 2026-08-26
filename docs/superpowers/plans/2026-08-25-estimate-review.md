# Estimate Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-driven "Estimate Review" sub-tab inside the claim workspace's Estimate Dispute tab that reads an uploaded estimate against the MOTOR/CCC P-Pages rulebook and flags padded line items, per the design at `docs/superpowers/specs/2026-08-25-estimate-review-design.md`.

**Architecture:** Single-API-call pipeline (Claude Sonnet 4.6 with prompt caching on the ~35k-token P-Pages text). Underline sub-tabs inside the existing `<EstimateTab />`. Reviews persist as `reviews: EstimateReview[]` on the existing `acv_history.estimate` jsonb — no migration. Auto-file to Documents tab like every other report on the claim.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, `@anthropic-ai/sdk` (existing), `unpdf`/`tesseract.js` (existing), `pdf-lib` (existing), `html2canvas`/`jspdf` (existing), Supabase Storage (existing bucket `claim-documents`).

**Verification model:** No test framework in this repo. "Verify" = `npx tsc --noEmit` + `npm run build` + a manual dev-server smoke check. This matches the standing pattern in CLAUDE.md and how the Compare tool was verified when built.

---

## Task 1: Extract P-Pages PDF into a committed text file

Extract text once from Henry's source PDF and commit as static rulebook content. Runs once now, and again whenever the P-Pages source updates.

**Files:**
- Create: `scripts/extract-p-pages.mjs`
- Create: `src/lib/estimate-review/p-pages.txt` (generated output — committed)

- [ ] **Step 1: Create the extraction script**

Path: `scripts/extract-p-pages.mjs`

```javascript
// One-shot: extract text from Henry's CCC P-Pages PDF into a committed .txt
// Run manually when P-Pages source updates:
//   node scripts/extract-p-pages.mjs "C:/Users/Owner/Desktop/CCC Estimate Guide - P Pages.pdf"
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { extractText } from 'unpdf'

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/extract-p-pages.mjs <path-to-p-pages.pdf>')
  process.exit(1)
}
const dest = 'src/lib/estimate-review/p-pages.txt'

const buf = readFileSync(src)
const { totalPages, text } = await extractText(new Uint8Array(buf), { mergePages: true })

mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, text, 'utf8')
console.log(`Extracted ${totalPages} pages, ${text.length.toLocaleString()} chars → ${dest}`)
```

- [ ] **Step 2: Run the extraction**

```
node scripts/extract-p-pages.mjs "C:/Users/Owner/Desktop/CCC Estimate Guide - P Pages.pdf"
```

Expected output: `Extracted 40 pages, 132,611 chars → src/lib/estimate-review/p-pages.txt` (character count may vary slightly).

- [ ] **Step 3: Sanity-check the extracted text**

```
head -c 500 "src/lib/estimate-review/p-pages.txt"
```

Expected: Starts with "CED GUIDE TO ESTIMATING" and includes rulebook terminology (R&R, R&I, Included, etc).

- [ ] **Step 4: Commit**

```
git add scripts/extract-p-pages.mjs src/lib/estimate-review/p-pages.txt
git commit -m "Add P-Pages rulebook extraction script + extracted text"
```

---

## Task 2: Define types for reviews + flags

Central type module used by the API route, the tab component, the PDF renderer, and the storage code. Extends `ClaimEstimate` to hold the new `reviews` array.

**Files:**
- Create: `src/lib/estimate-review/types.ts`
- Modify: `src/components/claim/estimate-tab.tsx` (add `reviews?` to `ClaimEstimate`)

- [ ] **Step 1: Create the types file**

Path: `src/lib/estimate-review/types.ts`

```typescript
// Shape of a single flagged line item in an Estimate Review.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §3.
export type FlagCategory = 'not_included' | 'overlap' | 'excess_labor' | 'duplicate'
export type FlagSeverity = 'low' | 'medium' | 'high'
export type SuggestedAction = 'reduce' | 'remove'

export interface FlagAmount {
  laborHours?: number
  laborRate?: number
  partPrice?: number
  total: number // dollars
}

export interface Flag {
  lineDescription: string   // e.g. "Front Bumper Cover — Replace"
  panelOrArea: string       // e.g. "Front End"
  category: FlagCategory
  severity: FlagSeverity
  iaBilled: FlagAmount
  suggested: FlagAmount & { action: SuggestedAction }
  ruleReference: string     // e.g. "P-Pages Ch. 11-18"
  ruleQuote: string         // verbatim excerpt
  impact: number            // negative dollars (reduction)
}

// One completed review. A claim can have many.
export interface EstimateReview {
  id: string                // uuid, generated client-side
  reviewNumber: number      // sequential per claim ("#1", "#2", …)
  savedAt: string           // ISO
  fileName: string
  software: string          // detected via lib/estimate-parser.ts
  grandTotalBilled: number  // parsed from the estimate
  photoCount: number        // 0–10
  flags: Flag[]
  documentId?: string       // set after auto-filing to Documents tab
  error?: string            // set if this file's review failed (empty flags[])
}

// Human-facing label lookup for a category badge.
export const CATEGORY_LABEL: Record<FlagCategory, string> = {
  not_included: 'Not Included',
  overlap: 'Overlap Not Deducted',
  excess_labor: 'Excess Labor',
  duplicate: 'Duplicate Charge',
}
```

- [ ] **Step 2: Extend `ClaimEstimate` in the estimate tab**

Modify `src/components/claim/estimate-tab.tsx`. Add the import and extend the existing interface.

Find the existing `ClaimEstimate` interface (around line 70) and add the `reviews` field. Also add the import at the top of the imports block:

```typescript
import type { EstimateReview } from "@/lib/estimate-review/types";
```

Then find and modify:

```typescript
// BEFORE (find this):
export interface ClaimEstimate {
  savedAt: string;
  fileNameA: string;
  fileNameB: string;
  softwareA: string;
  softwareB: string;
  grandTotalA: number;
  grandTotalB: number;
  totalDifference: number;
  result: ComparisonResult;
}

// AFTER:
export interface ClaimEstimate {
  savedAt: string;
  fileNameA: string;
  fileNameB: string;
  softwareA: string;
  softwareB: string;
  grandTotalA: number;
  grandTotalB: number;
  totalDifference: number;
  result: ComparisonResult;
  // NEW: Estimate Review results. Optional — undefined on claims that predate this feature.
  reviews?: EstimateReview[];
}
```

- [ ] **Step 3: Verify types compile**

```
npx tsc --noEmit
```

Expected: no new errors. Pre-existing warnings/errors are OK — same set as before this task.

- [ ] **Step 4: Commit**

```
git add src/lib/estimate-review/types.ts src/components/claim/estimate-tab.tsx
git commit -m "Add EstimateReview + Flag types; extend ClaimEstimate.reviews"
```

---

## Task 3: Build the prompt module

Prompt builders + JSON parsing. Kept separate from the API route so it's easy to iterate on and could be unit-tested later.

**Files:**
- Create: `src/lib/estimate-review/prompt.ts`

- [ ] **Step 1: Create the prompt module**

Path: `src/lib/estimate-review/prompt.ts`

```typescript
// Prompt builders + JSON parser for /api/acv/review-estimate.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §5.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EstimateReview, Flag } from './types'

// Load the P-Pages rulebook once per lambda cold-start.
let pPagesCache: string | null = null
export function getPPagesText(): string {
  if (pPagesCache === null) {
    pPagesCache = readFileSync(join(process.cwd(), 'src/lib/estimate-review/p-pages.txt'), 'utf8')
  }
  return pPagesCache
}

// System block A: uncached, small — task instructions + schema.
export const SYSTEM_INSTRUCTIONS = `You are an expert auto-body damage appraiser reviewing an insurance company appraiser's ("IA's") estimate for over-writing per the MOTOR / CCC P-Pages rulebook provided below.

Your job: flag every line item in the estimate that violates the rulebook. Only flag items backed by explicit rulebook text. DO NOT flag judgment calls (Replace-vs-Repair opinions, part-quality disputes) that aren't rulebook-defined.

The four categories to flag:
1. not_included — the IA billed separately for an operation the rulebook says is Included in a base R&R/refinish time
2. overlap — the IA billed adjacent operations without applying the rulebook's overlap deduction
3. excess_labor — the IA's labor hours materially exceed the published guide time (>20% or >0.5 hrs, whichever is larger)
4. duplicate — same operation billed under two names, or a part billed when it's part of an already-billed assembly

For each flag, cite the rulebook section (e.g. "P-Pages Ch. 11-18" or "G2 Guide") and quote the relevant text verbatim in ruleQuote.

If reference photos are provided, use them as evidence — e.g. photos showing only cosmetic damage may support flagging a Replace as excessive. Reference the photo in ruleQuote if you use one.

Also parse the estimate's grand total (the "TOTAL COST" or "GRAND TOTAL" line, whichever is the final billed amount) into grandTotalBilled, and the detected software (CCC ONE, Mitchell, Audatex, Web-Est, Estimating Edge, or "Unknown") into software.

Return JSON ONLY — no markdown, no prose. Schema:
{
  "grandTotalBilled": 0.00,
  "software": "CCC ONE",
  "flags": [
    {
      "lineDescription": "Front Bumper Cover — Replace",
      "panelOrArea": "Front End",
      "category": "excess_labor",
      "severity": "medium",
      "iaBilled": { "laborHours": 3.5, "laborRate": 75, "partPrice": 0, "total": 262.50 },
      "suggested": { "action": "reduce", "laborHours": 1.7, "laborRate": 75, "partPrice": 0, "total": 127.50 },
      "ruleReference": "P-Pages Ch. 11-18",
      "ruleQuote": "R&R front bumper cover — 1.7 hrs. Base time includes cover removal, R&I of impact absorbers, and reinstallation.",
      "impact": -135.00
    }
  ]
}

Notes:
- impact is always negative (represents a proposed reduction).
- If nothing is flag-worthy, return {"grandTotalBilled": N, "software": "...", "flags": []}.
- Order flags by descending |impact|.
- Severity: low = <$50 impact, medium = $50–$300, high = >$300.`

// System block B: cached (5-min ephemeral). The entire P-Pages rulebook.
export function buildSystemBlocks() {
  return [
    { type: 'text' as const, text: SYSTEM_INSTRUCTIONS },
    {
      type: 'text' as const,
      text: `--- CCC / MOTOR P-Pages Rulebook (verbatim reference) ---\n\n${getPPagesText()}`,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

// Build the user message: estimate text + optional photo image blocks.
// Photos are passed in as base64 data URLs.
export function buildUserMessage(estimateText: string, photos: Array<{ media_type: string; data: string }>, fileName: string) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  > = []

  if (photos.length > 0) {
    content.push({
      type: 'text',
      text: `Reference photos (${photos.length}) of the vehicle for context:`,
    })
    for (const p of photos) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: p.media_type, data: p.data },
      })
    }
  }

  content.push({
    type: 'text',
    text: `Estimate to review (${fileName}):\n\n${estimateText}\n\n---\n\nReview this estimate against the P-Pages rulebook and return JSON only.`,
  })

  return content
}

// Parse the model's JSON response into a partial EstimateReview (no id/reviewNumber yet).
export interface ParsedReviewPayload {
  grandTotalBilled: number
  software: string
  flags: Flag[]
}

export function parseReviewResponse(raw: string): ParsedReviewPayload {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as ParsedReviewPayload
  if (!Array.isArray(parsed.flags)) throw new Error('Response missing flags array')
  // Sort by descending |impact| defensively.
  parsed.flags.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  return parsed
}

// Helper for the API route: build a review object once we have all the pieces.
export function buildReview(input: {
  parsed: ParsedReviewPayload
  fileName: string
  photoCount: number
  reviewNumber: number
}): EstimateReview {
  return {
    id: crypto.randomUUID(),
    reviewNumber: input.reviewNumber,
    savedAt: new Date().toISOString(),
    fileName: input.fileName,
    software: input.parsed.software || 'Unknown',
    grandTotalBilled: Number(input.parsed.grandTotalBilled) || 0,
    photoCount: input.photoCount,
    flags: input.parsed.flags,
  }
}
```

- [ ] **Step 2: Verify types compile**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/lib/estimate-review/prompt.ts
git commit -m "Add Estimate Review prompt builder + JSON parser"
```

---

## Task 4: Build the API route

The endpoint the UI calls. Parses multipart form (multiple estimates + up to 10 photos), extracts text, calls Anthropic with the cached P-Pages, returns reviews.

**Files:**
- Create: `src/app/api/acv/review-estimate/route.ts`

- [ ] **Step 1: Create the API route**

Path: `src/app/api/acv/review-estimate/route.ts`

```typescript
// POST /api/acv/review-estimate
// Multipart form: estimates=<file>[] (1+), photos=<file>[] (0–10).
// Returns: { reviews: EstimateReview[] } — one per estimate file.
// Failed estimates come back as review entries with { error, flags: [] }.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from '@/lib/pdf-extractor'
import { extractTextFromImage } from '@/lib/image-extractor'
import { buildSystemBlocks, buildUserMessage, buildReview, parseReviewResponse } from '@/lib/estimate-review/prompt'
import type { EstimateReview } from '@/lib/estimate-review/types'

export const runtime = 'nodejs'
export const maxDuration = 300 // allow long AI streams

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_CONCURRENT = 3
const MAX_PHOTOS = 10

async function extractEstimateText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const type = file.type.toLowerCase()
  if (type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractTextFromPDF(buffer)
  }
  if (type.startsWith('image/')) {
    return extractTextFromImage(buffer)
  }
  throw new Error(`Unsupported estimate file type: ${type}`)
}

async function encodePhoto(file: File): Promise<{ media_type: string; data: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  // Anthropic accepts image/jpeg, image/png, image/gif, image/webp.
  let media_type = file.type
  if (!media_type || !media_type.startsWith('image/')) {
    // Fall back based on extension (PDFs as reference photos aren't supported for vision).
    media_type = 'image/jpeg'
  }
  return { media_type, data: buffer.toString('base64') }
}

async function reviewOne(
  estimate: File,
  photos: Array<{ media_type: string; data: string }>,
  reviewNumber: number,
): Promise<EstimateReview> {
  try {
    const text = await extractEstimateText(estimate)
    const stream = await client.beta.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      betas: ['output-128k-2025-02-19'],
      system: buildSystemBlocks(),
      messages: [{ role: 'user', content: buildUserMessage(text, photos, estimate.name) }],
    })
    const finalMessage = await stream.finalMessage()
    const raw = finalMessage.content[0]?.type === 'text' ? finalMessage.content[0].text : ''
    const parsed = parseReviewResponse(raw)
    return buildReview({ parsed, fileName: estimate.name, photoCount: photos.length, reviewNumber })
  } catch (err) {
    console.error('review-estimate: failed for', estimate.name, err)
    return {
      id: crypto.randomUUID(),
      reviewNumber,
      savedAt: new Date().toISOString(),
      fileName: estimate.name,
      software: 'Unknown',
      grandTotalBilled: 0,
      photoCount: photos.length,
      flags: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// Concurrency-limited parallel processing.
async function processInBatches<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const estimates = formData.getAll('estimates').filter((v): v is File => v instanceof File)
    const photos = formData.getAll('photos').filter((v): v is File => v instanceof File).slice(0, MAX_PHOTOS)
    const nextNumberRaw = formData.get('nextReviewNumber')
    const nextNumber = typeof nextNumberRaw === 'string' ? Number(nextNumberRaw) : 1

    if (estimates.length === 0) {
      return NextResponse.json({ error: 'At least one estimate file is required' }, { status: 400 })
    }

    const encodedPhotos = await Promise.all(photos.map(encodePhoto))

    const reviews = await processInBatches(estimates, MAX_CONCURRENT, (file, i) =>
      reviewOne(file, encodedPhotos, nextNumber + i),
    )

    return NextResponse.json({ reviews })
  } catch (err) {
    console.error('review-estimate error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Type-check + build**

```
npx tsc --noEmit
npm run build
```

Expected: both pass. `npm run build` will print pre-existing warnings from vendored files — those are OK.

- [ ] **Step 3: Commit**

```
git add src/app/api/acv/review-estimate/route.ts
git commit -m "Add /api/acv/review-estimate — AI review against P-Pages"
```

---

## Task 5: Refactor Compare into an inner component + add underline sub-tabs

Refactor pass on `estimate-tab.tsx` so the top-level `<EstimateTab />` becomes a shell that routes between two sub-views. **No behavior changes to Compare.**

**Files:**
- Modify: `src/components/claim/estimate-tab.tsx`

- [ ] **Step 1: Rename current EstimateTab export → CompareEstimates (internal)**

In `src/components/claim/estimate-tab.tsx`, find the current `export function EstimateTab(...)` (around line 754). Rename to `function CompareEstimates(...)` — drop the `export`, drop the "Estimate Dispute tab (claim workspace)" header comment, and keep everything else identical. Also drop `import` of `ArrowLeft` if no longer used inside CompareEstimates (it's used for the "Back to saved comparison" button — keep it).

- [ ] **Step 2: Add a new top-level EstimateTab shell**

At the bottom of `src/components/claim/estimate-tab.tsx`, add:

```typescript
import { EstimateReviewTab } from "./estimate-review-tab";

type SubTab = 'compare' | 'review';

function defaultSubTab(estimate: ClaimEstimate | null): SubTab {
  const hasCompare = !!estimate?.result;
  const hasReviews = !!(estimate?.reviews && estimate.reviews.length > 0);
  if (hasReviews && !hasCompare) return 'review';
  return 'compare';
}

export function EstimateTab({
  claim,
  estimate,
  onChange,
}: {
  claim: ClaimInfo;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>(() => defaultSubTab(estimate));

  return (
    <div className="space-y-4">
      {/* Underline sub-tabs */}
      <div className="no-print flex gap-6 border-b border-gray-200">
        {(['compare', 'review'] as const).map(id => {
          const active = subTab === id;
          const label = id === 'compare' ? 'Compare Two Estimates' : 'Estimate Review';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={cn(
                'py-2 text-sm font-semibold transition-colors -mb-px',
                active
                  ? 'text-gray-900 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {subTab === 'compare' ? (
        <CompareEstimates claim={claim} estimate={estimate} onChange={onChange} />
      ) : (
        <EstimateReviewTab claim={claim} estimate={estimate} onChange={onChange} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify Compare still works**

```
npx tsc --noEmit
```

Expected: ONE error — `Cannot find module './estimate-review-tab'`. That's expected; we haven't created it yet.

- [ ] **Step 4: Create a temporary EstimateReviewTab stub so the app compiles**

Path: `src/components/claim/estimate-review-tab.tsx`

```typescript
"use client";
import type { ClaimInfo } from "@/lib/acv/types";
import type { ClaimEstimate } from "./estimate-tab";

export function EstimateReviewTab({
  claim: _claim,
  estimate: _estimate,
  onChange: _onChange,
}: {
  claim: ClaimInfo;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
}) {
  return (
    <div className="p-8 text-center text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
      Estimate Review — coming up in the next task.
    </div>
  );
}
```

- [ ] **Step 5: Type-check + build**

```
npx tsc --noEmit
npm run build
```

Expected: both pass.

- [ ] **Step 6: Dev-server smoke test**

```
npm run dev
```

Open any claim, go to Estimate Dispute tab. Expected: see the two sub-tabs at the top; Compare works exactly as before; Review tab shows the placeholder. Then stop the dev server (Ctrl-C).

- [ ] **Step 7: Commit**

```
git add src/components/claim/estimate-tab.tsx src/components/claim/estimate-review-tab.tsx
git commit -m "Add underline sub-tabs to Estimate Dispute; Compare unchanged"
```

---

## Task 6: Build the Estimate Review upload panel + review-list state

Wires the upload form, calls the API, saves results onto the claim. Renders raw review data at first (no fancy table yet — that's Task 7).

**Files:**
- Modify: `src/components/claim/estimate-review-tab.tsx`

- [ ] **Step 1: Replace the stub with the upload + list scaffold**

Path: `src/components/claim/estimate-review-tab.tsx`

```typescript
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClaimInfo } from "@/lib/acv/types";
import type { EstimateReview } from "@/lib/estimate-review/types";
import type { ClaimEstimate } from "./estimate-tab";

const MAX_PHOTOS = 10;

function buildEmptyEstimate(prev: ClaimEstimate | null): ClaimEstimate {
  return {
    savedAt: prev?.savedAt ?? new Date().toISOString(),
    fileNameA: prev?.fileNameA ?? "",
    fileNameB: prev?.fileNameB ?? "",
    softwareA: prev?.softwareA ?? "",
    softwareB: prev?.softwareB ?? "",
    grandTotalA: prev?.grandTotalA ?? 0,
    grandTotalB: prev?.grandTotalB ?? 0,
    totalDifference: prev?.totalDifference ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: prev?.result ?? ({} as any),
    reviews: prev?.reviews ?? [],
  };
}

// ── Drop zone for multiple files ────────────────────────────────────────────
function MultiDropZone({
  label,
  files,
  onAdd,
  onRemove,
  accept,
  hint,
  max,
}: {
  label: string;
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  accept: Record<string, string[]>;
  hint: string;
  max?: number;
}) {
  const disabled = max !== undefined && files.length >= max;
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!accepted.length) return;
      const room = max !== undefined ? Math.max(0, max - files.length) : accepted.length;
      onAdd(accepted.slice(0, room));
    },
    [files.length, max, onAdd],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept, disabled });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        {max !== undefined && (
          <span className="text-xs text-gray-400">
            {files.length}/{max}
          </span>
        )}
      </div>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-all",
          disabled
            ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
            : "cursor-pointer",
          !disabled && isDragActive
            ? "border-blue-500 bg-blue-50"
            : !disabled && "border-gray-300 bg-white hover:border-gray-400",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          {disabled ? `Max ${max} reached` : isDragActive ? "Drop here…" : hint}
        </p>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 p-2 rounded border border-gray-200 bg-gray-50 text-sm"
            >
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate flex-1 text-gray-800">{f.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────
export function EstimateReviewTab({
  claim,
  estimate,
  onChange,
}: {
  claim: ClaimInfo;
  estimate: ClaimEstimate | null;
  onChange: (next: ClaimEstimate) => void;
}) {
  const reviews = estimate?.reviews ?? [];
  const [estimates, setEstimates] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(reviews.length === 0);

  const vehicleLabel = [claim.year || "", claim.make, claim.model].filter(Boolean).join(" ");

  const handleRun = async () => {
    if (estimates.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const f of estimates) formData.append("estimates", f);
      for (const f of photos) formData.append("photos", f);
      const nextNumber = reviews.length + 1;
      formData.append("nextReviewNumber", String(nextNumber));

      const res = await fetch("/api/acv/review-estimate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");

      const newReviews = (data.reviews ?? []) as EstimateReview[];
      const next = buildEmptyEstimate(estimate);
      next.reviews = [...newReviews, ...reviews]; // newest on top
      onChange(next);
      setEstimates([]);
      setPhotos([]);
      setShowUpload(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = (id: string) => {
    if (!confirm("Delete this review? This can't be undone.")) return;
    const next = buildEmptyEstimate(estimate);
    next.reviews = reviews.filter(r => r.id !== id);
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar: "Review another estimate" */}
      {!showUpload && reviews.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            + Review Another Estimate
          </Button>
        </div>
      )}

      {/* Upload panel */}
      {showUpload && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5 max-w-3xl">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Estimate Review</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload one or more estimates. Each gets its own review against the P-Pages rulebook.
              {vehicleLabel ? ` Results save to this claim (${vehicleLabel}).` : " Results save to this claim."}
            </p>
          </div>
          <MultiDropZone
            label="Estimates to review"
            files={estimates}
            onAdd={files => setEstimates(prev => [...prev, ...files])}
            onRemove={i => setEstimates(prev => prev.filter((_, idx) => idx !== i))}
            accept={{
              "application/pdf": [".pdf"],
              "image/*": [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"],
            }}
            hint="Drop PDFs or images, or click to browse (drop multiple at once)"
          />
          <MultiDropZone
            label="Reference photos (optional)"
            files={photos}
            onAdd={files => setPhotos(prev => [...prev, ...files])}
            onRemove={i => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
            accept={{ "image/*": [".jpg", ".jpeg", ".png", ".webp"] }}
            hint="Drop up to 10 vehicle photos for cross-checking"
            max={MAX_PHOTOS}
          />
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRun}
              disabled={estimates.length === 0 || loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading
                ? `Reviewing ${estimates.length} estimate${estimates.length === 1 ? "" : "s"}…`
                : "Run Review"}
            </Button>
            {reviews.length > 0 && !loading && (
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setError(null);
                  setEstimates([]);
                  setPhotos([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Review cards — Task 7 replaces this with the real flag table */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map(review => (
            <div
              key={review.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    Review #{review.reviewNumber} · {review.fileName}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {review.software} · {new Date(review.savedAt).toLocaleString()}
                    {review.photoCount > 0 ? ` · ${review.photoCount} photo${review.photoCount === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteReview(review.id)}
                  className="text-gray-300 hover:text-red-500 shrink-0"
                  aria-label="Delete review"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {review.error ? (
                <div className="mt-3 p-3 rounded bg-red-50 border border-red-200 text-red-600 text-sm">
                  Review failed: {review.error}
                </div>
              ) : review.flags.length === 0 ? (
                <div className="mt-3 p-3 rounded bg-green-50 border border-green-200 text-green-700 text-sm">
                  No P-Pages violations found. Estimate looks clean.
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-600">
                  {review.flags.length} flag{review.flags.length === 1 ? "" : "s"} · total impact{" "}
                  <span className="font-bold text-amber-700">
                    -${review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0).toFixed(2)}
                  </span>
                  <div className="mt-2 text-xs text-gray-400 italic">
                    (Detailed table renders in the next commit.)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```
npx tsc --noEmit
npm run build
```

- [ ] **Step 3: Commit**

```
git add src/components/claim/estimate-review-tab.tsx
git commit -m "Build Estimate Review upload panel + review list (raw summary)"
```

---

## Task 7: Build the flag table

Replace the placeholder review card body with the compact-table layout (visual option A). This is where the review's real output lives.

**Files:**
- Modify: `src/components/claim/estimate-review-tab.tsx`

- [ ] **Step 1: Add table + helpers + badge styling to `estimate-review-tab.tsx`**

Add these helpers near the top of the file (below the imports, before `MAX_PHOTOS`):

```typescript
import { CATEGORY_LABEL } from "@/lib/estimate-review/types";
import type { Flag, FlagCategory } from "@/lib/estimate-review/types";

const CATEGORY_STYLE: Record<FlagCategory, string> = {
  not_included: "bg-red-100 text-red-800",
  overlap: "bg-blue-100 text-blue-800",
  excess_labor: "bg-amber-100 text-amber-800",
  duplicate: "bg-purple-100 text-purple-800",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtBilled(a: { laborHours?: number; laborRate?: number; partPrice?: number; total: number }): string {
  const bits: string[] = [];
  if (a.laborHours) {
    bits.push(`${a.laborHours.toFixed(1)} hrs${a.laborRate ? ` @ ${fmtMoney(a.laborRate)}/hr` : ""}`);
  }
  if (a.partPrice) bits.push(`part ${fmtMoney(a.partPrice)}`);
  if (a.total && !a.laborHours && !a.partPrice) bits.push(fmtMoney(a.total));
  return bits.join(" · ") || fmtMoney(a.total);
}

function fmtSuggested(s: Flag["suggested"]): string {
  if (s.action === "remove") return "Remove";
  return fmtBilled(s);
}
```

- [ ] **Step 2: Add the `FlagTable` component**

Add this component to the same file, above `EstimateReviewTab`:

```typescript
function FlagTable({ flags }: { flags: Flag[] }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-gray-200">
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Line
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              IA Billed
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Rule
            </th>
            <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Suggested
            </th>
            <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Impact
            </th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag, i) => (
            <tr key={i} className="border-b border-gray-100 align-top">
              <td className="px-4 py-3">
                <div className="font-semibold text-gray-900">{flag.lineDescription}</div>
                {flag.panelOrArea && (
                  <div className="text-xs text-gray-400 mt-0.5">{flag.panelOrArea}</div>
                )}
                <span
                  className={cn(
                    "inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                    CATEGORY_STYLE[flag.category],
                  )}
                >
                  {CATEGORY_LABEL[flag.category]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700 text-xs">
                {fmtBilled(flag.iaBilled)}
                {flag.iaBilled.total !== 0 && (
                  <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.iaBilled.total)}</div>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                <div className="text-gray-500 font-semibold mb-0.5">{flag.ruleReference}</div>
                <div className="italic text-gray-600 line-clamp-3" title={flag.ruleQuote}>
                  &ldquo;{flag.ruleQuote}&rdquo;
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700 text-xs">
                {fmtSuggested(flag.suggested)}
                {flag.suggested.action !== "remove" && flag.suggested.total !== 0 && (
                  <div className="text-gray-500 mt-0.5">= {fmtMoney(flag.suggested.total)}</div>
                )}
              </td>
              <td className="px-4 py-3 text-right font-bold text-amber-700 tabular-nums">
                {flag.impact < 0 ? "-" : "+"}
                {fmtMoney(Math.abs(flag.impact))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Replace the placeholder body with the table**

In `EstimateReviewTab`, find the block:

```typescript
) : (
  <div className="mt-3 text-sm text-gray-600">
    {review.flags.length} flag{review.flags.length === 1 ? "" : "s"} · total impact{" "}
    <span className="font-bold text-amber-700">
      -${review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0).toFixed(2)}
    </span>
    <div className="mt-2 text-xs text-gray-400 italic">
      (Detailed table renders in the next commit.)
    </div>
  </div>
)}
```

Replace with:

```typescript
) : (
  <>
    <div className="mt-2 text-sm text-gray-600">
      {review.flags.length} flag{review.flags.length === 1 ? "" : "s"} · total impact{" "}
      <span className="font-bold text-amber-700">
        -{fmtMoney(review.flags.reduce((sum, f) => sum + Math.abs(f.impact), 0))}
      </span>
      {review.grandTotalBilled > 0 && (
        <span className="text-gray-400"> · IA billed {fmtMoney(review.grandTotalBilled)}</span>
      )}
    </div>
    <FlagTable flags={review.flags} />
  </>
)}
```

- [ ] **Step 4: Type-check + build**

```
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/components/claim/estimate-review-tab.tsx
git commit -m "Render compact flag table for each Estimate Review"
```

---

## Task 8: Auto-file each completed review as a PDF into the Documents tab

On review success, capture the review card as PDF and file it. Matches DV / Compare / Award / Notes behavior.

**Files:**
- Create: `src/lib/estimate-review/pdf.ts`
- Modify: `src/lib/supabase/documents.ts` (add `'estimate-review'` source)
- Modify: `src/components/claim/documents-tab.tsx` (display label for the new source)
- Modify: `src/components/claim/estimate-review-tab.tsx` (trigger auto-file after review)

- [ ] **Step 1: Read the existing documents helper to see the exact shape needed**

Read `src/lib/supabase/documents.ts`. Identify:
- The `DocumentSource` union (or equivalent enum)
- The `uploadClaimDocument` (or equivalent) function signature
- How existing tools (dv-tab, reports-tab) call it

Read the top ~30 lines of `src/lib/summary-pdf.ts` for the html2canvas + jspdf pattern.

- [ ] **Step 2: Add `'estimate-review'` to the DocumentSource union**

In `src/lib/supabase/documents.ts`, find the `DocumentSource` type (a union of string literals) and add `'estimate-review'` to it. Also — if there's a display-label map, add:

```typescript
'estimate-review': 'Estimate Review'
```

If there's no map (labels live elsewhere), skip that half and just extend the union.

- [ ] **Step 3: Add display label in documents-tab if needed**

In `src/components/claim/documents-tab.tsx`, find where source labels are rendered (usually a `SOURCE_LABEL` object or similar). Add:

```typescript
'estimate-review': 'Estimate Review',
```

- [ ] **Step 4: Create the PDF renderer**

Path: `src/lib/estimate-review/pdf.ts`

```typescript
"use client";
// Client-side helper: capture a rendered review card as a PDF blob.
// Uses the same html2canvas + jspdf pattern as src/lib/summary-pdf.ts.
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function captureReviewPdf(el: HTMLElement, fileName: string): Promise<Blob> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: 1100,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let position = 0;
  let heightLeft = imgHeight;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}

export function reviewPdfFileName(reviewNumber: number, sourceFileName: string): string {
  const stem = sourceFileName.replace(/\.[^.]+$/, "");
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `Review #${reviewNumber} — ${stem} — ${dateStamp}.pdf`;
}
```

- [ ] **Step 5: Wire auto-file into EstimateReviewTab**

In `src/components/claim/estimate-review-tab.tsx`, add refs so each review card has a captureable DOM node, and file the PDF right after the review returns from the API.

At the top of the file, add imports:

```typescript
import { useRef } from "react";
import { captureReviewPdf, reviewPdfFileName } from "@/lib/estimate-review/pdf";
```

Find the exact helper you identified in Step 1. Import it — for example (adjust to the actual name):

```typescript
import { uploadClaimDocument } from "@/lib/supabase/documents";
```

Inside `EstimateReviewTab`, add a ref map keyed by review id:

```typescript
const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
```

Attach the ref on each review card by wrapping the existing card `<div>`:

```typescript
<div
  key={review.id}
  ref={el => { cardRefs.current[review.id] = el; }}
  className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
>
```

After the review results are saved (inside `handleRun`, right after `onChange(next)`), file successful reviews in the background. Because the card refs won't exist until React renders them, use a `setTimeout(0)` to let the DOM update first:

```typescript
onChange(next);
setEstimates([]);
setPhotos([]);
setShowUpload(false);

// Auto-file each successful review into Documents (fire-and-forget).
setTimeout(async () => {
  const claimId = claim.acvHistoryId; // adjust to the actual id field on ClaimInfo
  if (!claimId) return;
  for (const review of newReviews) {
    if (review.error || review.flags.length === 0) continue;
    const el = cardRefs.current[review.id];
    if (!el) continue;
    try {
      const blob = await captureReviewPdf(el, review.fileName);
      const name = reviewPdfFileName(review.reviewNumber, review.fileName);
      await uploadClaimDocument({
        claimId,
        blob,
        fileName: name,
        source: "estimate-review",
      });
    } catch (err) {
      console.error("Failed to auto-file review PDF:", review.fileName, err);
    }
  }
}, 100);
```

Important: `claim.acvHistoryId` is a placeholder — inspect `ClaimInfo` type / how `dv-tab.tsx` gets the claim id and match that pattern exactly. If `ClaimInfo` doesn't carry the id, the calling `ClaimWorkspace` passes it — check `dv-tab.tsx` for how it does auto-filing today and copy the wiring.

- [ ] **Step 6: Type-check + build**

```
npx tsc --noEmit
npm run build
```

Fix any type errors from the placeholder names above. The types file for documents.ts will tell you the exact function signature.

- [ ] **Step 7: Commit**

```
git add src/lib/estimate-review/pdf.ts src/lib/supabase/documents.ts src/components/claim/documents-tab.tsx src/components/claim/estimate-review-tab.tsx
git commit -m "Auto-file completed Estimate Reviews to Documents tab as PDFs"
```

---

## Task 9: End-to-end verification + deploy

The whole feature is on disk. Verify, deploy, log the session.

- [ ] **Step 1: Full local verification**

```
npx tsc --noEmit
npm run lint
npm run build
```

All three must be clean (or with only pre-existing warnings — never new ones).

- [ ] **Step 2: Dev-server smoke test**

```
npm run dev
```

Then in the browser at `http://localhost:3000`:

1. Log in, open any claim.
2. Estimate Dispute tab → click **Estimate Review** sub-tab.
3. Drop a real estimate PDF (use a sample from Henry's claim files).
4. (Optional) drop 1-2 photos.
5. Click **Run Review** — expect a spinner for 20-60s.
6. Expect: review card appears, table renders with 0+ flags.
7. Navigate to **Documents** tab — expect a `Review #1 — <name> — <date>.pdf` file listed with source label "Estimate Review".
8. Refresh the page — expect the review still shown.
9. Click **+ Review Another Estimate** — expect upload form re-opens; run another; expect it becomes Review #2 above Review #1.
10. Click the trash icon on a review — expect it's removed from the list after confirm dialog.

Ctrl-C to stop the dev server.

- [ ] **Step 3: Capture current live deploy for rollback**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Note the deploy id shown in the "id" field and the URL. That's the rollback target.

- [ ] **Step 4: Deploy**

```
npx vercel --prod --scope henry-as-projects-88caed67 --yes
```

Wait for the "Deployment ... ready" message.

- [ ] **Step 5: Verify alias flipped**

```
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

Expect the alias to point to the deploy id printed at end of Step 4.

- [ ] **Step 6: Update SESSIONS.md**

Prepend a new entry to `docs/SESSIONS.md` with the format the file's header describes. Include:
- Files created / modified
- Deploy id + alias verification
- Rollback URL from Step 3
- Any known limitations (e.g. P-Pages copyright, false-positive risk)
- Next: nothing pending on this feature; wait for Henry's real-world usage

- [ ] **Step 7: Final commit**

```
git add docs/SESSIONS.md
git commit -m "SESSIONS: Log Estimate Review feature (built + deployed)"
```

---

## Self-review checklist (post-plan)

Reviewed after writing all tasks:

- [x] **Spec coverage.** All 13 sections of the spec map to tasks:
  - §1–2 (pitch, scope) → design context, not tasks
  - §3 (output shape / types) → Task 2
  - §4 (UI structure) → Tasks 5, 6, 7
  - §5 (API + pipeline) → Tasks 3, 4
  - §6 (data model) → Task 2
  - §7 (PDF + auto-file) → Task 8
  - §8 (file plan) → distributed across all tasks
  - §9 (verification plan) → Task 9
  - §10–12 (cost / risks / alternatives) → context, not tasks
  - §13 (sequencing) → matches this plan
- [x] **Placeholder scan.** Two placeholder-ish points intentionally left (Task 8 Step 1 asks the executor to read the actual documents.ts and match; Task 8 Step 5 uses `claim.acvHistoryId` as a placeholder with an instruction to match dv-tab.tsx). Both are documented, not silent TODOs.
- [x] **Type consistency.** `EstimateReview`, `Flag`, `FlagCategory`, `CATEGORY_LABEL`, `CATEGORY_STYLE` — all used consistently. `ClaimEstimate.reviews` extended once (Task 2), used from Tasks 6-8.
- [x] **Scope.** Single feature, single implementation session. No decomposition needed.
