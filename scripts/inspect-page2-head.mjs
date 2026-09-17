import fs from 'node:fs'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'

const TEMPLATE = 'C:/Users/Owner/AppData/Local/Temp/acv-head.pdf'
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)

const pages = doc.getPages()
for (let p = 0; p < pages.length; p++) {
  const page = pages[p]
  const pageHeight = page.getHeight()
  console.log(`=== HEAD PAGE ${p + 1} ===`)
  const annots = page.node.Annots?.()
  if (!annots) continue
  const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])
  let whiteCount = 0
  let totalCount = 0
  for (const ref of refs) {
    const obj = doc.context.lookup(ref)
    const subtype = obj?.get?.(PDFName.of('Subtype'))
    if (!subtype || subtype.encodedName !== '/Widget') continue
    totalCount++
    let t = obj.get(PDFName.of('T'))
    let parent = obj.get(PDFName.of('Parent'))
    while (!t && parent) {
      const pp = doc.context.lookup(parent)
      t = pp?.get(PDFName.of('T'))
      parent = pp?.get(PDFName.of('Parent'))
    }
    const fieldName = t instanceof PDFString ? t.asString() : '<no T>'
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
    const rectNode = obj.get(PDFName.of('Rect'))
    const rectArr = rectNode?.asArray ? rectNode.asArray().map(n => n.asNumber?.() ?? Number(n)) : null
    const yFromTop = rectArr ? (pageHeight - rectArr[1] - (rectArr[3] - rectArr[1])) : null
    const effective = widgetDA ?? fDA
    const isWhite = effective && effective.includes('1 1 1 rg')
    if (isWhite) whiteCount++
    if (isWhite) console.log(`  *** WHITE *** [${fieldName}] yFromTop=${yFromTop?.toFixed(1)}  wDA=${JSON.stringify(widgetDA)} fDA=${JSON.stringify(fDA)}`)
  }
  console.log(`  Page ${p + 1}: ${whiteCount}/${totalCount} widgets have white text`)
  console.log('')
}
