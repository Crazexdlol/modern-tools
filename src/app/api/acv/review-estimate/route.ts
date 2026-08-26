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
  type PhotoMediaType,
  type ReferenceAttachment,
} from '@/lib/estimate-review/prompt'
import type { EstimateReview } from '@/lib/estimate-review/types'

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
): Promise<EstimateReview> {
  try {
    const text = await extractEstimateText(estimate)
    const stream = await client.beta.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      betas: ['output-128k-2025-02-19'],
      system: buildSystemBlocks(),
      messages: [{ role: 'user', content: buildUserMessage(text, attachments, estimate.name) }],
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
  try {
    const formData = await request.formData()
    const estimates = formData
      .getAll('estimates')
      .filter((v): v is File => v instanceof File)
    const photos = formData
      .getAll('photos')
      .filter((v): v is File => v instanceof File)
      .slice(0, MAX_PHOTOS)
    const nextNumberRaw = formData.get('nextReviewNumber')
    const nextNumber = typeof nextNumberRaw === 'string' ? Number(nextNumberRaw) : 1

    if (estimates.length === 0) {
      return NextResponse.json(
        { error: 'At least one estimate file is required' },
        { status: 400 },
      )
    }

    const encodedAttachments = await Promise.all(photos.map(encodeAttachment))

    const reviews = await processInBatches(estimates, MAX_CONCURRENT, (file, i) =>
      reviewOne(file, encodedAttachments, nextNumber + i),
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
