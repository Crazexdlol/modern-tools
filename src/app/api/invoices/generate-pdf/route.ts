import { NextRequest, NextResponse } from 'next/server'
import { fillInvoicePdf } from '@/lib/invoice/invoice-pdf-filler'
import type { InvoiceVariant, InvoicePdfData } from '@/lib/invoice/types'
import { requireAuth } from '@/lib/auth/require-admin'
import { sanitizeFilename } from '@/lib/sanitize-filename'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'

export const runtime = 'nodejs'

const VARIANTS: InvoiceVariant[] = ['long', 'very-long']

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const body = await request.json()
    const variant = body.variant as InvoiceVariant
    if (!VARIANTS.includes(variant)) {
      return NextResponse.json({ error: 'Invalid invoice template' }, { status: 400 })
    }
    const companySlug = await getCompanySlug(caller!.activeCompanyId)
    const pdfBytes = await fillInvoicePdf(companySlug, variant, body.data as InvoicePdfData)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename((body.data as InvoicePdfData)?.invoiceNumber || 'invoice')}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('Invoice PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invoice PDF generation failed' },
      { status: 500 }
    )
  }
}
