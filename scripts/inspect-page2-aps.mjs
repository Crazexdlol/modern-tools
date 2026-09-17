import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFString, PDFRawStream, PDFDict, decodePDFRawStream } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)

const pages = doc.getPages()

for (let p = 0; p < pages.length; p++) {
  const page = pages[p]
  console.log(`=== PAGE ${p + 1} — widgets with AP streams ===`)
  const annots = page.node.Annots?.()
  if (!annots) continue
  const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])
  let apCount = 0
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

    const ap = obj.get(PDFName.of('AP'))
    if (!ap) continue
    apCount++
    const nRef = ap.get?.(PDFName.of('N'))
    const nObj = doc.context.lookup(nRef)
    let streamText = null
    if (nObj instanceof PDFRawStream) {
      try {
        const decoded = decodePDFRawStream(nObj).decode()
        streamText = new TextDecoder('latin1').decode(decoded).substring(0, 200)
      } catch (e) { streamText = `(decode failed: ${e.message})` }
    }
    // Look for color-set commands in the AP stream
    const hasWhite = streamText && (streamText.includes('1 1 1 rg') || streamText.includes('1 g'))
    const hasBlack = streamText && (streamText.includes('0 0 0 rg') || streamText.includes('0 g'))
    console.log(`  [${fieldName}]  AP present  ${hasWhite ? '*** WHITE IN AP ***' : ''}  ${hasBlack ? '(black in AP)' : ''}`)
    if (streamText) console.log(`    stream first 200 chars: ${JSON.stringify(streamText.substring(0, 200))}`)
  }
  console.log(`  Total widgets with AP: ${apCount}\n`)
}
