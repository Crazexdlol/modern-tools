// POST /api/acv/review-estimate
// Multipart form: estimates=<file>[] (1+), photos=<file>[] (0–10),
//                 nextReviewNumber=<number> (optional, defaults to 1).
// Returns: { reviews: EstimateReview[] } — one per estimate file.
// Failed estimates come back as review entries with { error, flags: [] }.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractTextFromPDF } from '@/lib/pdf-extractor'
import { extractTextFromImage } from '@/lib/image-extractor'
import {
  buildSystemBlocks,
  buildUserMessage,
  buildReview,
  parseReviewResponse,
  type InvoiceText,
  type LaborRateReference,
  type PhotoMediaType,
  type ReferenceAttachment,
} from '@/lib/estimate-review/prompt'
import type { EstimateReview } from '@/lib/estimate-review/types'
import { requireAuth } from '@/lib/auth/require-admin'
import { rateLimit } from '@/lib/rate-limit'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchStateTaxRule, type StateTaxRule } from '@/lib/supabase/state-tax-rules'
import type { ClaimDocument } from '@/lib/supabase/documents'

export const runtime = 'nodejs'
export const maxDuration = 300 // allow long AI streams

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_CONCURRENT = 3
// Hard safety cap on photos per request. Prevents accidental drag-a-folder mistakes
// and stays inside Anthropic request-size limits. Client-side soft cap matches.
const MAX_PHOTOS = 100

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

function normalizePhotoMediaType(t: string): PhotoMediaType {
  const lower = t.toLowerCase()
  if (lower === 'image/png') return 'image/png'
  if (lower === 'image/gif') return 'image/gif'
  if (lower === 'image/webp') return 'image/webp'
  return 'image/jpeg' // safe default; Anthropic will reject truly bad bytes
}

// Encodes an uploaded reference file as either an image block or a document block.
// PDF-typed uploads use Anthropic's native document block; everything else is treated as an image.
async function encodeAttachment(file: File): Promise<ReferenceAttachment> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const data = buffer.toString('base64')
  const type = file.type.toLowerCase()
  const isPdf = type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    return { kind: 'pdf', data, fileName: file.name }
  }
  return { kind: 'image', media_type: normalizePhotoMediaType(file.type), data, fileName: file.name }
}

