import { NextRequest, NextResponse } from 'next/server'
import { buildCoverLetterPdf, type CoverLetterData } from '@/lib/cover-letter/pdf'
import { requireAuth } from '@/lib/auth/require-admin'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { sanitizeFilename } from '@/lib/sanitize-filename'

// pdf-lib + fs.readFileSync (for the logo) require the Node runtime.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const data = body.data as CoverLetterData
    if (!data) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const bytes = await buildCoverLetterPdf(data, companySlug)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(data.maNumber || 'claim')}-cover.pdf"`,
      },
    })
  } catch (err) {
    console.error('Cover letter PDF generation failed:', err)
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
