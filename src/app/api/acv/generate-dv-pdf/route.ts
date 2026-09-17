import { NextRequest, NextResponse } from 'next/server'
import { fillDVPdf, type DVVariant, type DVPdfData } from '@/lib/acv/dv-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'
import { sanitizeFilename } from '@/lib/sanitize-filename'

export const runtime = 'nodejs'

const VARIANTS: DVVariant[] = ['nationwide-attorney', 'nationwide-sedgwick', 'wloss-attorney', 'wloss-sedgwick']

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const variant = body.variant as DVVariant
    if (!VARIANTS.includes(variant)) {
      return NextResponse.json({ error: 'Invalid DV report variant' }, { status: 400 })
    }
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const bytes = await fillDVPdf(companySlug, variant, body.data as DVPdfData)
    // Prefer MA# from the data (fileNumber is set to claim.maNumber by
    // dv-tab.tsx). Client also sets the picker filename to <MA#>-dvreport.pdf,
    // this header is the fallback.
    const maNumber = (body.data as DVPdfData)?.fileNumber || 'claim'
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(maNumber)}-dvreport.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('DV PDF generation failed:', err)
    let message = err instanceof Error ? err.message : 'PDF generation failed'
    if (message.includes('PDFDict')) {
      message = 'This report template file is damaged. Open it in Adobe Acrobat, use File > Save As to re-save it, and replace the file in public/companies/<slug>/templates/dv-templates/ with the repaired copy.'
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
