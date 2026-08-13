import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import type { InvoiceVariant, InvoicePdfData } from './types'

const TEMPLATE_FILES: Record<InvoiceVariant, string> = {
  long: 'invoice-long.pdf',
  'very-long': 'invoice-very-long.pdf',
}

// Field names in both templates are generic auto-numbered AcroForm fields
// (not descriptive) — mapped here by widget position, verified against the
// original PDFs. Both templates share the same [qty, description, total]
// triple field names for their first 8 rows; "very-long" has 6 more rows via
// Text1..Text18. "long" additionally has the Owner/Insurance/Vehicle detail
// block (fields 4-17), which "very-long" has no room for.
const ROW_FIELDS: [string, string, string][] = [
  ['18', '19', '20'],
  ['21', '22', '23'],
  ['24', '25', '26'],
  ['27', '28', '29'],
  ['30', '31', '32'],
  ['36', '37', '38'],
  ['39', '40', '41'],
  ['42', '43', '44'],
]
const VERY_LONG_EXTRA_ROW_FIELDS: [string, string, string][] = [
  ['Text1', 'Text2', 'Text3'],
  ['Text4', 'Text5', 'Text6'],
  ['Text7', 'Text8', 'Text9'],
  ['Text10', 'Text11', 'Text12'],
  ['Text13', 'Text14', 'Text15'],
  ['Text16', 'Text17', 'Text18'],
]

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

function setField(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* field may not exist in this template */ }
}

export async function fillInvoicePdf(variant: InvoiceVariant, data: InvoicePdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'invoice-templates', TEMPLATE_FILES[variant])
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  // Embed Times Roman and set as default font for all fields (matches the
  // template's printed labels).
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
  const fontKey = 'F_TimesRoman'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = form.acroForm.dict.lookup(PDFName.of('DR')) as any
  if (resources) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fontDict = resources.lookup?.(PDFName.of('Font')) as any
    if (fontDict) fontDict.set(PDFName.of(fontKey), timesRoman.ref)
  }
  // 9pt fits the narrowest field (VIN, ~101pt wide, needs to hold 17 chars)
  // without clipping while staying visually consistent across every field —
  // auto-size (0 Tf) fixes VIN but blows up short/tall fields like line items.
  form.getFields().forEach(f => {
    const da = `0 0 0 rg /${fontKey} 9 Tf`
    f.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
    f.acroField.getWidgets().forEach(w => {
      w.dict.set(PDFName.of('DA'), PDFString.of(da))
    })
  })

  setField(form, '1', formatDate(data.date))
  setField(form, '2', data.invoiceNumber)
  setField(form, '3', data.client)

  if (variant === 'long') {
    setField(form, '4', data.ownerName)
    setField(form, '5', data.ownerAddress)
    setField(form, '6', data.ownerPhone)
    setField(form, '8', formatDate(data.dateOfLoss))
    setField(form, '9', data.insuranceCompany)
    setField(form, '10', data.adjuster)
    setField(form, '11', data.insurancePhone)
    setField(form, '12', data.insuranceEmail)
    setField(form, '13', data.claimNumber)
    setField(form, '14', data.vehicleYear)
    setField(form, '15', data.vehicleMake)
    setField(form, '16', data.vehicleModel)
    setField(form, '17', data.vin)
  }

  const rowFields = variant === 'long' ? ROW_FIELDS : [...ROW_FIELDS, ...VERY_LONG_EXTRA_ROW_FIELDS]
  data.lineItems.slice(0, rowFields.length).forEach((item, i) => {
    const [qtyField, descField, totalField] = rowFields[i]
    setField(form, qtyField, item.quantity)
    setField(form, descField, item.description)
    setField(form, totalField, item.total)
  })

  // Field "33" has TWO widgets on the page — one at the Subtotal box, one at
  // the Total box — because Modern Appraisers never charges sales tax on
  // appraisal services, so Subtotal always equals Total and the template
  // shares one field between both boxes. Field "34" is the separate Sales Tax
  // box in between; leave it untouched (blank) rather than double-printing
  // the total there.
  setField(form, '33', data.subtotal)

  // Remove JavaScript calculation actions so the static values we just set win.
  form.getFields().forEach(f => {
    f.acroField.dict.delete(PDFName.of('AA'))
  })
  form.acroForm.dict.delete(PDFName.of('CO'))

  return doc.save()
}
