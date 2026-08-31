import { NextRequest, NextResponse } from 'next/server'
import { fillDVPdf, type DVVariant, type DVPdfData } from '@/lib/acv/dv-pdf-filler'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

const VARIANTS: DVVariant[] = ['nationwide-attorney', 'nationwide-sedgwick', 'wloss-attorney', 'wloss-sedgwick']

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const variant = body.variant as DVVariant
    if (!VARIANTS.includes(variant)) {
      return NextResponse.json({ error: 'Invalid DV report variant' }, { status: 400 })
    }
    const bytes = await fillDVPdf(variant, body.data as DVPdfData)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="dv-report.pdf"',
      },
    })
  } catch (err) {
    console.error('DV PDF generation failed:', err)
    let message = err instanceof Error ? err.message : 'PDF generation failed'
    if (message.includes('PDFDict')) {
      // The Insurance (no prior loss) template PDF has internal corruption.
      message = 'This report template file is damaged. Open it in Adobe Acrobat, use File > Save As to re-save it, and replace public/dv-templates with the repaired copy.'
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
