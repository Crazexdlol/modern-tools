# Eagle View assignment parser — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the "upload PDF to auto-fill Claim Info" flow to recognise and parse Eagle View Enterprises assignment PDFs alongside the existing Modern Appraisers format, adding a Claimant contact block to `ClaimInfo` and auto-posting any PDF Notes as a "Modern Tools (Auto)" message on first save.

**Architecture:** Extract the current parser into `src/lib/acv/parsers/` (dispatch + per-format module), rewire both entry points (`src/lib/parse-claim-pdf.ts` browser-side, `/api/acv/parse-claim` server-side) to use the shared dispatch, then add the Eagle View parser + Claimant UI + a service-role `/api/claims/[id]/auto-message` endpoint for the informational message insert.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Supabase (`@supabase/ssr` + service role for auto-message insert), existing `pdfjs-dist` (client-side text) and `unpdf` + `tesseract.js` fallback (server-side).

**Spec:** `docs/superpowers/specs/2026-08-29-eagle-view-assignment-parser-design.md`

**Test framework:** None configured in this project. Verification per task is `npx tsc --noEmit` + `npm run build` clean + (for behavior-affecting tasks) manual browser check with the two sample PDFs on Henry's Desktop.

---

## Task 1: Add optional Claimant fields to `ClaimInfo`

**Files:**
- Modify: `src/lib/acv/types.ts`

- [ ] **Step 1: Add four optional fields to `ClaimInfo` interface**

In `src/lib/acv/types.ts`, add after the existing `ownerAddress: string` line (around line 24) and before `insuranceCompany: string`:

```ts
  // Optional Claimant contact block. Populated when the assignment PDF
  // captures a separate claimant party from the insured (Eagle View format
  // only for now). Existing claims fall through with these undefined —
  // non-breaking; downstream consumers keep reading insuredName/owner*.
  claimantName?: string
  claimantPhone?: string
  claimantEmail?: string
  claimantAddress?: string
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (adding optional properties is backward compatible).

- [ ] **Step 3: Commit**

```
git add src/lib/acv/types.ts
git commit -m "feat(claim-info): add optional Claimant contact block to ClaimInfo type"
```

---

## Task 2: Scaffold `src/lib/acv/parsers/` — shared types + detect (dispatch not yet wired)

**Files:**
- Create: `src/lib/acv/parsers/types.ts`
- Create: `src/lib/acv/parsers/detect.ts`

- [ ] **Step 1: Create `src/lib/acv/parsers/types.ts`**

```ts
// Shared result shape for every claim-PDF parser. Extends the pre-existing
// ParsedClaim (see src/lib/parse-claim-pdf.ts) with the new Claimant contact
// block, a raw `notes` string, and a `format` discriminator so downstream
// callers can branch (e.g. only Eagle View triggers the auto-message flow).

export type ClaimFormat = 'modern-appraisers' | 'eagle-view'

export interface ParsedClaim {
  format: ClaimFormat
  maNumber: string
  claimNumber: string
  dateOfLoss: string
  dateReceived: string
  clientType: 'Insured' | 'Claimant'
  clientName: string
  insuredName: string
  ownerPhone: string
  ownerEmail: string
  ownerAddress: string
  claimantName: string
  claimantPhone: string
  claimantEmail: string
  claimantAddress: string
  insuranceCompany: string
  adjuster: string
  adjusterPhone: string
  adjusterEmail: string
  vin: string
  year: number
  make: string
  model: string
  mileage: number
  zip: string
  notes: string
}
```

- [ ] **Step 2: Create `src/lib/acv/parsers/detect.ts`**

```ts
import type { ClaimFormat } from './types'

