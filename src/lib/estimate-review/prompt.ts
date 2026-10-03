// Prompt builders + JSON parser for /api/acv/review-estimate.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §5.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  EstimateLaborRate,
  EstimatePartLine,
  EstimateReview,
  Flag,
  FlagSeverity,
  InvoiceLineItem,
  LaborRateAssertion,
  LaborRateFinding,
  ManualEntry,
  PartsFinding,
  TaxComponentBreakdown,
  TaxFinding,
} from './types'
import type { StateTaxRule } from '../supabase/state-tax-rules'
import { TAX_RULE_LABELS, isTaxableUnderRule, type TaxableCategory } from '../supabase/state-tax-rules'

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

Your job has two parts:
(a) flag every line where IA over-billed against the rulebook, and
(b) list every manual entry (line item typed in by the appraiser rather than pulled from the CCC/Mitchell database) so the reviewer can eyeball each one.

Only flag items backed by explicit rulebook text OR clear over-pricing on manual entries. DO NOT flag pure judgment calls (Replace-vs-Repair opinions, part-quality disputes) that aren't rulebook-defined.

### Be thorough — under-flagging is a failure

A large estimate ($20K+) typically has 10–20+ flag-worthy line items. A $40K+ estimate typically has 20+. If you return only 4-5 flags on a large estimate, you are almost certainly missing real over-writes. Examine every line — the appraiser is trying to inflate the total, and you are the second-opinion reviewer whose job is to catch it. Better to flag borderline items with severity "low" than to skip them silently. Coverage is more important than clean-sweep perfectionism.

### The five categories

1. **not_included** — the IA billed separately for an operation the rulebook says is Included in a base R&R/refinish time. action MUST be "remove", suggested.total MUST be 0, impact MUST be -iaBilled.total.
2. **overlap** — the IA billed adjacent operations without applying the rulebook's overlap deduction. suggested is the reduced amount after the deduction.
3. **excess_labor** — the IA's labor hours materially exceed the published guide time (>20% or >0.5 hrs, whichever is larger). suggested is the guide time × labor rate.
4. **duplicate** — same operation billed under two names, or a part billed when it's part of an already-billed assembly. action is "remove" for the redundant line.
5. **manual_entry** — a manual entry (bypasses the CCC database) with clear over-pricing: labor time that looks excessive for the described operation, part price marked up beyond typical range, or vague/inflated line description. suggested is the corrected amount you'd expect to see for that operation.

### Manual entries — mark ALL of them, flag the clearly-inflated ones

Manual entries are line items the appraiser typed in rather than pulled from the CCC database. In most CCC ONE printouts they're marked with "MANL", "Manual Entry", a footnote symbol, or the absence of a part number / OEM number. In other software they may be flagged similarly (Mitchell often uses "M" or "Manl" indicators).

- Every manual entry you detect goes into the top-level "manualEntries" array (see schema below), with a short note about why it might warrant review ("no CCC equivalent found", "labor time appears high", "vague description", "no part number", etc.). Do this whether or not you also flag it.
- Manual entries that are clearly over-priced (labor hours excessive for described op, or part markup unusually high) ALSO go into flags[] under category "manual_entry", with a specific suggested reduction and non-zero impact. Do NOT put a manual entry in flags[] if you can't quantify a specific reduction — just put it in manualEntries.

### ⚠️ CRITICAL RULES for flags[] (violating any of these produces a broken review)

1. **Every flag must have non-zero impact.** If your suggested correction produces the same total as iaBilled (impact would be $0), DO NOT include that line as a flag. Put it in manualEntries if applicable — or say nothing.
2. **If category is "not_included": action MUST be "remove", suggested.total MUST be 0, impact MUST be -iaBilled.total.** No exceptions.
3. **If action is "remove": suggested.total MUST be 0 and impact MUST be -iaBilled.total.**
4. **The rulebook language "does not include X" or "X is billed separately" or "special notation" describes VALID separately-billable items.** DO NOT flag those. Only flag items where the rulebook explicitly says "included" and IA billed anyway.
5. **Verify each flag: does my suggested actually reduce IA's total? If no, drop the flag.**

### Citations & evidence

For rulebook-based flags (not_included, overlap, excess_labor, duplicate): cite the rulebook section (e.g. "P-Pages Ch. 11-18" or "G2 Guide") and quote the relevant text verbatim in ruleQuote.

For manual_entry flags: ruleReference is "Manual Entry — no database equivalent" (or similar); ruleQuote is a brief snippet from any adjacent rulebook guidance that applies, or the estimate's original label for the item.

### The "reason" field — plain-English explanation per flag

