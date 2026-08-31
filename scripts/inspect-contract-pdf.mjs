// One-off inspector: lists AcroForm fields in the ACV contract template by
// page + Y position so we can map auto-generated field names ("Text Box 1_5")
// to their visual labels. Run: node scripts/inspect-contract-pdf.mjs
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const pdfPath = path.join(process.cwd(), 'public', 'acv-contract-template.pdf')
const bytes = fs.readFileSync(pdfPath)
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()
const pages = pdf.getPages()

const rows = []
for (const field of form.getFields()) {
  const name = field.getName()
  const type = field.constructor.name
  for (const widget of field.acroField.getWidgets()) {
    const rect = widget.getRectangle()
    const pageRef = widget.P()
    let pageIndex = -1
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref === pageRef) { pageIndex = i; break }
    }
    rows.push({ name, type, page: pageIndex + 1, x: rect.x, y: rect.y })
  }
}
// Sort by page ascending, then Y descending (top-of-page first), then X ascending.
rows.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
for (const r of rows) {
  console.log(`p${r.page}  y=${r.y.toFixed(0).padStart(4)}  x=${r.x.toFixed(0).padStart(4)}  ${r.type.padEnd(14)} ${r.name}`)
}
