import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { sanitizeFilename } from '@/lib/sanitize-filename'
import { PDFDocument } from 'pdf-lib'
import { readTemplate, NoTemplateError, NO_TEMPLATE_CODE } from '@/lib/pdf/template-path'
import { getCompanySlug } from '@/lib/pdf/company-slug'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  try {
    const body = await request.json()
    const { values, maNumber, claimId }: { values: Record<string, string | boolean>; maNumber?: string; claimId?: string } = body

    // Resolve company slug from claim (or fall back to caller's active).
    let companySlug: string
    if (claimId) {
      const svc = createServiceClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await svc.from('acv_history').select('company_id' as any).eq('id', claimId).maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companySlug = await getCompanySlug((data as any)?.company_id ?? caller!.activeCompanyId)
    } else {
      companySlug = await getCompanySlug(caller!.activeCompanyId)
    }
    const templateBytes = readTemplate(companySlug, 'acv-contract-template.pdf')
    const pdfDoc = await PDFDocument.load(templateBytes)
    const form = pdfDoc.getForm()

    for (const [fieldName, rawValue] of Object.entries(values)) {
      try {
        const field = form.getField(fieldName)
        if (!field) continue

        const fieldType = field.constructor.name

        if (fieldType === 'PDFCheckBox') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cb = field as any
          if (rawValue) cb.check()
          else cb.uncheck()
        } else if (fieldType === 'PDFDropdown') {
          // Dropdown: prefer .select() so the write validates against the
          // option list. Falls back to setText() (an off-list value) so a
          // user's free-text answer still lands in the PDF rather than
          // silently dropping.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dd = field as any
          const value = String(rawValue)
          if (!value) continue
          try {
            dd.select(value)
          } catch {
            if (typeof dd.setText === 'function') dd.setText(value)
          }
        } else if (fieldType === 'PDFOptionList') {
          // Best-effort — skip option lists (they need setOptions before select)
        } else {
          // PDFTextField
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tf = field as any
          if (typeof tf.setText === 'function') {
            tf.setText(String(rawValue))
          }
        }
      } catch {
        // Per-field error — skip and continue
        console.warn(`[generate-contract-pdf] skipped field "${fieldName}"`)
      }
    }

    form.flatten()

    const pdfBytes = await pdfDoc.save()
    const buffer = Buffer.from(pdfBytes)
    const filename = maNumber ? `${sanitizeFilename(maNumber)}-contract.pdf` : 'contract.pdf'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    if (err instanceof NoTemplateError) {
      return NextResponse.json(
        { error: err.message, code: NO_TEMPLATE_CODE, companySlug: err.companySlug },
        { status: 400 },
      )
    }
    console.error('[generate-contract-pdf] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
