// Prompt builders + JSON parser for /api/acv/review-estimate.
// See docs/superpowers/specs/2026-08-25-estimate-review-design.md §5.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EstimateReview, Flag, ManualEntry } from './types'

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

### Return schema (JSON ONLY — no markdown, no prose)

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

export function buildUserMessage(
  estimateText: string,
  attachments: ReferenceAttachment[],
  fileName: string,
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

  content.push({
    type: 'text',
    text: `Estimate to review (${fileName}):\n\n${estimateText}\n\n---\n\nReview this estimate against the P-Pages rulebook and return JSON only.`,
  })

  return content
}

// Parse the model's JSON response.
export interface ParsedReviewPayload {
  grandTotalBilled: number
  software: string
  flags: Flag[]
  manualEntries?: ManualEntry[]
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
    manualEntries: input.parsed.manualEntries ?? [],
  }
}
