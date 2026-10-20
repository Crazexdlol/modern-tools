import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { readTemplate } from '@/lib/pdf/template-path'

export interface NotesPdfData {
  date: string
  fileNumber: string
  claimNumber: string
  insuranceCompany: string
  vehicleOwner: string
  vehicle: string
  dateOfLoss: string
  comments: string
  dropdownValue: string
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
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
  } catch { /* field may not exist */ }
}

// Capture Dropdown9's widget rectangle and blank it out before flatten so we
// can freely overlay our own label text. The template's dropdown option list
// is fixed (ACV / DV / Cost of Repair boilerplate) — Henry now wants a
// uniform "Right To Appraisal - X" label that isn't in the option list, so
// dropping the dropdown and drawing the text as flattened content is the
// cleanest way to get consistent phrasing across all variants.
function captureAndBlankDropdown(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
): { x: number; y: number; width: number; height: number } | null {
  try {
    const field = form.getDropdown(name)
    const widgets = field.acroField.getWidgets()
    if (widgets.length === 0) return null
    const rect = widgets[0].getRectangle()
    // Blank the selection so nothing gets baked in when we flatten.
    if (field.getOptions().includes(' ')) field.select(' ')
    widgets.forEach(w => { w.dict.delete(PDFName.of('AP')) })
    return rect
  } catch {
    return null
  }
}

export async function fillNotesPdf(companySlug: string, data: NotesPdfData): Promise<Uint8Array> {
  const templateBytes = readTemplate(companySlug, 'notes-template.pdf')
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  // Embed Times Roman and set as default font for all fields
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
  const fontKey = 'F_TimesRoman'
  const resources = form.acroForm.dict.lookup(PDFName.of('DR')) as any
  if (resources) {
    const fontDict = resources.lookup?.(PDFName.of('Font')) as any
    if (fontDict) {
      fontDict.set(PDFName.of(fontKey), timesRoman.ref)
    }
  }

  // Set DA (Default Appearance) on every field to use Times Roman at 11pt
  // so the font family lands even on fields that have no explicit widget-
  // level DA baked in.
  form.getFields().forEach(f => {
    const da = `0 0 0 rg /${fontKey} 11 Tf`
    f.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
    f.acroField.getWidgets().forEach(w => {
      w.dict.set(PDFName.of('DA'), PDFString.of(da))
    })
  })

  // Shrink the long-form Comments field (Text6) one point smaller than the
  // header fields. Field rectangle, position, font family, and every other
  // field stay untouched — only the per-field point size changes. ~3-4
  // more lines of narrative fit in the same box, so longer closing notes
  // stop getting cut off at the bottom of the template's fixed Text6 area
  // without needing a new template or a layout rebuild (Henry 2026-10-18).
  // Must be called AFTER the global DA loop above — that loop overwrites
  // DA on every field including Text6, so setFontSize has to run last.
  try {
    form.getTextField('Text6').setFontSize(10)
  } catch { /* template missing Text6 — fall back to default size */ }

  // Header fields
  setField(form, 'Date7_af_date', fmtDate(data.date))
  setField(form, 'Text1', data.fileNumber)
  setField(form, 'Text2', data.claimNumber)
  setField(form, 'Text3', data.insuranceCompany)
  setField(form, 'Text4', data.vehicleOwner)
  setField(form, 'Text5', data.vehicle)
  setField(form, 'Date8_af_date', fmtDate(data.dateOfLoss))

  // Capture the dropdown's rect and blank it so we can overlay a free-form
  // label after flattening (see helper for why we bypass the dropdown).
  const ddRect = captureAndBlankDropdown(form, 'Dropdown9')

  // Comments
  setField(form, 'Text6', data.comments)

  // Remove JavaScript calculation actions
  form.getFields().forEach(f => {
    f.acroField.dict.delete(PDFName.of('AA'))
  })
  form.acroForm.dict.delete(PDFName.of('CO'))

  // Ensure every field has a proper appearance before flattening — pdf-lib's
  // flatten() bakes the current appearance stream into page content, and any
  // fields we cleared AP on above would render blank otherwise.
  form.getFields().forEach(f => {
    try { form.getTextField(f.getName()).defaultUpdateAppearances(timesRoman) } catch { /* not a text field */ }
  })

  // Flatten so values print as static text (no editable form fields).
  form.flatten()

  // Overlay the label at the dropdown's original position. Whiteout first so
  // any residual widget appearance (border etc.) is covered, then draw at a
  // baseline that visually matches the other Times Roman fields on the row.
  if (ddRect && data.dropdownValue) {
    const page = doc.getPages()[0]
    page.drawRectangle({
      x: ddRect.x, y: ddRect.y,
      width: ddRect.width, height: ddRect.height,
      color: rgb(1, 1, 1),
    })
    page.drawText(data.dropdownValue, {
      x: ddRect.x + 3,
      y: ddRect.y + 6,
      size: 11,
      font: timesRoman,
      color: rgb(0, 0, 0),
    })
  }

  return doc.save()
}
