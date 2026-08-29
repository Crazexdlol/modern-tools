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

