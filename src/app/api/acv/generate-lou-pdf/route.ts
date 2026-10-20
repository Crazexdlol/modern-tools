import { NextRequest, NextResponse } from 'next/server'
import { fillLOUPdf, type LOUVariant, type LOUPdfData } from '@/lib/acv/lou-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'
import { stripCoverPage } from '@/lib/pdf/strip-cover'
import { sanitizeFilename } from '@/lib/sanitize-filename'

// pdf-lib + fs.readFileSync require the Node runtime; match ACV / DV routes.
export const runtime = 'nodejs'

const VARIANTS: LOUVariant[] = ['days', 'hours']

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const variant = body.variant as LOUVariant
    if (!VARIANTS.includes(variant)) {
      return NextResponse.json({ error: 'Invalid LOU report variant' }, { status: 400 })
    }
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    let bytes = await fillLOUPdf(companySlug, variant, body.data as LOUPdfData)
    // Cover-page toggle: see /api/acv/generate-pdf for matching logic.
    if (body.includeCover === false) bytes = await stripCoverPage(bytes)
    const maNumber = (body.data as LOUPdfData)?.maNumber || 'claim'
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(maNumber)}-loureport.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('LOU PDF generation failed:', err)
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
