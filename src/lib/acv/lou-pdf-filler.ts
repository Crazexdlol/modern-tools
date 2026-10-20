import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts, TextAlignment, rgb } from 'pdf-lib'
import { readTemplate } from '@/lib/pdf/template-path'

// Two LOU report templates. Both share identical header + comp-row layout;
// the HOURS variant adds a labor-hours → total-days derivation table at the
// bottom. The DAYS template ships mis-titled ("Actual Cash Value (ACV)"
// instead of "Loss of Use Report (LOV)") — the title is patched post-fill
// below so the printed report always reads correctly.
export type LOUVariant = 'days' | 'hours'

const TEMPLATE_FILES: Record<LOUVariant, string> = {
  days: 'lou-days.pdf',
  hours: 'lou-hours.pdf',
}

export interface LOUPdfData {
  maNumber: string
  claimNumber: string
  // "Client" on the cover page = the party we're acting on behalf of
  // (insurance company for an Insured claim). Separate from the owner
  // (the human the claim is actually about).
  clientName: string
  clientType: 'Insured' | 'Claimant'
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  ownerAddress: string
  insuranceCompany: string
  adjusterName: string
  adjusterPhone: string
  adjusterEmail: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vin: string
  mileage: number
  licenseState: string
  dateOfLoss: string
  dateUnitReceived: string
  rental1Description: string
  rental1DailyRate: number
  rental2Description: string
  rental2DailyRate: number
  rental3Description: string
  rental3DailyRate: number
  totalDays: number
  comp1Value: number
  comp2Value: number
  comp3Value: number
  averageValue: number
  adjustment1Label: string
  adjustment1Value: number
  adjustment2Label: string
  adjustment2Value: number
  adjustments: number
  finalLossOfUse: number
  laborHours: number
  businessRepairDays: number
  weekends: number
  additionalDays: number
  notes?: string
}

