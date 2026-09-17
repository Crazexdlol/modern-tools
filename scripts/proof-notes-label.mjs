// One-off: render a proof of the closing notes with the new "Right To
// Appraisal - X" label so we can eyeball position/size before deploy.
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts, rgb } from 'pdf-lib'

const templateBytes = fs.readFileSync(path.join(process.cwd(), 'public', 'notes-template.pdf'))
const doc = await PDFDocument.load(templateBytes)
const form = doc.getForm()
form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)
const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
const fontKey = 'F_TimesRoman'
const resources = form.acroForm.dict.lookup(PDFName.of('DR'))
if (resources) {
  const fontDict = resources.lookup?.(PDFName.of('Font'))
  if (fontDict) fontDict.set(PDFName.of(fontKey), timesRoman.ref)
}
form.getFields().forEach(f => {
  const da = `0 0 0 rg /${fontKey} 11 Tf`
  f.acroField.dict.set(PDFName.of('DA'), PDFString.of(da))
  f.acroField.getWidgets().forEach(w => { w.dict.set(PDFName.of('DA'), PDFString.of(da)) })
})

function setField(name, value) {
  try {
    const f = form.getTextField(name)
    f.setText(value)
    f.acroField.getWidgets().forEach(w => { w.dict.delete(PDFName.of('AP')) })
  } catch {}
}

setField('Date7_af_date', '09/16/2026')
setField('Text1', '3949236')
setField('Text2', '8814912650000001-01')
setField('Text3', 'Geico Ins. Co.')
setField('Text4', 'Michael Chavez')
setField('Text5', '2018 Lexus IS')
setField('Date8_af_date', '05/15/2026')
setField('Text6', 'Sample closing notes comment block.')

const dd = form.getDropdown('Dropdown9')
const rect = dd.acroField.getWidgets()[0].getRectangle()
if (dd.getOptions().includes(' ')) dd.select(' ')
dd.acroField.getWidgets().forEach(w => { w.dict.delete(PDFName.of('AP')) })

form.getFields().forEach(f => {
  f.acroField.dict.delete(PDFName.of('AA'))
})
form.acroForm.dict.delete(PDFName.of('CO'))

form.getFields().forEach(f => {
  try { form.getTextField(f.getName()).defaultUpdateAppearances(timesRoman) } catch {}
})

form.flatten()

const label = 'Right To Appraisal - Cost of Repair'
const page = doc.getPages()[0]
page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, color: rgb(1, 1, 1) })
page.drawText(label, {
  x: rect.x + 3,
  y: rect.y + 6,
  size: 11,
  font: timesRoman,
  color: rgb(0, 0, 0),
})

const out = path.join('C:', 'Users', 'Owner', 'Downloads', 'PROOF-notes-rta.pdf')
fs.writeFileSync(out, await doc.save())
console.log(`wrote proof to ${out}`)
console.log(`dropdown rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`)
