import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { sanitizeFilename } from '@/lib/sanitize-filename'
import { buildStorageChargesPdf } from '@/lib/storage/pdf'
import type { ClaimInfo, StorageState } from '@/lib/acv/types'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'

// Node runtime — pdf-lib + fs.readFileSync(logo.png) don't run on edge.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json() as { claim: ClaimInfo; state: StorageState }
    if (!body?.claim || !body?.state) {
      return NextResponse.json({ error: 'Missing claim or state' }, { status: 400 })
    }
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const bytes = await buildStorageChargesPdf(companySlug, body.claim, body.state)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(body.claim.maNumber || 'claim')}-storagereport.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('Storage PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 },
    )
  }
}