// Detects the source format of an assignment PDF from its extracted text.
// Signature: any of "Eagle View Enterprises" OR ("Admin Data" AND
// "Appraiser Details") section markers -> eagle-view. Otherwise falls
// through to modern-appraisers (default preserves today's behaviour).
export function detectFormat(text: string): ClaimFormat {
  const hasEagleViewName = /Eagle View Enterprises/i.test(text)
  const hasAdminData = /(^|\n)\s*Admin Data\s*(\n|$)/i.test(text)
  const hasAppraiserDetails = /(^|\n)\s*Appraiser Details\s*(\n|$)/i.test(text)
  if (hasEagleViewName || (hasAdminData && hasAppraiserDetails)) {
    return 'eagle-view'
  }
  return 'modern-appraisers'
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/lib/acv/parsers/
git commit -m "feat(parsers): scaffold shared parsers module with types and format detection"
```

---

## Task 3: Extract the current parser into `parsers/modern-appraisers.ts` (behaviour-preserving)

**Files:**
- Create: `src/lib/acv/parsers/modern-appraisers.ts`

This task copies the existing parser logic from `src/lib/parse-claim-pdf.ts` (which is the one actually called by `ClaimWorkspace`) into a dedicated module. Behaviour must be identical — the diff is purely a move + shape adaptation.

- [ ] **Step 1: Create `src/lib/acv/parsers/modern-appraisers.ts`**

```ts
import type { ParsedClaim } from './types'

// Labels used as stop-words for the "Label: Value" regex.
const LABELS = [
  'File #', 'Company', 'Claim Number', 'Policy Number', 'Adjuster',
  'Adjuster Phone', 'Adjuster Email', 'Deductible Amount', 'Date of Loss',
  'Type of Loss', 'Claim For', 'Insured Name', 'Business Name',
  'First Name', 'Last Name', 'Contact Name', 'Address', 'City', 'State',
  'Zip', 'Client Email', 'Mobile Phone', 'Home Phone', 'Work Phone',
  'Location', 'Location Name', 'Location Phone', 'Year', 'Make', 'Model',
  'VIN #', 'VIN', 'License Plate', 'Color', 'Mileage', 'Appraiser',
  'Phone', 'Appraiser Zip', 'Date Created', 'Date Assigned',
  'Appt Date/Time', 'Type of Claim', 'Appointment Set', 'Assignment Type',
  'Unit Type',
]

// Section headers that also act as stop-words (no colon after them).
const SECTION_HEADERS = [
  'Insurance Information', 'Owner Information', 'Location Information',
  'Vehicle Information', 'Appraisal Information', 'Damage', 'Instructions',
]

const LABEL_STOP = LABELS
  .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const SECTION_STOP = SECTION_HEADERS
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const ALL_STOP = `(?:(?:${LABEL_STOP})\\s*:|(?:${SECTION_STOP}))`

function grab(text: string, label: string): string {
  const re = new RegExp(
    label + '\\s*:\\s*(.*?)(?=' + ALL_STOP + '|\\n|$)',
    'i'
  )
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function buildAddress(section: string): string {
  const address = grab(section, 'Address')
  const city = grab(section, 'City')
  const state = grab(section, 'State')
  const zip = grab(section, 'Zip')
  if (city && state && zip) {
    return `${address ? address + ', ' : ''}${city}, ${state} ${zip}`
  }
  return [address, city, state, zip].filter(Boolean).join(', ')
}

function grabZip(text: string, ownerSection: string): string {
  if (ownerSection) {
    const z = grab(ownerSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const locSection =
    text.match(/Location Information[\s\S]*?(?=Vehicle Information|Appraisal Information|$)/i)?.[0]
  if (locSection) {
    const z = grab(locSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const z = grab(text, 'Zip')
  if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  return ''
}

// Parses text extracted from a Modern Appraisers assignment PDF. Preserves
// the existing behaviour of parseClaimText in src/lib/parse-claim-pdf.ts —
// this is the extract of that function, unchanged except for the two new
// (empty) fields required by ParsedClaim: claimant* and notes, plus the
// `format` discriminator. `na()` (fill empty with 'N/A') behaviour retained.
export function parseModernAppraisers(text: string): ParsedClaim {
  const ownerSection =
    text.match(/Owner Information[\s\S]*?(?=Location Information|Vehicle Information|$)/i)?.[0] || ''
  const vehicleSection =
    text.match(/Vehicle Information[\s\S]*?(?=Appraisal Information|Damage|$)/i)?.[0] || ''
  const insuranceSection =
    text.match(/Insurance Information[\s\S]*?(?=Owner Information|$)/i)?.[0] || text
  const appraisalSection =
    text.match(/Appraisal Information[\s\S]*?(?=Damage|Vehicle Information|$)/i)?.[0] || ''

  const maNumber = grab(text, 'File #')

  let insuranceCompany = ''
  const companyMatch = insuranceSection.match(/Company\s+(.+?)(?=Claim Number|Policy Number|\n)/i)
  if (companyMatch) insuranceCompany = companyMatch[1].trim()

  const claimNumber = grab(insuranceSection, 'Claim Number')
  const adjuster = grab(insuranceSection, 'Adjuster(?! Phone| Email| Zip)')
  const adjusterPhone = grab(insuranceSection, 'Adjuster Phone')

  const dolRaw = grab(text, 'Date of Loss')
  let dateOfLoss = ''
  if (dolRaw) {
    const d = new Date(dolRaw)
    if (!isNaN(d.getTime())) {
      dateOfLoss = d.toISOString().split('T')[0]
    }
  }

  const dcRaw =
    grab(appraisalSection || text, 'Date Created') ||
    grab(appraisalSection || text, 'Date Assigned')
  let dateReceived = ''
  if (dcRaw) {
    const cleaned = dcRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?.*$/i, '').trim()
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) {
      dateReceived = d.toISOString().split('T')[0]
    }
  }

  const claimForRaw = grab(text, 'Claim For')
  const clientType: 'Insured' | 'Claimant' =
    claimForRaw.toLowerCase().includes('claimant') ? 'Claimant' : 'Insured'

  let insuredName = grab(text, 'Insured Name')
  insuredName = insuredName.replace(/\s*(Owner Information|Location Information|Vehicle Information).*$/i, '').trim()

  let clientName = grab(ownerSection || text, 'Business Name')
  clientName = clientName
    .replace(/\s*(First Name|Last Name|Contact).*$/i, '')
    .replace(/\b(ACV|DV)\b/gi, '')
    .trim()

  const firstName = grab(ownerSection || text, 'First Name')
  const lastName = grab(ownerSection || text, 'Last Name')

  const ownerAddress = buildAddress(ownerSection || text)
  const ownerPhone =
    grab(ownerSection || text, 'Mobile Phone') ||
    grab(ownerSection || text, 'Home Phone') ||
    grab(ownerSection || text, 'Work Phone')
  const ownerEmail = grab(ownerSection || text, 'Client Email')

  const year = parseInt(grab(vehicleSection || text, 'Year')) || 0
  const make = grab(vehicleSection || text, 'Make')
  const model = grab(vehicleSection || text, 'Model')
  const vin = grab(vehicleSection || text, 'VIN #') || grab(vehicleSection || text, 'VIN')
  const mileage = parseInt(grab(vehicleSection || text, 'Mileage').replace(/,/g, '')) || 0

  const zip = grabZip(text, ownerSection)

  const na = (val: string) => val || 'N/A'

  return {
    format: 'modern-appraisers',
    maNumber: na(maNumber),
    claimNumber: na(claimNumber),
    dateOfLoss,
    dateReceived,
    clientType,
    clientName: na(clientName),
    insuredName: na(insuredName || `${firstName} ${lastName}`.trim()),
    ownerPhone: na(ownerPhone),
    ownerEmail: na(ownerEmail),
    ownerAddress: na(ownerAddress),
    claimantName: '',
    claimantPhone: '',
    claimantEmail: '',
    claimantAddress: '',
    insuranceCompany: na(insuranceCompany),
    adjuster: na(adjuster),
    adjusterPhone: na(adjusterPhone),
    adjusterEmail: 'N/A',
    vin: na(vin),
    year,
    make: na(make),
    model: na(model),
    mileage,
    zip: na(zip),
    notes: '',
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/acv/parsers/modern-appraisers.ts
git commit -m "feat(parsers): extract Modern Appraisers parser to dedicated module (no behavior change)"
```

---

## Task 4: Dispatch stub in `parsers/index.ts`

**Files:**
- Create: `src/lib/acv/parsers/index.ts`

- [ ] **Step 1: Create dispatch entry with a placeholder for Eagle View**

```ts
import { detectFormat } from './detect'
import { parseModernAppraisers } from './modern-appraisers'
import type { ParsedClaim } from './types'

// Entry point every caller uses. Detects the source format and dispatches
// to the correct parser. The eagle-view parser is added in a later task —
// until then a detected eagle-view PDF falls through to modern-appraisers
// (which won't extract much, but won't crash).
export function parseClaim(text: string): ParsedClaim {
  const format = detectFormat(text)
  switch (format) {
    case 'eagle-view':
      // TODO(task 7): return parseEagleView(text)
      return parseModernAppraisers(text)
    case 'modern-appraisers':
    default:
      return parseModernAppraisers(text)
  }
}

export type { ParsedClaim } from './types'
export { detectFormat } from './detect'
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/acv/parsers/index.ts
git commit -m "feat(parsers): add dispatch entry (eagle-view placeholder falls through to modern-appraisers)"
```

---

## Task 5: Rewire client entry `src/lib/parse-claim-pdf.ts` to use the dispatch

**Files:**
- Modify: `src/lib/parse-claim-pdf.ts` (trim to text-extract + dispatch)

- [ ] **Step 1: Replace file contents**

Replace the entire file with:

```ts
import { parseClaim, type ParsedClaim } from '@/lib/acv/parsers'

async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamic import to avoid SSR issues (pdfjs-dist needs DOMMatrix/canvas).
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const parts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      parts.push(item.str)
      if ('hasEOL' in item && item.hasEOL) parts.push('\n')
    }
  }

  return parts.join('')
}

async function ocrPDF(file: File): Promise<string> {
  const Tesseract = await import('tesseract.js')
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const parts: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport } as any).promise
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    )
    const buffer = Buffer.from(await blob.arrayBuffer())
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {},
    })
    parts.push(text)
  }

  return parts.join('\n')
}

