// One-off: render a proof of the estimate-variant Award PDF locally so we
// can eyeball the subtitle line before deploying.
import fs from 'fs'
import path from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const cwd = process.cwd()
const templateBytes = fs.readFileSync(path.join(cwd, 'public', 'award-template.pdf'))
const doc = await PDFDocument.load(templateBytes)
const form = doc.getForm()
const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

const fields = [
  ['Text1', '09/16/2026'],
  ['Text2', '8814912650000001-01'],
  ['Text3', 'Geico Ins. Co.'],
  ['Text4', 'Michael Chavez'],
  ['Text5', '2018 Lexus IS'],
  ['Text6', '05/15/2026'],
  ['undefined', '$9,250.00'],
  ['Date', '09/16/2026'],
  ['Date_2', '09/16/2026'],
  ['Text8', 'Alex Aleksanyan\nModern Appraisers'],
  ['Text9', 'Aaron Castillo\nTotal Loss Champions'],
]
for (const [name, value] of fields) {
  try {
    const f = form.getTextField(name)
    f.setText(value)
    f.defaultUpdateAppearances(timesRoman)
  } catch {}
}
form.flatten()

const page = doc.getPages()[0]
page.drawRectangle({ x: 78, y: 383, width: 300, height: 22, color: rgb(1, 1, 1) })
page.drawText('Amount of Loss - Final Cost of Repair', {
  x: 83, y: 389, size: 14, font: timesRoman, color: rgb(0, 0, 0),
})
page.drawText('(bring vehicle back to pre-loss condition)', {
  x: 83, y: 375, size: 10, font: timesRoman, color: rgb(0, 0, 0),
})
page.drawRectangle({ x: 74, y: 294, width: 340, height: 14, color: rgb(1, 1, 1) })

const out = path.join('C:', 'Users', 'Owner', 'Downloads', 'PROOF-award-estimate-v3.pdf')
const bytes = await doc.save()
fs.writeFileSync(out, bytes)
console.log(`wrote ${bytes.byteLength} bytes to ${out}`)
