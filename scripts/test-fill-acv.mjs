import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const OUT = 'C:/Users/Owner/Downloads/acv-test-filled.pdf'

const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()
form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

function setField(name, value) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP')))
  } catch { /* skip */ }
}

// Matches Henry's actual claim data from the screenshot so gap fix is verifiable
setField('Modern file #', '3939420')
setField('Ins Claim #', '000830909230')
setField('Date of Loss', '06/20/2026')
setField('Date2_af_date', '09/08/2026')
setField('Client', 'SEDGWICK')
setField('Owner Name', 'Lisa Sobel')
setField('complete vehicle information', '2022 Land Rover Range Rover Sport')
setField('VIN', 'SALWS2RU7NA202544')
setField('mileage', '74,728')

const out = await doc.save()
fs.writeFileSync(OUT, out)
console.log(`Wrote ${OUT} (${out.length} bytes)`)
