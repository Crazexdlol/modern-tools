import { NextRequest, NextResponse } from 'next/server'
import { fillNotesPdf } from '@/lib/acv/notes-pdf-filler'
import type { NotesPdfData } from '@/lib/acv/notes-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'
import { sanitizeFilename } from '@/lib/sanitize-filename'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body: NotesPdfData = await request.json()
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const pdfBytes = await fillNotesPdf(companySlug, body)
    const buffer = Buffer.from(pdfBytes)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(body.fileNumber || 'report')}-notes.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('Notes PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Notes PDF generation failed' },
      { status: 500 }
    )
  }
}
