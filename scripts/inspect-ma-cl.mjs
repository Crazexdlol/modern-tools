import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFString, PDFNumber, PDFDict, PDFArray } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()

const page1 = doc.getPage(0)
const pageHeight = page1.getHeight()

// Compare the "broken" widgets against "working" ones
const compare = [
  { name: 'Modern file #', label: 'MA# — BROKEN (gap)' },
  { name: 'Ins Claim #', label: 'Claim — BROKEN (gap)' },
  { name: 'Client', label: 'Client — WORKS' },
  { name: 'Owner Name', label: 'Insured — WORKS' },
  { name: 'complete vehicle information', label: 'Vehicle — WORKS' },
  { name: 'Date of Loss', label: 'DOL — WORKS' },
]

for (const t of compare) {
  const field = form.getTextField(t.name)
  console.log(`=== ${t.label}  (field name: "${t.name}") ===`)

  // Field-level properties
  const fieldDict = field.acroField.dict
  const q = fieldDict.get(PDFName.of('Q'))
  const ff = fieldDict.get(PDFName.of('Ff'))
  const maxLen = fieldDict.get(PDFName.of('MaxLen'))
  const da = fieldDict.get(PDFName.of('DA'))
  console.log(`  field Q (quad): ${q?.asNumber ? q.asNumber() : q}`)
  console.log(`  field Ff (flags): ${ff?.asNumber ? ff.asNumber() : ff}`)
  console.log(`  field MaxLen: ${maxLen?.asNumber ? maxLen.asNumber() : maxLen}`)
  console.log(`  field DA: ${da instanceof PDFString ? da.asString() : da}`)

  const widgets = field.acroField.getWidgets()
  widgets.forEach((w, i) => {
    const rect = w.getRectangle()
    const yFromTop = pageHeight - rect.y - rect.height
    const wq = w.dict.get(PDFName.of('Q'))
    const wff = w.dict.get(PDFName.of('Ff'))
    const wda = w.dict.get(PDFName.of('DA'))
    const wmk = w.dict.get(PDFName.of('MK'))
    console.log(`  widget ${i}: yFromTop=${yFromTop.toFixed(1)} rect=(${rect.x.toFixed(1)}, ${rect.y.toFixed(1)}, ${rect.width.toFixed(1)}, ${rect.height.toFixed(1)})`)
    console.log(`    Q: ${wq?.asNumber ? wq.asNumber() : wq}`)
    console.log(`    Ff: ${wff?.asNumber ? wff.asNumber() : wff}`)
    console.log(`    DA: ${wda instanceof PDFString ? wda.asString() : wda}`)
    console.log(`    MK: ${wmk}`)
  })
  console.log('')
}
