import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib'

// Fixes the "MA# / Claim value pushed too far right" gap on the ACV cover page.
// Root cause: field-level Q=1 (center-align) on those two fields overrides the
// widget-level Q=0 override in some readers, centering the value inside the
// wide widget rectangle.
// Fix: delete the field-level Q so it defaults to 0 (left-align).
//
// IMPORTANT: use { updateFieldAppearances: false } on save so pdf-lib does NOT
// regenerate every widget's AP stream (that also normalizes fonts TiRo→Helvetica
// and can bake wrong colors — see 2026-09-08 SESSIONS entry).

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()

const fields = ['Modern file #', 'Ins Claim #']
for (const name of fields) {
  const field = form.getTextField(name)
  field.acroField.dict.delete(PDFName.of('Q'))
  field.acroField.getWidgets().forEach(w => {
    w.dict.set(PDFName.of('Q'), PDFNumber.of(0))
  })
  console.log(`[${name}] field-level Q removed, widget-level Q=0 set`)
}

const out = await doc.save({ updateFieldAppearances: false })
fs.writeFileSync(TEMPLATE, out)
console.log(`Wrote ${TEMPLATE} (${out.length} bytes)`)
