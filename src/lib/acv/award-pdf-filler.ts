import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export type AwardVariant = 'acv' | 'dv' | 'estimate'

export interface AwardPdfData {
  insuranceCompany: string
  vehicleOwner: string
  vehicle: string
  dateOfLoss: string
  claimDate: string
  claimNumber: string
  acvAmount: string
  signatureDate1: string
  signatureDate2: string
  signatureBlock1: string
  signatureBlock2: string
  // 'acv' (default) preserves the original letterhead exactly.
  // 'dv' overlays the value-label as "Diminished Value (DV)" and hides the
  //      entire "This award does NOT include:" clause.
  // 'estimate' hides the ACV label + underscore blank, draws the
  //      "Amount of Loss - Final Cost of Repair … $X" text inline in place
  //      of the value line, and drops the "Tax, Title, License Fees etc."
  //      line from the exclusion block.
  variant?: AwardVariant
}

// Convert YYYY-MM-DD to MM/DD/YYYY
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`
  }
  return dateStr
}

export async function fillAwardPdf(data: AwardPdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'award-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

  // Correct field mapping (by Y-coordinate position in the PDF):
  // Text1 = Date (top field)
  // Text2 = Claim Number
  // Text3 = Insurance Company
  // Text4 = Vehicle Owner
  // Text5 = Vehicle
  // Text6 = Date of Loss
  const fields: [string, string][] = [
    ['Text1', formatDate(data.claimDate)],
    ['Text2', data.claimNumber],
    ['Text3', data.insuranceCompany],
    ['Text4', data.vehicleOwner],
    ['Text5', data.vehicle],
    ['Text6', formatDate(data.dateOfLoss)],
    // All variants fill the same right-side blank so the amount always
    // lands in the exact same position as ACV.
    ['undefined', data.acvAmount],
    ['Date', formatDate(data.signatureDate1)],
    ['Date_2', formatDate(data.signatureDate2)],
    ['Text8', data.signatureBlock1],
    ['Text9', data.signatureBlock2],
  ]

  for (const [name, value] of fields) {
    try {
      const field = form.getTextField(name)
      field.setText(value)
      field.defaultUpdateAppearances(timesRoman)
    } catch { /* field may not exist */ }
  }

  // Flatten so values print as static text (no editable form fields).
  form.flatten()

  // DV variant: overlay two whiteouts on the flattened page, then draw the
  // new "Diminished Value (DV)" label in the same slot as the ACV label.
  // Coordinates were extracted from award-template.pdf via pdfjs
  // (getTextContent → transform matrices):
  //   "Actual Cash Value (ACV)"      → y=389, x=83, sz=14
  //   "This award does NOT include:" → y=343, x=81, sz=12
  //   "Prior Payments"               → y=328, x=86, sz=12
  //   "Deductible (s)"               → y=313, x=86, sz=12
  //   "Tax, Title, License Fees…"    → y=299, x=84, sz=12
  // PDF-native coordinates (origin bottom-left). Whiteout rectangles need
  // to be tall enough to cover cap+descender at each font size.
  if (data.variant === 'dv') {
    const page = doc.getPages()[0]
    // 1) Cover the "Actual Cash Value (ACV)" label. Rect is tall enough
    //    to cover the 14pt caps (top edge sits above the tallest glyph).
    page.drawRectangle({
      x: 78, y: 383, width: 230, height: 22,
      color: rgb(1, 1, 1),
    })
    page.drawText('Diminished Value (DV)', {
      x: 83, y: 389, size: 14, font: timesRoman, color: rgb(0, 0, 0),
    })
    // 2) Cover the 4-line "This award does NOT include:" block.
    page.drawRectangle({
      x: 74, y: 293, width: 340, height: 62,
      color: rgb(1, 1, 1),
    })
  }

  if (data.variant === 'estimate') {
    const page = doc.getPages()[0]
    // 1) Cover the "Actual Cash Value (ACV)" label only — the right-side
    //    underscore blank + amount stay put so the value lands in the exact
    //    same position as ACV/DV.
    page.drawRectangle({
      x: 78, y: 383, width: 300, height: 22,
      color: rgb(1, 1, 1),
    })
    // 2) Draw the estimate variant's label at the same 14pt Times Roman
    //    baseline as the original ACV label — visually consistent with
    //    the ACV and DV awards.
    page.drawText('Amount of Loss - Final Cost of Repair', {
      x: 83, y: 389, size: 14, font: timesRoman, color: rgb(0, 0, 0),
    })
    // 2b) Subtitle in smaller Times Roman directly under the main label.
    page.drawText('(bring vehicle back to pre-loss condition)', {
      x: 83, y: 375, size: 10, font: timesRoman, color: rgb(0, 0, 0),
    })
    // 3) Cover only the "Tax, Title, License Fees etc." line (y=299) —
    //    the estimate award keeps Prior Payments + Deductible (s) but
    //    drops the tax line per the Modern Appraisers sample.
    page.drawRectangle({
      x: 74, y: 294, width: 340, height: 14,
      color: rgb(1, 1, 1),
    })
  }

  return doc.save()
}
