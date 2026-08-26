import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

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

function setDropdown(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
) {
  try {
    const field = form.getDropdown(name)
    if (field.getOptions().includes(value)) field.select(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* ignore */ }
}

export async function fillNotesPdf(data: NotesPdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'notes-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
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

  // Set DA (Default Appearance) on every field to use Times Roman
  form.getFields().forEach(f => {
    const da = `0 0 0 rg /${fontKey} 11 Tf`
    f.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
    f.acroField.getWidgets().forEach(w => {
      w.dict.set(PDFName.of('DA'), PDFString.of(da))
    })
  })

  // Header fields
  setField(form, 'Date7_af_date', fmtDate(data.date))
  setField(form, 'Text1', data.fileNumber)
  setField(form, 'Text2', data.claimNumber)
  setField(form, 'Text3', data.insuranceCompany)
  setField(form, 'Text4', data.vehicleOwner)
  setField(form, 'Text5', data.vehicle)
  setField(form, 'Date8_af_date', fmtDate(data.dateOfLoss))

  // Dropdown
  setDropdown(form, 'Dropdown9', data.dropdownValue)

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

  return doc.save()
}