Every flag MUST include a "reason" string that explains, in one to three full sentences, exactly what IA did, what the rulebook says, and how the two conflict. Write it so a lay reader (an insured, an attorney, a paralegal) can understand the over-write without reading the rulebook themselves. Include specific numbers.

GOOD reason examples:
- "IA billed 3.5 hours to R&R this front bumper cover. The MOTOR P-Pages published guide time for this operation is 1.7 hours, which is 1.8 hours over-billed at the shop's $75/hr labor rate = $135 in excess labor."
- "IA billed 0.5 hours to aim the headlamps as a separate line item. The MOTOR G2 Guide states that headlamp aim is Included in the R&R headlamp operation and cannot be billed separately."
- "IA billed R&R Quarter Panel and R&R Roof as adjacent operations but did not apply the -4.0 hour overlap deduction the P-Pages require when both are performed together. The missing deduction, at $85/hr, equals $340."
- "Manual entry for 'Custom bumper reinforcement fabrication' billed at 3.5 hours plus $185 in parts. No CCC database entry supports fabrication of this kind, and the labor time is high for the described operation; the described work appears more consistent with 1.5-2.0 hours."

BAD reason examples (do not do this):
- "See rule quote" (empty; the reason IS the plain-English explanation)
- "The rulebook says this is included" (too terse — must state what IA did AND what the rule says)
- Restating the rule verbatim (redundant with ruleQuote)

If reference photos or documents are provided, use them as evidence and reference them in the reason where relevant.

### Parse metadata

Parse the estimate's grand total (the "TOTAL COST" or "GRAND TOTAL" line, whichever is the final billed amount) into grandTotalBilled, and the detected software (CCC ONE, Mitchell, Audatex, Web-Est, Estimating Edge, or "Unknown") into software.

### Extract per-component tax breakdown (top-level taxBreakdown[])

Every estimate has a totals section listing what was billed and taxed per major component (parts, body labor, refinish labor, materials, sublet, etc.). Extract EACH taxable-or-not category as a row with:
- category: normalized to one of "parts", "materials", "refinish_labor", "body_labor", "mechanical_labor", "frame_labor", "structural_labor", "other_labor", "sublet"
- label: verbatim label from the estimate
- amount: pre-tax base $ for this component
- taxAmount: sales tax $ charged on this component (0 if none, or if tax is lumped into a single grand-total tax line only)

If tax is only shown as a single grand-total (no per-component split), still emit one row per component you can see (with taxAmount = 0) — the server-side check will use the ratio taxTotal / total_taxable_base to derive an effective rate.

### Extract estimate parts (top-level estimateParts[])

For every part line on the estimate — anything that isn't pure labor, sublet, or a paint material entry — emit one row in the top-level "estimateParts" array with: partNumber (the OEM/aftermarket part number as printed, or null if none appears), description (as printed), qty (default 1), unitPrice ($/unit), and total ($ line total). Include OEM, aftermarket, LKQ/used, and reconditioned parts. Do NOT include labor lines, refinish lines, sublet lines, paint materials ("Paint Sup"/"Paint Mat"), or hazardous waste. Copy the values verbatim from the estimate — do not compute or infer.

### Extract invoice line items (top-level invoiceLineItems[])

If invoice text is provided in the user message (marked "--- Supplier invoice: <filename> ---"), extract every part line item from each invoice into the top-level "invoiceLineItems" array with: invoiceFileName (the filename shown in the "Supplier invoice:" header), partNumber, description, qty, unitPrice, total. Skip totals, tax lines, freight, and non-parts items unless clearly a physical part.

If no invoice text is provided, return an empty invoiceLineItems array.

### Extract labor rate reference (top-level referenceLaborRates[])

If any files are attached above the estimate marked "LABOR RATES REFERENCE" (either an image or a PDF titled that way), those are the CORRECT per-category labor rates for this claim — extracted from a labor-rate sheet (often Labor Rate Hero / LRH), a shop's posted rates, an agreement letter, etc. Read the rates from those files and emit them as a top-level "referenceLaborRates" array with the SAME shape as the "laborRates" array (category / label / rate — hours is not needed, use 0). Categories normalize to the same five buckets ("body", "paint", "mechanical", "frame", "structural", "other"); label is the display name as shown on the reference; rate is $/hr as a number.

**CRITICAL — when the reference sheet shows multiple columns (LOW / AVERAGE / HIGH, or 25th / 50th / 75th percentile, or similar):** always use the LOW column (or the lowest numeric value shown). Appraisers negotiate from the low end of market rates. Never pick the AVERAGE or HIGH column, even if the reference emphasizes them visually.

