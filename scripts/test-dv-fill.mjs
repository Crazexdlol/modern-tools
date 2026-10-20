import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib'

const path = 'public/companies/modern-appraisers/templates/dv-templates/dv-nationwide-sedgwick.pdf'
const bytes = readFileSync(path)
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
const form = doc.getForm()
const helvetica = await doc.embedFont(StandardFonts.Helvetica)

const fields = [
  ['file.0.0', 'MA-TEST-123'],
  ['claim #', 'CL-999'],
  ['date', '09/30/2026'],
  ['Client Name', 'Jane Smith'],
  ['VIN', '1HGBH41JXMN109186'],
  ['vehicle', '2020 Honda Civic'],
  ['mileage', '35,000'],
  ['Fair Purchase Price', '12,345.00'], // should stay blue
]

for (const [name, value] of fields) {
  const field = form.getTextField(name)
  field.setText(value)
  const currentDA = field.acroField.getDefaultAppearance() ?? ''
  if (/\b1\s+1\s+1\s+(rg|RG)\b/.test(currentDA)) {
    const fixedDA = currentDA
      .replace(/\b1\s+1\s+1\s+rg\b/g, '0 g')
      .replace(/\b1\s+1\s+1\s+RG\b/g, '0 G')
    field.acroField.setDefaultAppearance(fixedDA)
    console.log(`${name}: DA ${JSON.stringify(currentDA)} → ${JSON.stringify(fixedDA)}`)
  } else {
    console.log(`${name}: DA ${JSON.stringify(currentDA)} (unchanged)`)
  }
  field.defaultUpdateAppearances(helvetica)
}

form.flatten()
writeFileSync('scripts/_dv-test.pdf', await doc.save())
console.log('\nwrote scripts/_dv-test.pdf — open and verify page 1 shows filled values in black')
