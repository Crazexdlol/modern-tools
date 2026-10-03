// POST /api/acv/review-estimate
// JSON body: { estimateDocId: string, supportingDocIds: string[],
//              claimId: string, claimState?: string, nextReviewNumber: number }
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
import { createServiceClient } from '@/lib/supabase/service'
import { fetchStateTaxRule, type StateTaxRule } from '@/lib/supabase/state-tax-rules'
import type { ClaimDocument } from '@/lib/supabase/documents'

export const runtime = 'nodejs'
export const maxDuration = 300 // allow long AI streams

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_CONCURRENT = 3

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

// Infer MIME type from file extension for blobs downloaded from storage.
function inferMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
  }
  return map[ext] ?? 'application/octet-stream'
}

// Filename-based heuristics to classify supporting documents.
function isLaborRateFilename(name: string): boolean {
  return /\b(labor|rate|wage|chart|sheet)\b/i.test(name)
}

function isInvoiceFilename(name: string): boolean {
  return /\binvoice\b/i.test(name) || /\bpo\b|\bpurchase[\s-]?order\b/i.test(name)
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
    // Accept JSON body with document IDs referencing the claim's Documents tab.
    const body = await request.json() as {
      estimateDocId?: string
      supportingDocIds?: string[]
      claimId?: string
      claimState?: string
      nextReviewNumber?: number
    }

    const estimateDocId = typeof body.estimateDocId === 'string' ? body.estimateDocId.trim() : ''
    const supportingDocIds: string[] = Array.isArray(body.supportingDocIds) ? body.supportingDocIds : []
    const claimId = typeof body.claimId === 'string' ? body.claimId.trim() : ''
    const claimState = typeof body.claimState === 'string' ? body.claimState.trim().toUpperCase() : ''
    const nextNumber = typeof body.nextReviewNumber === 'number' ? body.nextReviewNumber : 1

    if (!estimateDocId) {
      return NextResponse.json(
        { error: 'An estimate document must be selected' },
        { status: 400 },
      )
    }
    if (!claimId) {
      return NextResponse.json(
        { error: 'claimId is required' },
        { status: 400 },
      )
    }

    // Download all needed docs from the claim-documents storage bucket.
    // Use the service client so storage downloads are not subject to user-level RLS.
    const supabaseService = createServiceClient()
    const supabaseServer = await createServerClient()

    // Load the claim's document manifest from acv_history.
    const { data: row, error: rowErr } = await supabaseService
      .from('acv_history')
      .select('documents')
      .eq('id', claimId)
      .maybeSingle()
    if (rowErr) {
      console.error('review-estimate: failed to load claim documents', rowErr)
      return NextResponse.json({ error: 'Failed to load claim documents' }, { status: 500 })
    }
    const allDocs = (row?.documents ?? []) as ClaimDocument[]

    // Helper: download one ClaimDocument as a File object.
    async function downloadDoc(doc: ClaimDocument): Promise<File | null> {
      const { data: blob, error: dlErr } = await supabaseService.storage
        .from('claim-documents')
        .download(doc.path)
      if (dlErr || !blob) {
        console.error('review-estimate: failed to download', doc.path, dlErr)
        return null
      }
      const mime = inferMime(doc.name)
      return new File([await blob.arrayBuffer()], doc.name, { type: mime })
    }

    // Resolve the estimate document.
    const estimateDocMeta = allDocs.find(d => d.id === estimateDocId)
    if (!estimateDocMeta) {
      return NextResponse.json({ error: 'Estimate document not found on this claim' }, { status: 400 })
    }
    const estimateFile = await downloadDoc(estimateDocMeta)
    if (!estimateFile) {
      return NextResponse.json({ error: `Failed to download estimate: ${estimateDocMeta.name}` }, { status: 500 })
    }

    // Per-file size cap: 25 MB.
    const MAX_FILE_BYTES = 25 * 1024 * 1024
    if (estimateFile.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File ${estimateFile.name} exceeds 25 MB limit` },
        { status: 413 },
      )
    }

    // Resolve and download supporting documents, then classify by filename.
    const photoFiles: File[] = []
    const invoiceFiles: File[] = []
    const laborRateFiles: File[] = []

    const supportingDocsMeta = allDocs.filter(d => supportingDocIds.includes(d.id))
    for (const doc of supportingDocsMeta) {
      const file = await downloadDoc(doc)
      if (!file) continue
      if (file.size > MAX_FILE_BYTES) {
        console.warn(`review-estimate: skipping ${doc.name} — exceeds 25 MB`)
        continue
      }
      if (isLaborRateFilename(doc.name)) {
        laborRateFiles.push(file)
      } else if (isInvoiceFilename(doc.name)) {
        invoiceFiles.push(file)
      } else {
        photoFiles.push(file)
      }
    }

    // Build encoded attachments, invoice texts, labor rate refs.
    const encodedAttachments = await Promise.all(photoFiles.map(encodeAttachment))
    const invoiceTexts = await extractInvoiceTexts(invoiceFiles)

    // Build labor rate refs from the classified labor-rate files.
    const laborRateRefs: LaborRateReference[] = []
    for (const f of laborRateFiles) {
      const buf = Buffer.from(await f.arrayBuffer())
      const mime = (f.type || '').toLowerCase()
      const isPdf = mime === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      const isImg = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|tiff?)$/i.test(f.name)
      if (isPdf) {
        laborRateRefs.push({ kind: 'pdf', data: buf.toString('base64'), fileName: f.name })
      } else if (isImg) {
        laborRateRefs.push({ kind: 'image', media_type: normalizePhotoMediaType(mime), data: buf.toString('base64'), fileName: f.name })
      }
    }

    // Fetch state tax rule; degrade gracefully on failure.
    let stateRule: StateTaxRule | null = null
    try {
      if (claimState) {
        stateRule = await fetchStateTaxRule(claimState, supabaseServer)
      }
    } catch (err) {
      console.error('Failed to load state tax rule (continuing):', err)
    }

    const reviews = await processInBatches([estimateFile], MAX_CONCURRENT, (file, i) =>
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
