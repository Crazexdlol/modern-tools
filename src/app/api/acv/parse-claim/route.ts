import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromPDF } from '@/lib/pdf-extractor'
import { requireAuth } from '@/lib/auth/require-admin'
import { parseClaim } from '@/lib/acv/parsers'
import { decodeVin } from '@/lib/acv/decode-vin'

export const runtime = 'nodejs'

// Blank-ish values the parsers emit when a field was missing from the PDF.
// We retry the VIN decoder when make/model fall in this set.
function isBlank(v: string | undefined | null): boolean {
  if (!v) return true
  const s = v.trim().toLowerCase()
  return !s || s === 'n/a' || s === 'na'
}

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

    // Per-file size cap: 25 MB. Anything larger is almost certainly wrong
    // and would stall OCR.
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: `File ${file.name} exceeds 25 MB limit` }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractTextFromPDF(buffer)

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. The file may be image-based.' },
        { status: 422 }
      )
    }

    const parsed = parseClaim(text)

    // Auto-decode VIN when the sheet is missing make OR model (year is
    // usually present on all formats). Fills the parsed result in-place so
    // the client gets a complete vehicle block in one round-trip. Any
    // decoder failure is swallowed — the user can still manually fill
    // Make/Model, same as before this hook existed.
    if (parsed.vin && !isBlank(parsed.vin) && (isBlank(parsed.make) || isBlank(parsed.model))) {
      try {
        const decoded = await decodeVin(parsed.vin)
        if (decoded) {
          if (isBlank(parsed.make) && decoded.make) parsed.make = decoded.make
          if (isBlank(parsed.model) && decoded.model) parsed.model = decoded.model
          if (!parsed.year && decoded.year) parsed.year = decoded.year
          // Sanitized VIN (O→0 etc.) wins — the PDF often has typos.
          if (decoded.vin) parsed.vin = decoded.vin
        }
      } catch (err) {
        console.error('[parse-claim] VIN auto-decode failed:', err)
      }
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('parse-claim error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse claim PDF' },
      { status: 500 }
    )
  }
}