If NO labor-rates reference is attached, return an empty referenceLaborRates array. Do NOT infer or guess correct rates from anywhere else — the reference is the only source.

### Extract labor rates (top-level laborRates[])

Every estimate has a labor summary showing rate + total hours by category — usually near the top or bottom, sometimes labeled "Labor Rates" or "Labor Summary". Extract EVERY category that appears on the estimate, one row each, into a top-level "laborRates" array. Normalize category to one of: "body", "paint", "mechanical", "frame", "structural", "other". Preserve the estimate's own display name in "label" (e.g. "Body Labor", "Refinish Labor", "Mech.", "Frame/Structural"). Include categories even if hours = 0 (some estimates list a rate that wasn't used). If the estimate uses a category that doesn't map cleanly to the five presets, use "other" for category and a descriptive label.

Rate is $/hr as a number. Hours is total hours billed at that rate on THIS estimate. Do not compute or infer — extract what's shown.

If no labor summary is visible at all (rare — some hand-typed estimates), return an empty laborRates array. Do not fabricate.

### Return schema (JSON ONLY — no markdown, no prose)

{
  "grandTotalBilled": 0.00,
  "software": "CCC ONE",
  "laborRates": [
    { "category": "body",       "label": "Body Labor",       "rate": 75, "hours": 12.5 },
    { "category": "paint",      "label": "Paint Labor",      "rate": 80, "hours": 8.0 },
    { "category": "mechanical", "label": "Mechanical Labor", "rate": 110, "hours": 1.0 },
    { "category": "frame",      "label": "Frame Labor",      "rate": 90, "hours": 0 },
    { "category": "structural", "label": "Structural Labor", "rate": 95, "hours": 0 }
  ],
  "referenceLaborRates": [
    { "category": "body",       "label": "Body Labor",       "rate": 65 },
    { "category": "paint",      "label": "Paint Labor",      "rate": 70 },
    { "category": "mechanical", "label": "Mechanical Labor", "rate": 95 }
  ],
  "estimateParts": [
    { "partNumber": "12345-67890", "description": "Front Bumper Cover", "qty": 1, "unitPrice": 450.00, "total": 450.00 }
  ],
  "taxBreakdown": [
    { "category": "parts",          "label": "Parts",          "amount": 1200.00, "taxAmount": 75.00 },
    { "category": "body_labor",     "label": "Body Labor",     "amount": 950.00,  "taxAmount": 0.00  },
    { "category": "refinish_labor", "label": "Refinish Labor", "amount": 640.00,  "taxAmount": 40.00 },
    { "category": "materials",      "label": "Paint Materials","amount": 220.00,  "taxAmount": 13.75 },
    { "category": "sublet",         "label": "Sublet",         "amount": 150.00,  "taxAmount": 0.00  }
  ],
  "invoiceLineItems": [
    { "invoiceFileName": "keystone-invoice.pdf", "partNumber": "12345-67890", "description": "Bumper Cover Front", "qty": 1, "unitPrice": 380.00, "total": 380.00 }
  ],
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
      "reason": "IA billed 3.5 hours to R&R this front bumper cover. The MOTOR P-Pages published guide time is 1.7 hours. That's 1.8 hours over-billed at the shop's $75/hr labor rate = $135 in excess labor.",
      "impact": -135.00
    }
  ],
  "manualEntries": [
    {
      "lineDescription": "Custom bracket fabrication",
      "panelOrArea": "Frame",
      "iaBilled": { "laborHours": 2.5, "laborRate": 85, "partPrice": 45.00, "total": 257.50 },
      "note": "Manual entry — no CCC guide equivalent. Labor time and part price should be substantiated by photos or shop documentation."
    }
  ]
}

