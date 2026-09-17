import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFString, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)

// Dump full AP stream text for widgets on page 2 that had white DA overwritten
const page2 = doc.getPage(1)
const annots = page2.node.Annots?.()
const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])

const wantNames = ['Modern file #', 'Ins Claim #', 'Date of Loss', 'Owner Name', 'VIN', 'mileage']
for (const ref of refs) {
  const obj = doc.context.lookup(ref)
  const subtype = obj?.get?.(PDFName.of('Subtype'))
  if (!subtype || subtype.encodedName !== '/Widget') continue

  let t = obj.get(PDFName.of('T'))
  let parent = obj.get(PDFName.of('Parent'))
  while (!t && parent) {
    const pp = doc.context.lookup(parent)
    t = pp?.get(PDFName.of('T'))
    parent = pp?.get(PDFName.of('Parent'))
  }
  const fieldName = t instanceof PDFString ? t.asString() : '<no T>'
  if (!wantNames.includes(fieldName)) continue

  const ap = obj.get(PDFName.of('AP'))
  if (!ap) { console.log(`[${fieldName}]  no AP\n`); continue }
  const nRef = ap.get?.(PDFName.of('N'))
  const nObj = doc.context.lookup(nRef)
  if (!(nObj instanceof PDFRawStream)) { console.log(`[${fieldName}]  AP.N not a stream\n`); continue }
  const decoded = decodePDFRawStream(nObj).decode()
  const streamText = new TextDecoder('latin1').decode(decoded)
  console.log(`=== PAGE 2 [${fieldName}]  AP.N stream ===`)
  console.log(streamText)
  console.log('---')
}
