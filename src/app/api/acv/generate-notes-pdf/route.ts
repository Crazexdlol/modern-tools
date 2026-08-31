import { NextRequest, NextResponse } from 'next/server'
import { fillNotesPdf } from '@/lib/acv/notes-pdf-filler'
import type { NotesPdfData } from '@/lib/acv/notes-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body: NotesPdfData = await request.json()
    const pdfBytes = await fillNotesPdf(body)
    const buffer = Buffer.from(pdfBytes)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${body.fileNumber || 'report'}-notes.pdf"`,
      },
    })
  } catch (err) {
    console.error('Notes PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Notes PDF generation failed' },
      { status: 500 }
    )
  }
}
