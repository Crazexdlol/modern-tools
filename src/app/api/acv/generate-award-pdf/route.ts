import { NextRequest, NextResponse } from 'next/server'
import { fillAwardPdf } from '@/lib/acv/award-pdf-filler'
import type { AwardPdfData } from '@/lib/acv/award-pdf-filler'

export async function POST(request: NextRequest) {
  try {
    const body: AwardPdfData = await request.json()
    const pdfBytes = await fillAwardPdf(body)
    const buffer = Buffer.from(pdfBytes)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Award-Agreement-${body.claimNumber || 'report'}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Award PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Award PDF generation failed' },
      { status: 500 }
    )
  }
}