export type { ParsedClaim } from '@/lib/acv/parsers'

export async function parseClaimPDF(file: File): Promise<ParsedClaim> {
  let text = await extractTextFromPDF(file)
  if (!text || text.trim().length < 20) {
    text = await ocrPDF(file)
  }
  if (!text || text.trim().length < 20) {
    throw new Error('Could not extract text from PDF.')
  }
  return parseClaim(text)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (import surface preserved — `parseClaimPDF` still exported with same signature, `ParsedClaim` re-exported).

- [ ] **Step 3: Full build to confirm client wiring holds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/lib/parse-claim-pdf.ts
git commit -m "refactor(parse-claim-pdf): route through shared parsers dispatch"
```

---

## Task 6: Rewire server entry `/api/acv/parse-claim/route.ts` to use the dispatch

**Files:**
- Modify: `src/app/api/acv/parse-claim/route.ts` (trim to text-extract + dispatch)

- [ ] **Step 1: Replace file contents**

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromPDF } from '@/lib/pdf-extractor'
import { requireAuth } from '@/lib/auth/require-admin'
import { parseClaim } from '@/lib/acv/parsers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractTextFromPDF(buffer)

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. The file may be image-based.' },
        { status: 422 }
      )
    }

    return NextResponse.json(parseClaim(text))
  } catch (err) {
    console.error('parse-claim error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse claim PDF' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit`
Then: `npm run build`
Expected: both PASS.

- [ ] **Step 3: Commit**

```
git add src/app/api/acv/parse-claim/route.ts
git commit -m "refactor(api/parse-claim): route through shared parsers dispatch"
```

---

## Task 7: Implement `parsers/eagle-view.ts` and wire into dispatch

**Files:**
- Create: `src/lib/acv/parsers/eagle-view.ts`
- Modify: `src/lib/acv/parsers/index.ts`

Extraction strategy notes (from working with the raw text extracted by pdfjs on both samples):

- The section-header labels (`Appraiser Details`, `Admin Data`, `Vehicle`, `Vehicle Location`, `Claimant`, `Insured`, `Owner`, `Notes`) are emitted at the top of each page as bare lines, not inline with their content. **Don't try to use them as section boundaries.**
- Field values follow their labels inline, separated by whitespace: e.g. `Claim # 4A2608CJ01D0002 Policy Number` — the value stops at the next known label token.
- The four party blocks (Vehicle Location → Claimant → Insured → Owner, in that fixed order) each begin with a `Company Name ... Contact Name ...` line. Split them by finding every `Company Name` occurrence AFTER the Vehicle section content ends.
- The Notes body is any free-form text that isn't a known label — either use everything after the last party block's `Phone Numbers` line, or take everything after the `Notes\n` marker and strip label-lines that leaked past the header due to layout quirks.

- [ ] **Step 1: Create `src/lib/acv/parsers/eagle-view.ts`**

```ts
import type { ParsedClaim } from './types'

// Labels used as stop-words in inline "Label Value NextLabel..." patterns.
// Order matters only for LABEL_STOP construction (longest-first minimises
// premature stops, but the labels here don't overlap by prefix).
const ADMIN_LABELS = [
  'Claim #', 'Policy Number', 'Created By', 'Client', 'File Number',
  'ClientPhone', 'Assignment Type', 'Date of Loss', 'Loss Category',
  'Loss Code', 'Party', 'Deductible',
]
const VEHICLE_LABELS = [
  'Vehicle Year', 'Vehicle Damage Severity', 'Vehicle Make', 'Plate#',
  'Vehicle Model', 'Mileage', 'VIN', 'Total Loss Indicator', 'Color',
  'Drivable', 'Primary Point Of Impact', 'Secondary Point Of Impact',
  'Prior Damage Description', 'Damage Description',
]
const BLOCK_LABELS = [
  'Company Name', 'Contact Name', 'First Name', 'Last Name',
  'Address', 'City, State Zip', 'Email', 'Phone Numbers',
]
const SECTION_HEADERS = [
  'Appraiser Details', 'Admin Data', 'Vehicle', 'Vehicle Location',
  'Claimant', 'Insured', 'Owner', 'Notes',
]

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Grabs the value that immediately follows `label`, stopping at any of
// `stopLabels`, a newline, or end-of-string. Value is trimmed.
function grabInline(text: string, label: string, stopLabels: string[]): string {
  const stop = stopLabels.length
    ? `(?=(?:${stopLabels.map(esc).join('|')})\\b|\\n|$)`
    : `(?=\\n|$)`
  const re = new RegExp(`${esc(label)}\\s+([\\s\\S]*?)${stop}`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

// Parses one party block (Vehicle Location / Claimant / Insured / Owner).
// Block is expected to start at (or just before) "Company Name" and end
// before the next "Company Name" occurrence.
function parseBlock(block: string): {
  first: string; last: string; address: string;
  cityStateZip: string; email: string; phone: string;
} {
  return {
    first: grabInline(block, 'First Name', ['Last Name', ...BLOCK_LABELS.filter(l => l !== 'First Name' && l !== 'Last Name')]),
    last: grabInline(block, 'Last Name', BLOCK_LABELS.filter(l => l !== 'Last Name')),
    address: grabInline(block, 'Address', ['City, State Zip', ...BLOCK_LABELS.filter(l => l !== 'Address' && l !== 'City, State Zip')]),
    cityStateZip: grabInline(block, 'City, State Zip', BLOCK_LABELS.filter(l => l !== 'City, State Zip')),
    email: grabInline(block, 'Email', ['Phone Numbers', ...BLOCK_LABELS.filter(l => l !== 'Email' && l !== 'Phone Numbers')]),
    phone: grabInline(block, 'Phone Numbers', BLOCK_LABELS.filter(l => l !== 'Phone Numbers')),
  }
}

// Splits the text into the 4 party blocks in fixed order:
// [0] Vehicle Location, [1] Claimant, [2] Insured, [3] Owner.
// Uses "Company Name" as the block-start marker and finds all 4 occurrences.
function splitPartyBlocks(text: string): [string, string, string, string] {
  const starts: number[] = []
  const re = /Company Name/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    starts.push(m.index)
    if (starts.length === 5) break
  }
  const empty = ''
  const b0 = starts[0] !== undefined ? text.slice(starts[0], starts[1] ?? text.length) : empty
  const b1 = starts[1] !== undefined ? text.slice(starts[1], starts[2] ?? text.length) : empty
  const b2 = starts[2] !== undefined ? text.slice(starts[2], starts[3] ?? text.length) : empty
  const b3 = starts[3] !== undefined ? text.slice(starts[3], starts[4] ?? text.length) : empty
  return [b0, b1, b2, b3]
}

function joinName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, ' ')
}

function joinAddress(street: string, csz: string): string {
  if (street && csz) return `${street}, ${csz}`
  return street || csz || ''
}

function extractZip(csz: string): string {
  const m = csz.match(/\b(\d{5})(?:-\d{4})?\b/)
  return m ? m[1] : ''
}

// Parses "MM/DD/YYYY [HH:MM AM]" -> "YYYY-MM-DD". Empty if unparseable.
function parseDate(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?.*$/i, '').trim()
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

// Returns everything after the "Notes" header, stripped of any known-label
// lines that leaked past the header due to PDF layout quirks. Trimmed;
// runs of 3+ blank lines collapsed to 2.
function extractNotes(text: string): string {
  const m = text.match(/(?:^|\n)\s*Notes\s*\n([\s\S]*)$/i)
  if (!m) return ''
  const raw = m[1]
  const labelLine = new RegExp(
    `^\\s*(?:${BLOCK_LABELS.map(esc).join('|')})(?:\\s+(?:${BLOCK_LABELS.map(esc).join('|')}))*\\s*$`
  )
  const kept = raw
    .split('\n')
    .filter((line) => !labelLine.test(line) && !SECTION_HEADERS.includes(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return kept
}

// Parses text extracted from an Eagle View Enterprises assignment PDF.
// Field-mapping table: see docs/superpowers/specs/2026-08-29-eagle-view-*.md.
export function parseEagleView(text: string): ParsedClaim {
  // Admin Data — every value inline, stop at the next admin label.
  const claimNumber = grabInline(text, 'Claim #', ADMIN_LABELS.filter(l => l !== 'Claim #'))
  const insuranceCompany = grabInline(text, 'Client', ADMIN_LABELS.filter(l => l !== 'Client'))
  const partyRaw = grabInline(text, 'Party', ADMIN_LABELS.filter(l => l !== 'Party'))
  const clientType: 'Insured' | 'Claimant' =
    partyRaw.toLowerCase().includes('claimant') ? 'Claimant' : 'Insured'
  const dateOfLoss = parseDate(grabInline(text, 'Date of Loss', ADMIN_LABELS.filter(l => l !== 'Date of Loss')))

  // Vehicle
  const year = parseInt(grabInline(text, 'Vehicle Year', VEHICLE_LABELS.filter(l => l !== 'Vehicle Year')), 10) || 0
  const make = grabInline(text, 'Vehicle Make', VEHICLE_LABELS.filter(l => l !== 'Vehicle Make'))
  const model = grabInline(text, 'Vehicle Model', VEHICLE_LABELS.filter(l => l !== 'Vehicle Model'))
  const vin = grabInline(text, 'VIN', VEHICLE_LABELS.filter(l => l !== 'VIN'))
  const mileageRaw = grabInline(text, 'Mileage', VEHICLE_LABELS.filter(l => l !== 'Mileage'))
  const mileage = parseInt(mileageRaw.replace(/,/g, ''), 10) || 0

  // 4 party blocks in fixed order: [VehicleLocation, Claimant, Insured, Owner]
  const [, claimantBlock, insuredBlock, ] = splitPartyBlocks(text)
  const insured = parseBlock(insuredBlock)
  const claimant = parseBlock(claimantBlock)

  const insuredName = joinName(insured.first, insured.last)
  const claimantName = joinName(claimant.first, claimant.last)

  const zip = extractZip(insured.cityStateZip) || extractZip(claimant.cityStateZip)

  const notes = extractNotes(text)

  return {
    format: 'eagle-view',
    maNumber: '',
    claimNumber,
    dateOfLoss,
    dateReceived: '',
    clientType,
    clientName: '',
    insuredName,
    ownerPhone: insured.phone,
    ownerEmail: insured.email,
    ownerAddress: joinAddress(insured.address, insured.cityStateZip),
    claimantName,
    claimantPhone: claimant.phone,
    claimantEmail: claimant.email,
    claimantAddress: joinAddress(claimant.address, claimant.cityStateZip),
    insuranceCompany,
    adjuster: '',
    adjusterPhone: '',
    adjusterEmail: '',
    vin,
    year,
    make,
    model,
    mileage,
    zip,
    notes,
  }
}
```

- [ ] **Step 2: Wire into dispatch** — `src/lib/acv/parsers/index.ts`

Replace the file:

```ts
import { detectFormat } from './detect'
import { parseModernAppraisers } from './modern-appraisers'
import { parseEagleView } from './eagle-view'
import type { ParsedClaim } from './types'

// Entry point every caller uses. Detects the source format and dispatches
// to the correct parser.
export function parseClaim(text: string): ParsedClaim {
  const format = detectFormat(text)
  switch (format) {
    case 'eagle-view':
      return parseEagleView(text)
    case 'modern-appraisers':
    default:
      return parseModernAppraisers(text)
  }
}

export type { ParsedClaim } from './types'
export { detectFormat } from './detect'
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit`
Then: `npm run build`
Expected: both PASS.

- [ ] **Step 4: Commit**

```
git add src/lib/acv/parsers/eagle-view.ts src/lib/acv/parsers/index.ts
git commit -m "feat(parsers): add Eagle View Enterprises assignment PDF parser"
```

---

## Task 8: Add `/api/claims/[id]/auto-message` — service-role message insert

**Files:**
- Create: `src/app/api/claims/[id]/auto-message/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireClaimAccess } from '@/lib/auth/require-claim-access'

export const runtime = 'nodejs'

const MAX_BODY_LEN = 4000

// POST /api/claims/[id]/auto-message
// Body: { body: string, senderName: string }
// Inserts an informational auto-message on the claim's thread:
// sender_id=null, recipient_ids=[] (no unread badge for anyone),
// is_auto_request=true (renders with the amber "Auto" badge).
// Requires SUPABASE_SERVICE_ROLE_KEY at runtime.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params
  const { errorResponse } = await requireClaimAccess(claimId)
  if (errorResponse) return errorResponse

  const body = await request.json().catch(() => null) as {
    body?: unknown; senderName?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > MAX_BODY_LEN) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_BODY_LEN} characters)` }, { status: 400 })
  }
  const senderName = typeof body.senderName === 'string' && body.senderName.trim()
    ? body.senderName.trim()
    : 'Modern Tools (Auto)'

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    console.error('auto-message: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  const id = crypto.randomUUID()
  const { error } = await service.from('messages').insert({
    id,
    claim_id: claimId,
    sender_id: null,
    sender_name: senderName,
    recipient_ids: [],
    recipient_names: [],
    body: text,
    is_auto_request: true,
  })
  if (error) {
    console.error('auto-message insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id })
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit`
Then: `npm run build`
Expected: both PASS.

- [ ] **Step 3: Commit**

```
git add src/app/api/claims/[id]/auto-message/route.ts
git commit -m "feat(api): add auto-message endpoint for parser-driven informational thread posts"
```

---

## Task 9: Wire ClaimWorkspace — Claimant Contact UI + auto-message trigger on save

**Files:**
- Modify: `src/components/claim/ClaimWorkspace.tsx`

- [ ] **Step 1: Extend the PDF-upload handler to capture the parsed claimant fields + notes**

Locate the PDF-upload handler (around lines 327-345, in `ClaimInfoForm`). Currently it merges parsed fields into `claim`. Update it to also merge claimant fields and stash notes:

Find the block starting `const data = await parseClaimPDF(file)`:

```ts
      const data = await parseClaimPDF(file)
      onChange({
        ...claim,
        maNumber: data.maNumber || claim.maNumber,
```

Replace the entire `onChange({...})` call with:

```ts
      const data = await parseClaimPDF(file)
      onChange({
        ...claim,
        maNumber: data.maNumber || claim.maNumber,
        claimNumber: data.claimNumber || claim.claimNumber,
        dateOfLoss: data.dateOfLoss || claim.dateOfLoss,
        dateReceived: data.dateReceived || claim.dateReceived,
        clientType: data.clientType,
        clientName: data.clientName || claim.clientName,
        insuredName: data.insuredName || claim.insuredName,
        ownerPhone: data.ownerPhone || claim.ownerPhone,
        ownerEmail: data.ownerEmail || claim.ownerEmail,
        ownerAddress: data.ownerAddress || claim.ownerAddress,
        claimantName: data.claimantName || claim.claimantName,
        claimantPhone: data.claimantPhone || claim.claimantPhone,
        claimantEmail: data.claimantEmail || claim.claimantEmail,
        claimantAddress: data.claimantAddress || claim.claimantAddress,
        insuranceCompany: data.insuranceCompany || claim.insuranceCompany,
        adjuster: data.adjuster || claim.adjuster,
        adjusterPhone: data.adjusterPhone || claim.adjusterPhone,
        adjusterEmail: data.adjusterEmail || claim.adjusterEmail,
        vin: data.vin || claim.vin,
        year: data.year || claim.year,
        make: data.make || claim.make,
        model: data.model || claim.model,
        mileage: data.mileage || claim.mileage,
        zip: data.zip || claim.zip,
      })
      // Stash the notes (Eagle View format only) so the parent workspace can
      // fire the auto-message once the claim has an id (i.e. after first save).
      onParsedNotes?.(data.notes || '')
```

Note the last line — `onParsedNotes` is a new optional prop to be added to `ClaimInfoForm` in Step 2.

- [ ] **Step 2: Add the `onParsedNotes` prop to `ClaimInfoForm`**

Update the component's prop-types (around lines 295-306). Add `onParsedNotes?: (notes: string) => void` to the props object; add it to the destructured parameter list at the top of the function.

For example, if the current signature is:

```ts
function ClaimInfoForm({
  claim,
  onChange,
  insuranceCompanyOptions,
  ...
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  insuranceCompanyOptions: string[]
  ...
}) {
```

Change to:

```ts
function ClaimInfoForm({
  claim,
  onChange,
  insuranceCompanyOptions,
  onParsedNotes,
  ...
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  insuranceCompanyOptions: string[]
  onParsedNotes?: (notes: string) => void
  ...
}) {
```

- [ ] **Step 3: Add the Claimant Contact form section**

Locate the existing Owner block (approximately lines 508-518 — inputs for Owner Phone, Owner Email, Owner Address). Add a new subsection immediately after that closing wrapper, before the next section (Insurance, etc.). Use the same `labelCls` / `inputCls` styling.

```tsx
          <div className="col-span-full mt-4 mb-1 text-sm font-semibold text-gray-700">Claimant Contact</div>
          <div>
            <label className={labelCls}>Claimant Name</label>
            <input
              className={inputCls}
              placeholder="Full name"
              value={claim.claimantName ?? ''}
              onChange={(e) => set('claimantName', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Claimant Address</label>
            <input
              className={inputCls}
              placeholder="123 Main St, City, ST 00000"
              value={claim.claimantAddress ?? ''}
              onChange={(e) => set('claimantAddress', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Claimant Phone</label>
            <input
              className={inputCls}
              placeholder="(555) 000-0000"
              value={claim.claimantPhone ?? ''}
              onChange={(e) => set('claimantPhone', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Claimant Email</label>
            <input
              className={inputCls}
              placeholder="claimant@email.com"
              value={claim.claimantEmail ?? ''}
              onChange={(e) => set('claimantEmail', e.target.value)}
            />
          </div>
```

The `set` helper (defined at line ~322 as `const set = (field: keyof ClaimInfo, value: string | number) => onChange({ ...claim, [field]: value })`) already handles arbitrary `keyof ClaimInfo` — no changes required there.

- [ ] **Step 4: Add `pendingAutoNoteRef` + auto-message trigger in the parent workspace**

In `ClaimWorkspace` (the parent that owns state and mounts `<ClaimInfoForm>`), add near the other refs (search for `useRef` usage at the top of the component):

```ts
  const pendingAutoNoteRef = useRef<string>('')
```

Where the parent renders `<ClaimInfoForm ... />`, pass the new callback:

```tsx
  <ClaimInfoForm
    // ...existing props
    onParsedNotes={(notes) => { pendingAutoNoteRef.current = notes }}
  />
```

Then locate the save/promote logic — the flow where `/claims/new` state gets its first claim id (search for `editingIdRef.current = ` or the code path that inserts a new `acv_history` row and captures the returned id). Immediately after the id is set/known, add:

```ts
  // Fire-and-forget auto-message for parser-captured Notes (Eagle View
  // format only — modern-appraisers parser returns empty notes).
  if (pendingAutoNoteRef.current) {
    const noteBody = pendingAutoNoteRef.current
    pendingAutoNoteRef.current = ''
    fetch(`/api/claims/${encodeURIComponent(newId)}/auto-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: noteBody, senderName: 'Modern Tools (Auto)' }),
    }).catch((e) => console.warn('auto-message post failed:', e))
  }
```

Replace `newId` with whatever local variable holds the freshly-assigned claim id. If the parent's save flow doesn't currently expose that variable clearly, the implementer should trace the save path (search for `editingIdRef.current`, `router.push(\`/claims/`, `saveToHistory`, or the transition from `/claims/new` to `/claims/[id]`) and insert the fetch at the point the id becomes known.

- [ ] **Step 5: Verify `useRef` import is present**

Search near the top of `ClaimWorkspace.tsx` for `import { ... } from 'react'`. If `useRef` isn't already imported (it likely is — the file uses refs elsewhere), add it.

- [ ] **Step 6: Type-check + build**

Run: `npx tsc --noEmit`
Then: `npm run build`
Expected: both PASS.

- [ ] **Step 7: Commit**

```
git add src/components/claim/ClaimWorkspace.tsx
git commit -m "feat(claim-workspace): add Claimant Contact form + auto-message on parsed Notes"
```

---

## Task 10: Guard `messages-tab.tsx` render against empty recipient list

**Files:**
- Read: `src/components/claim/messages-tab.tsx`
- Modify: same (only if the empty-recipient render leaks "undefined" or crashes)

- [ ] **Step 1: Read the messages-tab render logic**

Open `src/components/claim/messages-tab.tsx` and locate where each message's `recipientNames` is displayed. Look for a `To:` label or `m.recipientNames.join(', ')` usage.

- [ ] **Step 2: If needed, guard against empty `recipientNames`**

If the code renders `To: {m.recipientNames.join(', ')}` unconditionally and would produce `To: ` for our empty-recipient auto-messages, wrap the recipient render in a guard:

```tsx
{m.recipientNames.length > 0 && (
  <span className="…">To: {m.recipientNames.join(', ')}</span>
)}
```

If the existing code already guards on `recipientNames.length` or the visual is acceptable with an empty `To: ` line, leave it alone.

- [ ] **Step 3: Type-check + build (if changed)**

Run: `npx tsc --noEmit` then `npm run build` if you edited the file. Skip if no edits were needed.

- [ ] **Step 4: Commit (if changed)**

```
git add src/components/claim/messages-tab.tsx
git commit -m "fix(messages-tab): guard empty recipient list from auto-messages"
```

Skip commit if no edit was needed.

---

## Task 11: Manual verification against both sample PDFs and one Modern Appraisers regression sample

**Files:** none (verification only)

- [ ] **Step 1: Boot the dev server**

Run: `npm run dev`
Wait for `Local: http://localhost:3000` to appear.

- [ ] **Step 2: Verify existing Modern Appraisers format still parses (regression)**

Log in. Go to `/claims/new`. Upload any existing Modern Appraisers assignment PDF (find one attached to any recent claim's Documents tab, or ask Henry for one). Confirm every field populates exactly as it did before — the parser was extracted verbatim; anything different is a regression.

- [ ] **Step 3: Verify Eagle View Sample 1 (Sedgwick, Party=Claimant)**

Reload `/claims/new`. Upload `C:\Users\Owner\Desktop\4A2608CJ01D0002 Assignments.pdf`. Expected populated fields:

| Field | Expected |
|---|---|
| MA Number | (blank — fill manually) |
| Claim Number | `4A2608CJ01D0002` |
| Insurance Company | `Sedgwick Claims Management Servic` |
| Client Type dropdown | `Claimant` |
| Date of Loss | `2026-06-02` |
| Year / Make / Model | `2026` / `Chevrolet` / `Suburban` |
| VIN | `1GNS6EKD7TR271794` |
| Insured Name / Owner Phone/Email/Address | all empty |
| Claimant Name | `Ashley Rodriguez` |
| Claimant Address | `367 Roseville Avenue, Newark, NJ 07107` |
| Claimant Phone / Email | empty (PDF has none) |
| Zip | `07107` |

- [ ] **Step 4: Verify Eagle View Sample 2 (USAA, Party=Insured)**

Reload `/claims/new`. Upload `C:\Users\Owner\Desktop\003197519000000819001 Assignment.pdf`. Expected populated fields:

| Field | Expected |
|---|---|
| MA Number | (blank) |
| Claim Number | `003197519000000819001` |
| Insurance Company | `USAA Sedgwick CAT` |
| Client Type | `Insured` |
| Date of Loss | `2026-08-16` |
| Year / Make / Model | `2025` / `Ford` / `Maverick` |
| VIN | `3FTTW8BA5SRA26130` |
| Insured Name | `LT Peter Paris` |
| Owner Address | `9735 N ATOSSA RD, Kingman, AZ 86401` |
| Owner Phone | `(765)413-6602` |
| Owner Email | `dparis@orbitelcom.com` |
| Zip | `86401` |
| Claimant Name/Address/Phone/Email | empty |

- [ ] **Step 5: Verify the auto-message post on first save (Sample 2)**

With Sample 2's parsed data on `/claims/new`, fill in any required missing fields (MA Number, etc.) enough to save. Click Create Claim. Once the page transitions to `/claims/[id]`, click the Messages tab. Verify:
- Exactly one auto-message present, with amber "Auto" badge
- Sender label: `Modern Tools (Auto)`
- Body includes the "Instructions to Estimator..." block and "Hail damage to car body and cracked front windshield"
- No `To: undefined` or crash

- [ ] **Step 6: Verify auto-message on Sample 1 (short body)**

Repeat with Sample 1's flow. Verify the message body is `Please see received subrogation demand. Thank you` and the message posts successfully.

- [ ] **Step 7: If any field is wrong, iterate on `eagle-view.ts`**

For any incorrect extraction, fix the regex/logic in `src/lib/acv/parsers/eagle-view.ts`, re-run `npx tsc --noEmit` + `npm run build`, and re-upload. Commit each fix separately with a short message like `fix(parsers/eagle-view): correct VIN extraction stop-labels`.

---

## Task 12: Deploy + verify + log session

**Files:** none for deploy; SESSIONS.md for log

- [ ] **Step 1: Capture the currently-live deploy for rollback**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Expected: prints the currently-aliased deploy id + URL. Record both.

- [ ] **Step 2: Deploy to prod**

Run: `npx vercel --prod --scope henry-as-projects-88caed67 --yes`
Wait for `● Ready`.

- [ ] **Step 3: Verify the alias flipped**

Run: `npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67`
Expected: alias now points to the new deploy id from Step 2.

- [ ] **Step 4: Smoke-test in production**

Open `https://modern-tools-rho.vercel.app`, log in, upload one of the Eagle View sample PDFs on `/claims/new`. Confirm the parser fires and the fields populate. Confirm the auto-message posts on first save.

- [ ] **Step 5: Prepend a new SESSIONS.md entry**

Prepend an entry at the top of `docs/SESSIONS.md` following the shape defined at the top of that file. Include: what was worked on (Eagle View parser + Claimant block + auto-message), files changed (list from the tasks above), the deploy status (new deploy id + verified alias + rollback URL captured in Step 1), and the punch list for the next session (the carry-over items still on the last log's Next section that weren't touched).

- [ ] **Step 6: Commit the session log**

```
git add docs/SESSIONS.md docs/superpowers/specs/2026-08-29-eagle-view-assignment-parser-design.md docs/superpowers/plans/2026-08-29-eagle-view-assignment-parser.md
git commit -m "SESSIONS: Log 2026-08-29 session (Eagle View assignment parser + Claimant block + auto-message)"
```