async function reviewOne(
  estimate: File,
  attachments: ReferenceAttachment[],
  reviewNumber: number,
  invoices: InvoiceText[],
  laborRateRefs: LaborRateReference[],
  stateRule: StateTaxRule | null,
  claimState: string,
): Promise<EstimateReview> {
  try {
    const text = await extractEstimateText(estimate)
    const stream = await client.beta.messages.stream({
      model: 'claude-sonnet-4-6',
      // Bumped from 16000 to 24000 since Phase 2 asks for estimateParts +
      // invoiceLineItems in the same response. A big estimate with multiple
      // invoices can easily hit 100+ line items across both arrays.
      max_tokens: 24000,
      betas: ['output-128k-2025-02-19'],
      system: buildSystemBlocks(),
      messages: [{ role: 'user', content: buildUserMessage(text, attachments, estimate.name, invoices, laborRateRefs) }],
    })
    const finalMessage = await stream.finalMessage()
    const first = finalMessage.content[0]
    const raw = first && first.type === 'text' ? first.text : ''
    const parsed = parseReviewResponse(raw)
    return buildReview({
      parsed,
      fileName: estimate.name,
      photoCount: attachments.length,
      reviewNumber,
      // Correct-rate assertions now come from labor-rate reference photos
      // (extracted by the model into parsed.referenceLaborRates) rather than
      // a manual form. If no refs were provided or the model didn't extract
      // any, rateFindings will be empty.
      assertedRates: parsed.referenceLaborRates ?? [],
      invoiceFileNames: invoices.map((i) => i.fileName),
      laborRateReferenceFileNames: laborRateRefs.map((r) => r.fileName),
      stateRule,
      claimState,
    })
  } catch (err) {
    console.error('review-estimate: failed for', estimate.name, err)
    return {
      id: crypto.randomUUID(),
      reviewNumber,
      savedAt: new Date().toISOString(),
      fileName: estimate.name,
      software: 'Unknown',
      grandTotalBilled: 0,
      photoCount: attachments.length,
      flags: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function extractInvoiceTexts(files: File[]): Promise<InvoiceText[]> {
  const results = await Promise.all(
    files.map(async (f): Promise<InvoiceText | null> => {
      try {
        const buffer = Buffer.from(await f.arrayBuffer())
        const type = f.type.toLowerCase()
        const isPdf = type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        const text = isPdf
          ? await extractTextFromPDF(buffer)
          : await extractTextFromImage(buffer)
        return { fileName: f.name, text }
      } catch (err) {
        console.error('extractInvoiceTexts: failed for', f.name, err)
        return null
      }
    }),
  )
  return results.filter((r): r is InvoiceText => r !== null)
}

// Concurrency-limited parallel processing.
async function processInBatches<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
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
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  const limit = rateLimit(`review-estimate:${caller!.userId}`, 500, 3600)
  if (!limit.ok) {
    console.warn(`[review-estimate] rate limit tripped for ${caller!.userId}, retry in ${limit.resetInSeconds}s`)
    return NextResponse.json(
      { error: `Rate limit exceeded, try again in ${limit.resetInSeconds} seconds` },
      { status: 429 },
    )
  }
  try {
    const formData = await request.formData()
    const estimates = formData
      .getAll('estimates')
      .filter((v): v is File => v instanceof File)
    const photos = formData
      .getAll('photos')
      .filter((v): v is File => v instanceof File)
      .slice(0, MAX_PHOTOS)
    const invoices = formData
      .getAll('invoices')
      .filter((v): v is File => v instanceof File)
      .slice(0, 100) // safety cap
    // Loss state for automated tax check (Phase 4). Client sends the resolved
    // 2-letter code from claim.ownerAddress via `claimState`; a missing/empty
    // value degrades to a "no state rule" informational finding.
    const claimStateRaw = formData.get('claimState')
    const claimState = typeof claimStateRaw === 'string' ? claimStateRaw.trim().toUpperCase() : ''
    const nextNumberRaw = formData.get('nextReviewNumber')
    const nextNumber = typeof nextNumberRaw === 'string' ? Number(nextNumberRaw) : 1

    // Claim id lets us pull the claim's labor-rate reference photos from the
    // Documents tab (source === 'labor-rates') and feed them to Claude so it
    // extracts the correct labor rates itself instead of the appraiser typing
    // them into a form. If claimId is missing or no such docs exist, the
    // review still runs — it just won't produce labor-rate findings.
    const claimIdRaw = formData.get('claimId')
    const claimId = typeof claimIdRaw === 'string' ? claimIdRaw.trim() : ''

    if (estimates.length === 0) {
      return NextResponse.json(
        { error: 'At least one estimate file is required' },
        { status: 400 },
      )
    }

    // Per-file size cap: 25 MB. Anything above that is almost certainly
    // wrong (bulk export, malformed PDF, adversarial payload) and would
    // stall OCR / burn Anthropic tokens.
    const MAX_FILE_BYTES = 25 * 1024 * 1024
    for (const f of [...estimates, ...photos, ...invoices]) {
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `File ${f.name} exceeds 25 MB limit` },
          { status: 413 },
        )
      }
    }

    const encodedAttachments = await Promise.all(photos.map(encodeAttachment))
    const invoiceTexts = await extractInvoiceTexts(invoices)

    // Fetch state tax rule for the loss state + labor-rate reference photos
    // for the claim. Both wrapped so any failure degrades gracefully.
    let stateRule: StateTaxRule | null = null
    let laborRateRefs: LaborRateReference[] = []
    try {
      const supabase = await createServerClient()
      if (claimState) {
        stateRule = await fetchStateTaxRule(claimState, supabase)
      }
      if (claimId) {
        const { data: row } = await supabase
          .from('acv_history')
          .select('documents')
          .eq('id', claimId)
          .maybeSingle()
        const docs = (row?.documents ?? []) as ClaimDocument[]
        const laborRateDocs = docs.filter(d => d && d.source === 'labor-rates')
        for (const doc of laborRateDocs) {
          const { data: file, error: dlErr } = await supabase.storage
            .from('claim-documents')
            .download(doc.path)
          if (dlErr || !file) continue
          const buf = Buffer.from(await file.arrayBuffer())
          const mime = (file.type || '').toLowerCase()
          const isPdf = mime === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf')
          const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|tiff?)$/i.test(doc.name)
          if (isPdf) {
            laborRateRefs.push({
              kind: 'pdf',
              data: buf.toString('base64'),
              fileName: doc.name,
            })
          } else if (isImage) {
            laborRateRefs.push({
              kind: 'image',
              media_type: normalizePhotoMediaType(mime),
              data: buf.toString('base64'),
              fileName: doc.name,
            })
          }
        }
      }
    } catch (err) {
      console.error('Failed to load state tax rule / labor rate refs (continuing):', err)
    }

    const reviews = await processInBatches(estimates, MAX_CONCURRENT, (file, i) =>
      reviewOne(file, encodedAttachments, nextNumber + i, invoiceTexts, laborRateRefs, stateRule, claimState),
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
