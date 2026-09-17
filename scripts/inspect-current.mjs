import fs from 'node:fs'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
const doc = await PDFDocument.load(fs.readFileSync('public/acv-template.pdf'))
for (let p = 0; p < doc.getPages().length; p++) {
  const page = doc.getPage(p)
  const annots = page.node.Annots?.()
  if (!annots) continue
  const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])
  let whiteCount = 0, total = 0
  for (const ref of refs) {
    const obj = doc.context.lookup(ref)
    const st = obj?.get?.(PDFName.of('Subtype'))
    if (!st || st.encodedName !== '/Widget') continue
    total++
    let t = obj.get(PDFName.of('T'))
    let parent = obj.get(PDFName.of('Parent'))
    while (!t && parent) {
      const pp = doc.context.lookup(parent)
      t = pp?.get(PDFName.of('T'))
      parent = pp?.get(PDFName.of('Parent'))
    }
    const wDA = obj.get(PDFName.of('DA'))
    const widgetDA = wDA instanceof PDFString ? wDA.asString() : null
    let fDA = null
    let cursor = obj.get(PDFName.of('Parent'))
    while (cursor) {
      const pp = doc.context.lookup(cursor)
      const pDA = pp?.get(PDFName.of('DA'))
      if (pDA instanceof PDFString) { fDA = pDA.asString(); break }
      cursor = pp?.get(PDFName.of('Parent'))
    }
    const effective = widgetDA ?? fDA
    if (effective && effective.includes('1 1 1 rg')) whiteCount++
  }
  console.log(`CURRENT page ${p + 1}: ${whiteCount}/${total} widgets have white text`)
}
