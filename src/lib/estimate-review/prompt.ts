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

// Build the user message: estimate text + optional photo image blocks.
// Photos are passed in as base64.
export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export function buildUserMessage(
  estimateText: string,
  photos: Array<{ media_type: PhotoMediaType; data: string }>,
  fileName: string,
) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: PhotoMediaType; data: string } }
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

// Parse the model's JSON response.
export interface ParsedReviewPayload {
  grandTotalBilled: number
  software: string
  flags: Flag[]
}

export function parseReviewResponse(raw: string): ParsedReviewPayload {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as ParsedReviewPayload
  if (!Array.isArray(parsed.flags)) throw new Error('Response missing flags array')
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
