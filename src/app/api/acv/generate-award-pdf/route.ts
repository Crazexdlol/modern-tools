import { NextRequest, NextResponse } from 'next/server'
import { fillAwardPdf } from '@/lib/acv/award-pdf-filler'
import type { AwardPdfData } from '@/lib/acv/award-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'
import { sanitizeFilename } from '@/lib/sanitize-filename'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'

// pdf-lib + fs.readFileSync require the Node runtime; keep this explicit
// so a future edge default flip doesn't silently break the route.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body: AwardPdfData = await request.json()
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const pdfBytes = await fillAwardPdf(companySlug, body)
    const buffer = Buffer.from(pdfBytes)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(body.claimNumber || 'report')}-award.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('Award PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Award PDF generation failed' },
      { status: 500 }
    )
  }
}
