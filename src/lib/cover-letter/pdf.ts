import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib'
import { readTemplate } from '@/lib/pdf/template-path'

// Modern Appraisers cover letter — built off the uploaded template PDF so
// the layout, logo, dark background, and label line positions all match
// exactly. We don't use the AcroForm fields for text placement because the
// template's widget rectangles are too wide / positioned awkwardly for the
// label-with-colon style ("MA# <value>", "Client : <value>"). Instead we
// clear + flatten the form, then draw every value post-flatten at a
// computed x = (label end) + fixed gap — same gap for every row, so
// nothing gets a big dead space and nothing collides with its label.
//
// See the "no gap/no collision" rule in CLAUDE.md for the LOU-report
// history behind this approach.
export interface CoverLetterData {
  title: string            // overlays the template's title (default: "Appraisal")
  maNumber: string
  date: string
  claimNumber: string
  clientName: string
  insuredName: string
  vehicle: string
  vin: string
  mileage: string
  dateOfLoss: string
}

export async function buildCoverLetterPdf(data: CoverLetterData, companySlug = 'modern-appraisers'): Promise<Uint8Array> {
  const templateBytes = readTemplate(companySlug, 'cover-letter-template.pdf')
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const times = await doc.embedFont(StandardFonts.TimesRoman)
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold)

  // Clear every AcroForm field + strip appearances. We don't want the
  // template's widget rendering interfering with our manual draws below.
  const FIELD_NAMES = ['Modern file #', 'Date2_af_date', 'Ins Claim #', 'Client', '1', 'Vehicle', '12', 'mileage', 'date1']
  for (const name of FIELD_NAMES) {
    try {
      const f = form.getTextField(name)
      f.setText('')
      f.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP')))
    } catch { /* field may not exist on all variants */ }
  }
  form.getFields().forEach(f => f.acroField.dict.delete(PDFName.of('AA')))
  form.acroForm.dict.delete(PDFName.of('CO'))
  form.flatten()

  const page = doc.getPages()[0]
  const WHITE = rgb(1, 1, 1)
  const BLACK = rgb(0, 0, 0)

  // Patch the baked-in "Salvage Bids Report" title. Pure black rect to
  // match the page background exactly. Y is set to clear the MA# label's
  // ascenders (baseline y=512, 14pt bold tops out around y=525) — earlier
  // y=518 clipped the top of "MA#".
  page.drawRectangle({ x: 55, y: 528, width: 500, height: 32, color: BLACK })
  page.drawText(data.title || 'Appraisal', {
    x: 72,
    y: 531,
    font: timesBold,
    size: 22,
    color: WHITE,
  })

  // Row writer. labelText = the exact label string drawn in the template
  // (bold, 14pt Times, baseline y). We measure it, add a fixed GAP, and
  // draw the value in regular Times at the same baseline. One consistent
  // gap for every row means no row ever gets a big empty space in it and
  // no row ever has its value touch the label.
  const LABEL_SIZE = 14
  const VALUE_SIZE = 14
  const GAP = 3
  function drawRow(labelText: string, value: string, y: number) {
    const labelEnd = 72 + timesBold.widthOfTextAtSize(labelText, LABEL_SIZE)
    page.drawText(value || '', {
      x: labelEnd + GAP,
      y,
      font: times,
      size: VALUE_SIZE,
      color: WHITE,
    })
  }

  // Baseline y's extracted from scripts/dump-cover-fields.mjs — these are
  // the template's own label baselines, so values land on the same line.
  drawRow('MA#',           data.maNumber,    512)
  drawRow('Date:',         data.date,        468)
  drawRow('Claim:',        data.claimNumber, 451)
  drawRow('Client :',      data.clientName,  417)
  drawRow('Insured:',      data.insuredName, 400)
  drawRow('Vehicle:',      data.vehicle,     382)
  drawRow('VIN:',          data.vin,         365)
  drawRow('Mileage:',      data.mileage,     348)
  drawRow('Date of Loss:', data.dateOfLoss,  331)

  return doc.save()
}