### Additional notes
- impact is always negative (represents a proposed reduction).
- If nothing is flag-worthy AND no manual entries detected, return {"grandTotalBilled": N, "software": "...", "flags": [], "manualEntries": []}.
- Order flags by descending |impact|.
- Order manualEntries by descending iaBilled.total.
- Severity: low = <$50 impact, medium = $50–$300, high = >$300.`

// System blocks: uncached instructions + cached P-Pages rulebook (5-min ephemeral cache).
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

// Build the user message: estimate text + optional attachments (photos as
// images, or PDFs as document blocks per Anthropic's native PDF support).
export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export type ReferenceAttachment =
  | { kind: 'image'; media_type: PhotoMediaType; data: string; fileName?: string }
  | { kind: 'pdf'; data: string; fileName?: string }

export interface InvoiceText {
  fileName: string
  text: string
}

// Labor-rate reference doc — an image or PDF the user tagged as
// source='labor-rates' in the claim's Documents tab. Claude extracts the
// correct per-category rates from these and emits them as
// `referenceLaborRates` in the JSON response.
export type LaborRateReference =
  | { kind: 'image'; media_type: PhotoMediaType; data: string; fileName: string }
  | { kind: 'pdf'; data: string; fileName: string }

export function buildUserMessage(
  estimateText: string,
  attachments: ReferenceAttachment[],
  fileName: string,
  invoices: InvoiceText[] = [],
  laborRateRefs: LaborRateReference[] = [],
) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: PhotoMediaType; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string | null }
  > = []

  if (attachments.length > 0) {
    content.push({
      type: 'text',
      text: `Reference materials (${attachments.length}) — vehicle photos and/or supporting documents:`,
    })
    for (const a of attachments) {
      if (a.kind === 'image') {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: a.media_type, data: a.data },
        })
      } else {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: a.data },
          title: a.fileName ?? null,
        })
      }
    }
  }

  // Labor-rate reference block (if any). Titled so the model knows these are
  // the CORRECT rates for the claim — extract per-category and use as
  // referenceLaborRates in the response.
  if (laborRateRefs.length > 0) {
    content.push({
      type: 'text',
      text: `--- LABOR RATES REFERENCE (${laborRateRefs.length} file${laborRateRefs.length === 1 ? '' : 's'}) — these show the correct per-category labor rates for this claim. Extract them and emit as top-level referenceLaborRates[] in the JSON: ---`,
    })
    for (const r of laborRateRefs) {
      if (r.kind === 'image') {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: r.media_type, data: r.data },
        })
      } else {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: r.data },
          title: `LABOR RATES REFERENCE: ${r.fileName}`,
        })
      }
    }
  }

  // Invoice text blocks come BEFORE the estimate so the model has invoice
  // context established when it later extracts line items from the estimate.
  for (const inv of invoices) {
    content.push({
      type: 'text',
      text: `--- Supplier invoice: ${inv.fileName} ---\n\n${inv.text}`,
    })
  }

  content.push({
    type: 'text',
    text: `Estimate to review (${fileName}):\n\n${estimateText}\n\n---\n\nReview this estimate against the P-Pages rulebook and return JSON only. Extract laborRates, estimateParts, (if any invoices are provided above) invoiceLineItems, and (if any LABOR RATES REFERENCE files are attached above) referenceLaborRates.`,
  })

  return content
}

// Parse the model's JSON response.
export interface ParsedReviewPayload {
  grandTotalBilled: number
  software: string
  flags: Flag[]
  manualEntries?: ManualEntry[]
  laborRates?: EstimateLaborRate[]
  referenceLaborRates?: LaborRateAssertion[]
  estimateParts?: EstimatePartLine[]
  invoiceLineItems?: InvoiceLineItem[]
  taxBreakdown?: TaxComponentBreakdown[]
}

// Extract the first balanced-brace JSON object from a raw model response.
// The model is instructed to return JSON only, but sometimes emits a preamble,
// trailing prose, or wraps the object in markdown fences. We tolerate all three
// by walking brace depth and ignoring anything outside the first complete object.
function extractFirstJsonObject(raw: string): string {
  const stripped = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  const start = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in model response')
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return stripped.slice(start, i + 1)
    }
  }
  throw new Error('Unbalanced JSON in model response')
}

// Coerce a raw flag to enforce the invariants the AI is instructed to follow.
// - not_included ⇒ action=remove, suggested.total=0
// - action=remove ⇒ suggested.total=0
// - impact recomputed from iaBilled.total − suggested.total (always ≤ 0)
// Returns null if the flag would have zero impact (drop it — IA billed correctly).
function coerceFlag(f: Flag): Flag | null {
  const iaTotal = Number(f.iaBilled?.total) || 0

  // Defensive fallback: if the model forgot the "reason" field, synthesize a
  // basic one from what we have. Better than showing an empty explanation.
  if (!f.reason || typeof f.reason !== 'string' || !f.reason.trim()) {
    f.reason = f.ruleQuote
      ? `Rulebook (${f.ruleReference}): "${f.ruleQuote}"`
      : `IA billed this line; see ${f.ruleReference} for the applicable rule.`
  }

  // not_included is always a full-remove.
  if (f.category === 'not_included' && f.suggested) {
    f.suggested.action = 'remove'
    f.suggested.total = 0
  }

  // action=remove implies suggested.total=0 (belt-and-suspenders for model slippage).
  if (f.suggested?.action === 'remove') {
    f.suggested.total = 0
  }

  const suggestedTotal = Number(f.suggested?.total) || 0
  const computedImpact = -(iaTotal - suggestedTotal)

  // If the model returned a non-zero impact but the math says zero, prefer the math.
  // If the model returned zero (or omitted it), fall back to the computed value.
  f.impact = computedImpact

  // Drop no-op flags — a $0 impact means IA billed this line correctly.
  if (Math.round(Math.abs(f.impact) * 100) === 0) return null

  return f
}

export function parseReviewResponse(raw: string): ParsedReviewPayload {
  const jsonText = extractFirstJsonObject(raw)
  const parsed = JSON.parse(jsonText) as ParsedReviewPayload
  if (!Array.isArray(parsed.flags)) throw new Error('Response missing flags array')

  // Coerce invariants + drop zero-impact flags.
  parsed.flags = parsed.flags
    .map(coerceFlag)
    .filter((f): f is Flag => f !== null)

  parsed.flags.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

  // Normalize manualEntries: sort by descending iaBilled.total, default to [].
  if (!Array.isArray(parsed.manualEntries)) parsed.manualEntries = []
  parsed.manualEntries.sort((a, b) => (b.iaBilled?.total || 0) - (a.iaBilled?.total || 0))

  // Normalize laborRates: coerce numeric fields, default to [].
  if (!Array.isArray(parsed.laborRates)) parsed.laborRates = []
  parsed.laborRates = parsed.laborRates
    .map((r) => ({
      category: typeof r.category === 'string' ? r.category : 'other',
      label: typeof r.label === 'string' && r.label ? r.label : 'Labor',
      rate: Number(r.rate) || 0,
      hours: Number(r.hours) || 0,
    }))
    .filter((r) => r.rate > 0 || r.hours > 0)

  // Normalize referenceLaborRates: same shape as an appraiser-asserted list.
  if (!Array.isArray(parsed.referenceLaborRates)) parsed.referenceLaborRates = []
  parsed.referenceLaborRates = parsed.referenceLaborRates
    .map((r) => ({
      category: typeof r.category === 'string' ? r.category : 'other',
      label: typeof r.label === 'string' && r.label ? r.label : 'Labor',
      rate: Number(r.rate) || 0,
    }))
    .filter((r) => r.rate > 0)

  // Normalize estimateParts + invoiceLineItems (Phase 2).
  if (!Array.isArray(parsed.estimateParts)) parsed.estimateParts = []
  parsed.estimateParts = parsed.estimateParts
    .map((p) => ({
      partNumber: typeof p.partNumber === 'string' && p.partNumber.trim() ? p.partNumber.trim() : null,
      description: typeof p.description === 'string' ? p.description : '',
      qty: Number(p.qty) || 1,
      unitPrice: Number(p.unitPrice) || 0,
      total: Number(p.total) || 0,
    }))
    .filter((p) => p.description || p.total > 0)

  if (!Array.isArray(parsed.invoiceLineItems)) parsed.invoiceLineItems = []
  parsed.invoiceLineItems = parsed.invoiceLineItems
    .map((p) => ({
      invoiceFileName: typeof p.invoiceFileName === 'string' ? p.invoiceFileName : 'invoice',
      partNumber: typeof p.partNumber === 'string' && p.partNumber.trim() ? p.partNumber.trim() : null,
      description: typeof p.description === 'string' ? p.description : '',
      qty: Number(p.qty) || 1,
      unitPrice: Number(p.unitPrice) || 0,
      total: Number(p.total) || 0,
    }))
    .filter((p) => p.description || p.total > 0)

  // Normalize taxBreakdown (Phase 4).
  if (!Array.isArray(parsed.taxBreakdown)) parsed.taxBreakdown = []
  parsed.taxBreakdown = parsed.taxBreakdown
    .map((t) => ({
      category: typeof t.category === 'string' ? t.category : 'other_labor',
      label: typeof t.label === 'string' && t.label ? t.label : 'Component',
      amount: Number(t.amount) || 0,
      taxAmount: Number(t.taxAmount) || 0,
    }))
    .filter((t) => t.amount > 0 || t.taxAmount > 0)

  return parsed
}

// ── Parts findings (Phase 2) ─────────────────────────────────────────────
// Match invoice line items to estimate parts (part number first, then fuzzy
// description) and produce per-part findings for price/qty mismatches plus
// orphans on either side.

function normalizePartNumber(pn: string | null | undefined): string {
  return (pn ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function tokenize(desc: string): string[] {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3) // drop noise words like "the", "&"
}

// Jaccard-similar token overlap. 0 = no shared tokens, 1 = identical sets.
// Cheap and stable; avoids pulling in an edit-distance library.
function descriptionSimilarity(a: string, b: string): number {
  const aSet = new Set(tokenize(a))
  const bSet = new Set(tokenize(b))
  if (aSet.size === 0 || bSet.size === 0) return 0
  let intersect = 0
  for (const t of aSet) if (bSet.has(t)) intersect++
  return intersect / new Set([...aSet, ...bSet]).size
}

const DESCRIPTION_MATCH_THRESHOLD = 0.5

export function computePartsFindings(
  estimateParts: EstimatePartLine[],
  invoiceLines: InvoiceLineItem[],
): PartsFinding[] {
  const findings: PartsFinding[] = []
  const usedEstimateIdx = new Set<number>()

  for (const inv of invoiceLines) {
    // 1. Try exact part-number match first (normalized).
    const invPn = normalizePartNumber(inv.partNumber)
    let match: { part: EstimatePartLine; idx: number; matchedBy: 'part_number' | 'description' } | null = null
    if (invPn) {
      const idx = estimateParts.findIndex((p, i) => !usedEstimateIdx.has(i) && normalizePartNumber(p.partNumber) === invPn)
      if (idx !== -1) match = { part: estimateParts[idx], idx, matchedBy: 'part_number' }
    }
    // 2. Fall back to fuzzy description match on any unused estimate part.
    if (!match) {
      let bestIdx = -1
      let bestSim = 0
      estimateParts.forEach((p, i) => {
        if (usedEstimateIdx.has(i)) return
        const sim = descriptionSimilarity(inv.description, p.description)
        if (sim > bestSim) { bestSim = sim; bestIdx = i }
      })
      if (bestIdx !== -1 && bestSim >= DESCRIPTION_MATCH_THRESHOLD) {
        match = { part: estimateParts[bestIdx], idx: bestIdx, matchedBy: 'description' }
      }
    }

    if (!match) {
      // Invoice line has no matching estimate part — informational orphan.
      findings.push({
        type: 'invoice_orphan',
        partNumber: inv.partNumber,
        description: inv.description,
        invoice: { fileName: inv.invoiceFileName, qty: inv.qty, unitPrice: inv.unitPrice, total: inv.total },
        priceDeltaPerUnit: 0,
        qtyDelta: 0,
        dollarImpact: 0,
        severity: 'low',
      })
      continue
    }

    usedEstimateIdx.add(match.idx)
    const est = match.part
    const priceDeltaPerUnit = est.unitPrice - inv.unitPrice
    const qtyDelta = est.qty - inv.qty
    // Dollar impact = -(estimate over-billed vs invoice), for matched-qty case
    // we compare per-unit price × min(qty). Qty differences produce their own row.
    const priceImpact = -(priceDeltaPerUnit * Math.min(inv.qty, est.qty))
    const qtyImpact = qtyDelta > 0 ? -(qtyDelta * est.unitPrice) : 0
    const dollarImpact = priceImpact + qtyImpact
    const severity: FlagSeverity =
      Math.abs(dollarImpact) < 25 ? 'low' :
      Math.abs(dollarImpact) < 150 ? 'medium' : 'high'

    if (priceDeltaPerUnit === 0 && qtyDelta === 0) continue // perfect match, no finding

    findings.push({
      type: qtyDelta !== 0 && priceDeltaPerUnit === 0 ? 'qty_mismatch' : 'price_mismatch',
      partNumber: est.partNumber ?? inv.partNumber,
      description: est.description || inv.description,
      invoice: { fileName: inv.invoiceFileName, qty: inv.qty, unitPrice: inv.unitPrice, total: inv.total },
      estimate: { qty: est.qty, unitPrice: est.unitPrice, total: est.total },
      priceDeltaPerUnit,
      qtyDelta,
      dollarImpact,
      severity,
      matchedBy: match.matchedBy,
    })
  }

  // Estimate parts that never got matched by any invoice line.
  estimateParts.forEach((est, i) => {
    if (usedEstimateIdx.has(i)) return
    findings.push({
      type: 'estimate_orphan',
      partNumber: est.partNumber,
      description: est.description,
      estimate: { qty: est.qty, unitPrice: est.unitPrice, total: est.total },
      priceDeltaPerUnit: 0,
      qtyDelta: 0,
      dollarImpact: 0,
      severity: 'low',
    })
  })

  // Sort: dollar-impact findings first (by descending impact), then orphans.
  findings.sort((a, b) => {
    const impactA = Math.abs(a.dollarImpact)
    const impactB = Math.abs(b.dollarImpact)
    if (impactA !== impactB) return impactB - impactA
    return 0
  })
  return findings
}

// ── Labor rate findings (Phase 1) ────────────────────────────────────────
// Given what the appraiser asserts (assertedRates) and what the estimate uses
// (estimateRates), produce one finding row per category the appraiser cares
// about. Only categories present in BOTH sides produce dollar-impact rows;
// asserted-but-missing categories are dropped (nothing to compare).
function severityForImpact(impact: number): FlagSeverity {
  const abs = Math.abs(impact)
  if (abs < 50) return 'low'
  if (abs < 300) return 'medium'
  return 'high'
}

export function computeRateFindings(
  assertedRates: LaborRateAssertion[],
  estimateRates: EstimateLaborRate[],
): LaborRateFinding[] {
  const findings: LaborRateFinding[] = []
  for (const asserted of assertedRates) {
    if (!asserted.rate) continue
    const match = estimateRates.find((r) => r.category === asserted.category)
    if (!match) continue
    const diffPerHour = match.rate - asserted.rate
    const dollarImpact = -(diffPerHour * match.hours) // negative = dispute reduction
    if (diffPerHour === 0) continue // no discrepancy to flag
    findings.push({
      category: asserted.category,
      label: asserted.label || match.label,
      assertedRate: asserted.rate,
      estimateRate: match.rate,
      diffPerHour,
      hoursOnEstimate: match.hours,
      dollarImpact,
      severity: severityForImpact(dollarImpact),
    })
  }
  // Order by descending |dollarImpact| so biggest disputes surface first.
  findings.sort((a, b) => Math.abs(b.dollarImpact) - Math.abs(a.dollarImpact))
  return findings
}

// ── State sales tax findings (Phase 4) ───────────────────────────────────
// Given the estimate's tax breakdown and the state's rule, flag any
// component the estimate taxed that the rule says shouldn't be taxed
// (and vice-versa). Rate is derived from the estimate itself:
// rate = (sum of tax across categories the rule DOES allow) / (sum of amounts
// across those same categories). If the derivation is unstable (no allowed
// component with tax), we fall back to any per-component tax/amount ratio.

const CATEGORY_LABELS: Record<TaxableCategory, string> = {
  parts:             'Parts',
  materials:         'Paint Materials',
  refinish_labor:    'Refinish Labor',
  body_labor:        'Body Labor',
  mechanical_labor:  'Mechanical Labor',
  frame_labor:       'Frame Labor',
  structural_labor:  'Structural Labor',
  other_labor:       'Other Labor',
  sublet:            'Sublet',
}

function normalizeCategory(raw: string): TaxableCategory {
  const c = raw.toLowerCase().trim()
  if (c in CATEGORY_LABELS) return c as TaxableCategory
  if (c === 'paint' || c === 'paint_materials') return 'materials'
  if (c === 'refinish' || c === 'paint_labor') return 'refinish_labor'
  if (c === 'body' || c === 'labor') return 'body_labor'
  if (c === 'mechanical') return 'mechanical_labor'
  if (c === 'frame') return 'frame_labor'
  if (c === 'structural') return 'structural_labor'
  return 'other_labor'
}

export function computeTaxFindings(
  breakdown: TaxComponentBreakdown[],
  stateRule: StateTaxRule | null,
  state: string,
): TaxFinding[] {
  const upperState = state.toUpperCase()
  if (!stateRule) {
    // No rule row — surface an informational finding so Henry knows the check
    // couldn't run for this claim.
    if (breakdown.length === 0) return []
    return [{
      type: 'no_state_rule',
      state: upperState,
      rule: '',
      ruleLabel: 'No rule configured for this state',
      component: '',
      taxableUnderRule: false,
      estimateAmount: 0,
      estimateTax: 0,
      expectedTax: 0,
      dollarImpact: 0,
      severity: 'low',
      reason: `No sales-tax rule loaded for ${upperState || '(unknown state)'} — the automated check couldn't run for this state.`,
    }]
  }

  // Derive an effective rate from any allowed-and-taxed component.
  let derivedRate = 0
  for (const row of breakdown) {
    const cat = normalizeCategory(row.category)
    if (row.taxAmount > 0 && row.amount > 0 && isTaxableUnderRule(cat, stateRule.rule)) {
      derivedRate = row.taxAmount / row.amount
      break
    }
  }
  if (derivedRate === 0) {
    // Fall back to any taxed line to avoid returning zero-impact findings on
    // valid over-taxations.
    for (const row of breakdown) {
      if (row.taxAmount > 0 && row.amount > 0) {
        derivedRate = row.taxAmount / row.amount
        break
      }
    }
  }

  const findings: TaxFinding[] = []
  for (const row of breakdown) {
    const cat = normalizeCategory(row.category)
    const taxableUnderRule = isTaxableUnderRule(cat, stateRule.rule)
    const chargedTax = row.taxAmount
    const expectedTax = taxableUnderRule ? row.amount * derivedRate : 0

    // Skip perfectly-fine rows: charged nothing on a non-taxable line, or
    // charged the expected amount on a taxable line.
    if (chargedTax === 0 && expectedTax === 0) continue
    if (Math.abs(chargedTax - expectedTax) < 0.5) continue

    const dollarImpact = -(chargedTax - expectedTax)
    const severity: FlagSeverity =
      Math.abs(dollarImpact) < 25 ? 'low' :
      Math.abs(dollarImpact) < 150 ? 'medium' : 'high'

    findings.push({
      type: chargedTax > expectedTax ? 'taxed_should_not_be' : 'undertaxed_should_be',
      state: upperState,
      rule: stateRule.rule,
      ruleLabel: TAX_RULE_LABELS[stateRule.rule],
      component: CATEGORY_LABELS[cat] ?? row.label ?? cat,
      taxableUnderRule,
      estimateAmount: row.amount,
      estimateTax: chargedTax,
      expectedTax,
      dollarImpact,
      severity,
      reason: taxableUnderRule
        ? `${upperState}'s rule (${TAX_RULE_LABELS[stateRule.rule]}) DOES tax ${CATEGORY_LABELS[cat]}. Estimate charged ${chargedTax.toFixed(2)}, expected ${expectedTax.toFixed(2)} at the derived ${(derivedRate * 100).toFixed(3)}% rate.`
        : `${upperState}'s rule (${TAX_RULE_LABELS[stateRule.rule]}) DOES NOT tax ${CATEGORY_LABELS[cat]}. Estimate charged ${chargedTax.toFixed(2)} sales tax on this line that shouldn't be there.`,
    })
  }
  findings.sort((a, b) => Math.abs(b.dollarImpact) - Math.abs(a.dollarImpact))
  return findings
}

