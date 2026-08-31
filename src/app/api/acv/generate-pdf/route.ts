import { NextRequest, NextResponse } from 'next/server'
import { fillACVPdf } from '@/lib/acv/pdf-filler'
import { calculateACV } from '@/lib/acv/calculations'
import type { ClaimInfo, SelectedComp, ACVAdjustments } from '@/lib/acv/types'
import { requireAuth } from '@/lib/auth/require-admin'

// pdf-lib + fs.readFileSync require the Node runtime; keep this explicit
// so a future edge default flip doesn't silently break the route.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const {
      claim,
      comps,
      adjustments,
    }: { claim: ClaimInfo; comps: SelectedComp[]; adjustments: ACVAdjustments } = body

    const result = calculateACV(comps, adjustments)
    const pdfBytes = await fillACVPdf(claim, comps, adjustments, result)
    const buffer = Buffer.from(pdfBytes)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${claim.maNumber || 'report'}-acv.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
