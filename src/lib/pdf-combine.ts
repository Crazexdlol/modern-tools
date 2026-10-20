"use client"

// Client-side "Combine selected documents into one PDF" helper used by the
// Documents tab. Fetches each doc via its signed URL, merges PDFs page-by-
// page with pdf-lib, and embeds images as full-size pages (re-encoded to
// JPEG via <canvas> so EXIF orientation is baked in and HEIC/WebP decode
// goes through the browser's native image pipeline).
//
// pdf-lib is dynamically imported so it stays out of the main client bundle
// — only loaded when the user actually clicks Combine.

import type { ClaimDocument } from './supabase/documents'
import { getClaimDocumentUrl } from './supabase/documents'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff'])

function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

// A doc is combinable iff it's a PDF or a browser-decodable image.
// Everything else (docx / xlsx / etc.) is excluded from the merge so a
// stray office doc in the selection doesn't poison the whole operation.
export function canCombineDoc(doc: ClaimDocument): boolean {
  const e = extOf(doc.name)
  return e === 'pdf' || IMAGE_EXTS.has(e)
}

async function fetchDocBytes(doc: ClaimDocument): Promise<Uint8Array> {
  const url = await getClaimDocumentUrl(doc.path)
  if (!url) throw new Error(`Could not fetch ${doc.name}`)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${doc.name}`)
  return new Uint8Array(await r.arrayBuffer())
}

// Max longest-side pixels for image pages. Phones routinely produce
// 4000-8000px photos; 2400px is enough for a letter-sized PDF page at
// ~300dpi and keeps the combined output comfortably inside the 25 MB
// upload cap even for 20+ page combines.
const IMAGE_MAX_SIDE = 2400

async function imageBytesToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart])
  // createImageBitmap handles jpg/png/gif/webp natively on every modern
  // browser; HEIC works on Safari and some Chrome builds. Formats the
  // browser can't decode throw here and we propagate so the caller can
  // report the file as skipped.
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context not available')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const jpegBlob: Blob = await new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('canvas.toBlob failed')), 'image/jpeg', 0.85)
  })
  return new Uint8Array(await jpegBlob.arrayBuffer())
}

export interface CombineResult {
  blob: Blob
  // Names of docs that couldn't be merged (fetch failed, encrypted PDF
  // that pdf-lib couldn't parse, image the browser couldn't decode, etc.)
  // The combined PDF still contains every doc that DID succeed.
  skipped: string[]
}

export async function combineDocsToPdf(docs: ClaimDocument[]): Promise<CombineResult> {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const skipped: string[] = []

  for (const doc of docs) {
    try {
      const bytes = await fetchDocBytes(doc)
      const ext = extOf(doc.name)

      if (ext === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach(p => out.addPage(p))
      } else if (IMAGE_EXTS.has(ext)) {
        const jpeg = await imageBytesToJpeg(bytes)
        const img = await out.embedJpg(jpeg)
        const page = out.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      } else {
        skipped.push(doc.name)
      }
    } catch (err) {
      console.error(`Failed to combine ${doc.name}:`, err)
      skipped.push(doc.name)
    }
  }

  if (out.getPageCount() === 0) {
    throw new Error('No pages could be added to the combined PDF.')
  }

  const outBytes = await out.save()
  return {
    blob: new Blob([outBytes as BlobPart], { type: 'application/pdf' }),
    skipped,
  }
}
