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

Your job: flag ONLY line items where IA over-billed against the rulebook, i.e. cases where the correction would reduce IA's total. Only flag items backed by explicit rulebook text. DO NOT flag judgment calls (Replace-vs-Repair opinions, part-quality disputes) that aren't rulebook-defined.

### The four categories

1. not_included — the IA billed separately for an operation the rulebook says is Included in a base R&R/refinish time. Suggested action MUST be "remove" and suggested.total MUST be 0. Impact MUST equal -iaBilled.total.
2. overlap — the IA billed adjacent operations without applying the rulebook's overlap deduction. Suggested is the reduced amount after the deduction.
3. excess_labor — the IA's labor hours materially exceed the published guide time (>20% or >0.5 hrs, whichever is larger). Suggested is the guide time × labor rate.
4. duplicate — same operation billed under two names, or a part billed when it's part of an already-billed assembly. Suggested action is "remove" for the redundant line.

### ⚠️ CRITICAL RULES (violating any of these produces a broken review)

1. **Every flag must have non-zero impact.** If your suggested correction produces the same total as iaBilled (impact would be $0), DO NOT include that line as a flag. That means IA billed it correctly per the rulebook — say nothing.
2. **If category is "not_included": action MUST be "remove", suggested.total MUST be 0, impact MUST be -iaBilled.total.** No exceptions.
3. **If action is "remove": suggested.total MUST be 0 and impact MUST be -iaBilled.total.**
4. **Verify each flag before including it:** does my suggested truly reduce IA's total? If no, drop the flag.
5. **The rulebook says "does not include X" or "X is billed separately" or "special notation" — those describe VALID separately-billable items.** DO NOT flag those. Only flag items where the rulebook explicitly says "included" and IA billed anyway.
6. **When in doubt, do NOT flag.** Under-flagging is much better than false-flagging — every wrong flag undermines the credibility of the entire review.

### Citations & evidence

For each flag, cite the rulebook section (e.g. "P-Pages Ch. 11-18" or "G2 Guide") and quote the relevant text verbatim in ruleQuote. The ruleQuote must clearly support that IA over-billed — if you find yourself writing quotes like "the estimate marks this correctly", that's your cue that this is NOT a flag.

If reference photos or documents are provided, use them as evidence — e.g. photos showing only cosmetic damage may support flagging a Replace as excessive. Reference the photo in ruleQuote if you use one.

### Parse metadata

Also parse the estimate's grand total (the "TOTAL COST" or "GRAND TOTAL" line, whichever is the final billed amount) into grandTotalBilled, and the detected software (CCC ONE, Mitchell, Audatex, Web-Est, Estimating Edge, or "Unknown") into software.

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
      "impact": -135.00
    }
  ]
}

### Additional notes
- impact is always negative (represents a proposed reduction).
- If nothing is flag-worthy, return {"grandTotalBilled": N, "software": "...", "flags": []}.
- Order flags by descending |impact|.
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