function money(n: number): string {
  const v = n || 0
  const abs = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return v < 0 ? `-$${abs}` : `$${abs}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

const DEFAULT_LOU_NOTE =
  'Based on the information provided, I have attached the recommended Loss of Use calculation. ' +
  'Information was calculated using the information supplied and established with available comparable rental vehicles.'

// Wrap plain text to a target pixel width using a given embedded font/size.
function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function setField(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* field may not exist in this template */ }
}

function setDropdown(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
) {
  try {
    const field = form.getDropdown(name)
    if (value && field.getOptions().includes(value)) field.select(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* dropdown missing or option not present */ }
}

export async function fillLOUPdf(companySlug: string, variant: LOUVariant, data: LOUPdfData): Promise<Uint8Array> {
  const templateBytes = readTemplate(companySlug, `lou-templates/${TEMPLATE_FILES[variant]}`)
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  // Templates already use /TiRo (Times Roman) throughout — embed the standard
  // Times Roman so appearances we regenerate match the template's native look.
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
  const timesRomanBold = await doc.embedFont(StandardFonts.TimesRomanBold)

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  // Normalize malformed widget rectangles (HOURS template ships widgets with
  // h=-18 that corrupt the content stream on flatten).
  form.getFields().forEach(f => {
    f.acroField.getWidgets().forEach(w => {
      const r = w.getRectangle()
      if (r.width <= 0 || r.height <= 0) {
        w.setRectangle({
          x: Math.min(r.x, r.x + r.width),
          y: Math.min(r.y, r.y + r.height),
          width: Math.max(Math.abs(r.width), 1),
          height: Math.max(Math.abs(r.height), 1),
        })
      }
    })
  })

  const vehicleStr = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ')
  const mileageStr = data.mileage ? data.mileage.toLocaleString('en-US') : ''

  // Date slots on the LOU PDF:
  //   Date2_af_date = the date THIS report is being generated (stamped
  //                   on the cover page next to "Date:").
  //   date1         = Date of Loss (left slot on the main form).
  //   date2         = Date Unit Received (right slot on the main form).
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Header fields shared across cover + main form.
  setField(form, 'Modern file #', data.maNumber)
  setField(form, 'Ins Claim #', data.claimNumber)
  // Cover page: these two widgets are much wider than the typical value
  // (w=103 for MA#, w=187 for Ins Claim #) and center-align by default,
  // which produces a visible gap between the template label ("MA#" ending
  // at x=100) and the value (center-aligned at ~x=130). Left-align so the
  // value hugs the label. Main-page widgets get whitewashed + redrawn
  // post-flatten, so changing their alignment here is harmless.
  for (const name of ['Modern file #', 'Ins Claim #']) {
    try { form.getTextField(name).setAlignment(TextAlignment.Left) } catch { /* missing on some template → fine */ }
  }
  setField(form, 'Date2_af_date', formatDate(todayIso))
  // "Client" on the cover page is the insurance company / claimant party,
  // NOT the insured. Insured name goes in field "1" below.
  setField(form, 'Client', data.clientName || data.ownerName)
  setField(form, 'Vehicle', vehicleStr)
  setField(form, 'mileage', mileageStr)
  setField(form, 'date1', formatDate(data.dateOfLoss))
  setField(form, 'date2', formatDate(data.dateUnitReceived))

  // OWNER column
  setDropdown(form, 'List Box 1', data.clientType)
  setField(form, '1', data.ownerName)
  setField(form, '2', data.ownerPhone)
  setField(form, '3', data.ownerEmail)
  setField(form, '4', data.ownerAddress)

  // INSURANCE COMPANY column
  setField(form, '5', data.insuranceCompany)
  setField(form, '6', data.adjusterName)
  setField(form, '7', data.adjusterPhone)
  setField(form, '8', data.adjusterEmail)

  // VEHICLE column
  setField(form, '9', data.vehicleYear)
  setField(form, '10', data.vehicleMake)
  setField(form, '11', data.vehicleModel)
  setField(form, '12', data.vin)
  // Dropdown2 (plate state) intentionally left blank — removed from the UI.

  // Comp rentals
  setField(form, '14', data.rental1Description)
  setField(form, 'Text2', money(data.rental1DailyRate))
  setField(form, '22', data.rental2Description)
  setField(form, 'Text5', money(data.rental2DailyRate))
  setField(form, '30', data.rental3Description)
  setField(form, 'Text6', money(data.rental3DailyRate))

  // Days per comp (shared "result", 3 widgets) + per-comp values
  setField(form, 'result', String(data.totalDays || ''))
  setField(form, 'Text7', money(data.comp1Value))
  setField(form, 'Text9', money(data.comp2Value))
  setField(form, 'Text10', money(data.comp3Value))

  // Adjustments: Text1/Text3 are the two description lines, Text15/Text14
  // are their dollar values, Text13 (shared middle + right) is the sum.
  setField(form, 'Text1', data.adjustment1Label || '')
  setField(form, 'Text15', data.adjustment1Value ? money(data.adjustment1Value) : '')
  setField(form, 'Text3', data.adjustment2Label || '')
  setField(form, 'Text14', data.adjustment2Value ? money(data.adjustment2Value) : '')

  // Summary — Average Value + total Adjustments + final Loss of Use
  setField(form, 'Text11', money(data.averageValue))
  setField(form, 'Text13', money(data.adjustments))
  setField(form, 'Text16', money(data.finalLossOfUse))

  // Hours derivation (HOURS only)
  if (variant === 'hours') {
    setField(form, 'Text8', data.laborHours > 0 ? data.laborHours.toFixed(1) : '')
    setField(form, 'Text12', String(data.businessRepairDays || ''))
    setField(form, 'Text19', String(data.weekends || ''))
    setField(form, 'Text20', String(data.additionalDays || ''))
    setField(form, 'Text24', String(data.totalDays || ''))
  }

  // Strip JS calculation actions + the AcroForm calc order.
  form.getFields().forEach(f => {
    f.acroField.dict.delete(PDFName.of('AA'))
  })
  form.acroForm.dict.delete(PDFName.of('CO'))

  // Shrink only the owner name field (field "1") on the main form via
  // auto-fit — that's the one widget that routinely blows past its 97px
  // width on real names. Every other admin field keeps its template-native
  // 10pt (or whatever it had) so short values like "N/A" and "Audi" don't
  // balloon up to fill the widget bounds.
  try {
    const ownerName = form.getTextField('1')
    ownerName.setFontSize(0)
  } catch { /* fine if missing */ }

  // Normalize date-slot font sizes. The template ships date1 at 13.011pt
  // and date2 at 13pt — mathematically close, but the appearance generator
  // produces visibly different output ("Date of Loss" value looked
  // smaller / thinner than "Date Unit Received" in render). Pin both to
  // the same explicit size.
  for (const name of ['date1', 'date2']) {
    try {
      form.getTextField(name).setFontSize(11)
    } catch { /* missing on HOURS template → fine */ }
  }

  // Per-widget DA: switch to embedded Times Roman, set color (black on main
  // form, white on cover), and paint the final Loss of Use ("Text16") red
  // to match the ACV's red total.
  const timesFontName = timesRoman.name
  const coverPageRef = doc.getPages()[0].ref
  const redDaColor = '0.75 0 0 rg'
  form.getFields().forEach(f => {
    const isLouTotal = f.getName() === 'Text16'
    f.acroField.getWidgets().forEach(w => {
      const onCover = w.P() === coverPageRef
      const newColor = isLouTotal ? redDaColor : onCover ? '1 1 1 rg' : '0 0 0 rg'
      const da = w.dict.get(PDFName.of('DA'))
      if (da) {
        let daStr = (da as PDFString).decodeText?.() ?? da.toString()
        daStr = daStr.replace(/\/\w+\s+([\d.]+)\s+Tf/, `/${timesFontName} $1 Tf`)
        const newDa = daStr
          .replace(/[\d.]+\s+[\d.]+\s+[\d.]+\s+rg/, newColor)
          .replace(/[\d.]+\s+g\b/, onCover && !isLouTotal ? '1 g' : '0 g')
        w.dict.set(PDFName.of('DA'), PDFString.of(newDa !== daStr ? newDa : `${newColor} ${daStr}`))
      } else {
        w.dict.set(PDFName.of('DA'), PDFString.of(`${newColor} /${timesFontName} 10 Tf`))
      }
    })
    const fieldDa = f.acroField.dict.get(PDFName.of('DA'))
    if (fieldDa) {
      let daStr = (fieldDa as PDFString).decodeText?.() ?? fieldDa.toString()
      daStr = daStr.replace(/\/\w+\s+([\d.]+)\s+Tf/, `/${timesFontName} $1 Tf`)
      const newDa = daStr
        .replace(/[\d.]+\s+[\d.]+\s+[\d.]+\s+rg/, isLouTotal ? redDaColor : '0 0 0 rg')
        .replace(/[\d.]+\s+g\b/, '0 g')
      f.acroField.dict.set(PDFName.of('DA'), PDFString.of(newDa))
    }
  })

  form.getFields().forEach(f => {
    try {
      const tf = form.getTextField(f.getName())
      tf.defaultUpdateAppearances(timesRoman)
    } catch { /* dropdowns — skip */ }
  })

  // Flatten so the resulting PDF is static (no editable fields).
  form.flatten()

  // ── Post-flatten patches ──────────────────────────────────────────────────

  const mainPage = doc.getPages()[1]
  const { height: pageH } = mainPage.getSize()

  // 1. DAYS template ships with the wrong main-page title ("Actual Cash
  //    Value (ACV)" instead of "Loss of Use Report (LOV)"). Cover and
  //    redraw. HOURS template is already correct.
  if (variant === 'days') {
    mainPage.drawRectangle({
      x: 350,
      y: pageH - 70,
      width: 245,
      height: 40,
      color: rgb(1, 1, 1),
    })
    mainPage.drawText('Loss of Use Report (LOV)', {
      x: 360,
      y: pageH - 55,
      font: timesRomanBold,
      size: 16,
      color: rgb(0, 0, 0),
    })
  }

  // 2. Additional Notes block — bare header + wrapped text sitting in the
  //    bottom-left area beside the signature. No drawn border — the
  //    template already provides the cell outline, and layering our own
  //    rectangle on top produced a double-border + overhang. Text is
  //    aligned with the page content column (x=20) and sits below the
  //    "Loss of Use" row divider.
  const notesText = (data.notes && data.notes.trim()) || DEFAULT_LOU_NOTE
  const notesX = 20
  const notesTopY = 95
  // Header + underline.
  mainPage.drawText('Additional Notes', {
    x: notesX,
    y: notesTopY,
    font: timesRomanBold,
    size: 10,
    color: rgb(0, 0, 0),
  })
  const headerW = timesRomanBold.widthOfTextAtSize('Additional Notes', 10)
  mainPage.drawLine({
    start: { x: notesX, y: notesTopY - 2 },
    end: { x: notesX + headerW, y: notesTopY - 2 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  })
  // Wrapped body text, flowing down from just below the header.
  const wrapped = wrapText(notesText, timesRoman, 9, 470)
  let noteY = notesTopY - 14
  for (const line of wrapped.slice(0, 5)) {
    mainPage.drawText(line, {
      x: notesX,
      y: noteY,
      font: timesRoman,
      size: 9,
      color: rgb(0, 0, 0),
    })
    noteY -= 11
  }

  // 3. Close the gaps in the "Modern File # ______ Ins Claim # ______"
  //    header line. The template draws labels at y=684 that extend from
  //    x=114 to x=493 (long underscore runs with a trailing stray "_").
  //    Cover the ENTIRE line with white and redraw tight, CENTERED on the
  //    page so the row is visually symmetrical. The rect is sized generously
  //    so no stray glyphs leak around the edges.
  const headerLineY = 686
  mainPage.drawRectangle({
    x: 90,
    y: 676,
    width: 440,
    height: 22,
    color: rgb(1, 1, 1),
  })
  const headerSize = 12
  const labelFont = timesRoman
  const valueFont = timesRomanBold
  // Explicit pt-level gaps instead of counting spaces. GAP is label→value
  // (small, so the value hugs its label); SEP is the gap between the two
  // "Label value" pairs (large, so MA# and Ins Claim # don't look touching).
  const GAP = 6
  const SEP = 32
  const maLabel = 'Modern File #'
  const clLabel = 'Ins Claim #'
  const maNum = data.maNumber || ''
  const clNum = data.claimNumber || ''
  const maLabelW = labelFont.widthOfTextAtSize(maLabel, headerSize)
  const maNumW = valueFont.widthOfTextAtSize(maNum, headerSize)
  const clLabelW = labelFont.widthOfTextAtSize(clLabel, headerSize)
  const clNumW = valueFont.widthOfTextAtSize(clNum, headerSize)
  const rowW = maLabelW + GAP + maNumW + SEP + clLabelW + GAP + clNumW
  const { width: pageW } = mainPage.getSize()
  let hx = (pageW - rowW) / 2
  mainPage.drawText(maLabel, { x: hx, y: headerLineY, font: labelFont, size: headerSize, color: rgb(0, 0, 0) })
  hx += maLabelW + GAP
  mainPage.drawText(maNum, { x: hx, y: headerLineY, font: valueFont, size: headerSize, color: rgb(0, 0, 0) })
  hx += maNumW + SEP
  mainPage.drawText(clLabel, { x: hx, y: headerLineY, font: labelFont, size: headerSize, color: rgb(0, 0, 0) })
  hx += clLabelW + GAP
  mainPage.drawText(clNum, { x: hx, y: headerLineY, font: valueFont, size: headerSize, color: rgb(0, 0, 0) })

  return doc.save()
}
