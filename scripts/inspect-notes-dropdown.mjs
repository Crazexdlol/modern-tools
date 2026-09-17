import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName } from 'pdf-lib'

const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'notes-template.pdf'))
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()
const dd = form.getDropdown('Dropdown9')
console.log('options:', dd.getOptions())
const widgets = dd.acroField.getWidgets()
for (const w of widgets) {
  const rect = w.getRectangle()
  console.log('widget rect:', rect)
}
