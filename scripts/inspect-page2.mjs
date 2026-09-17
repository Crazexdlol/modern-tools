import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFString, PDFRef } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()

const pages = doc.getPages()
console.log(`Doc has ${pages.length} pages\n`)

// Build a widget-ref -> field-name map
const widgetToField = new Map()
for (const field of form.getFields()) {
  if (!field.acroField.getWidgets) continue
  for (const w of field.acroField.getWidgets()) {
    widgetToField.set(w.ref?.tag ?? String(w.ref), { field, widget: w })
  }
}

for (let p = 0; p < pages.length; p++) {
  const page = pages[p]
  const pageHeight = page.getHeight()
  console.log(`=== PAGE ${p + 1} (${page.getWidth()} x ${pageHeight}) ===`)

  const annots = page.node.Annots?.()
  if (!annots) { console.log('  (no annotations)'); continue }

  const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])
  console.log(`  ${refs.length} annotations\n`)

  for (const ref of refs) {
    const obj = doc.context.lookup(ref)
    if (!obj) continue
    const subtype = obj.get?.(PDFName.of('Subtype'))
    if (!subtype || subtype.encodedName !== '/Widget') continue

    // Get field name by walking Parent chain OR reading T entry
    let t = obj.get(PDFName.of('T'))
    let ft = obj.get(PDFName.of('FT'))
    let parent = obj.get(PDFName.of('Parent'))
    while (!t && parent) {
      const p = doc.context.lookup(parent)
      t = p?.get(PDFName.of('T'))
      if (!ft) ft = p?.get(PDFName.of('FT'))
      parent = p?.get(PDFName.of('Parent'))
    }
    const fieldName = t instanceof PDFString ? t.asString() : (t?.value ?? '<no T>')
    const ftName = ft?.encodedName ?? String(ft)

    const rectNode = obj.get(PDFName.of('Rect'))
    const rectArr = rectNode?.asArray ? rectNode.asArray().map(n => n.asNumber?.() ?? Number(n)) : null
    const yFromTop = rectArr ? (pageHeight - rectArr[1] - (rectArr[3] - rectArr[1])) : null

    const wDA = obj.get(PDFName.of('DA'))
    const widgetDA = wDA instanceof PDFString ? wDA.asString() : null

    // Field-level DA — walk parent
    let fDA = null
    let cursor = obj.get(PDFName.of('Parent'))
    while (cursor) {
      const p = doc.context.lookup(cursor)
      const pDA = p?.get(PDFName.of('DA'))
      if (pDA instanceof PDFString) { fDA = pDA.asString(); break }
      cursor = p?.get(PDFName.of('Parent'))
    }
    // Field itself might have DA on the field-node with T
    if (!fDA) {
      const selfDA = obj.get(PDFName.of('DA'))
      if (selfDA instanceof PDFString) fDA = selfDA.asString()
    }

    const isWhite = (widgetDA && widgetDA.includes('1 1 1 rg')) ||
                    (widgetDA == null && fDA && fDA.includes('1 1 1 rg'))

    console.log(`  [${fieldName}] ${ftName ?? ''}  yFromTop=${yFromTop?.toFixed(1)}  x=${rectArr?.[0].toFixed(1)}  wDA=${JSON.stringify(widgetDA)}  fDA=${JSON.stringify(fDA)}  ${isWhite ? '*** WHITE ***' : ''}`)
  }
  console.log('')
}