// Helper for the API route: build a review object once we have all the pieces.
export function buildReview(input: {
  parsed: ParsedReviewPayload
  fileName: string
  photoCount: number
  reviewNumber: number
  assertedRates?: LaborRateAssertion[]
  invoiceFileNames?: string[]
  laborRateReferenceFileNames?: string[]
  stateRule?: StateTaxRule | null
  claimState?: string
}): EstimateReview {
  const laborRates = input.parsed.laborRates ?? []
  const assertedRates = input.assertedRates ?? []
  const rateFindings = assertedRates.length > 0
    ? computeRateFindings(assertedRates, laborRates)
    : []
  const invoiceFileNames = input.invoiceFileNames ?? []
  const laborRateReferenceFileNames = input.laborRateReferenceFileNames ?? []
  const invoiceLines = input.parsed.invoiceLineItems ?? []
  const estimateParts = input.parsed.estimateParts ?? []
  const partsFindings = invoiceLines.length > 0
    ? computePartsFindings(estimateParts, invoiceLines)
    : []

  // Phase 4: run tax check unconditionally. Wrapped so a bug here doesn't
  // break the whole review response.
  const taxBreakdown = input.parsed.taxBreakdown ?? []
  let taxFindings: TaxFinding[] = []
  try {
    taxFindings = computeTaxFindings(taxBreakdown, input.stateRule ?? null, input.claimState ?? '')
  } catch (err) {
    console.error('computeTaxFindings failed:', err)
    taxFindings = []
  }

  // Derive an effective overall tax rate (%) from the breakdown.
  // Use all taxed components; fall back to null if nothing is taxed.
  let estimateTaxRate: number | null = null
  {
    let totalBase = 0
    let totalTax = 0
    for (const row of taxBreakdown) {
      if (row.taxAmount > 0 && row.amount > 0) {
        totalBase += row.amount
        totalTax += row.taxAmount
      }
    }
    if (totalBase > 0) {
      estimateTaxRate = (totalTax / totalBase) * 100
    }
  }

  return {
    id: crypto.randomUUID(),
    reviewNumber: input.reviewNumber,
    savedAt: new Date().toISOString(),
    fileName: input.fileName,
    software: input.parsed.software || 'Unknown',
    grandTotalBilled: Number(input.parsed.grandTotalBilled) || 0,
    photoCount: input.photoCount,
    flags: input.parsed.flags,
    manualEntries: input.parsed.manualEntries ?? [],
    laborRates,
    rateFindings,
    assertedRatesSnapshot: assertedRates.length > 0 ? assertedRates : undefined,
    partsFindings,
    invoiceFileNames: invoiceFileNames.length > 0 ? invoiceFileNames : undefined,
    laborRateReferenceFileNames: laborRateReferenceFileNames.length > 0 ? laborRateReferenceFileNames : undefined,
    taxFindings,
    taxBreakdown,
    estimateTaxRate,
  }
}
