import fs from 'node:fs'
import { PDFDocument, PDFName } from 'pdf-lib'

async function count(pathStr, label) {
  const doc = await PDFDocument.load(fs.readFileSync(pathStr))
  const pages = doc.getPages()
  for (let p = 0; p < pages.length; p++) {
    const annots = pages[p].node.Annots?.()
    if (!annots) continue
    const refs = annots.asArray ? annots.asArray() : (annots.array ?? [])
    let widgets = 0, withAP = 0
    for (const ref of refs) {
      const obj = doc.context.lookup(ref)
      const subtype = obj?.get?.(PDFName.of('Subtype'))
      if (!subtype || subtype.encodedName !== '/Widget') continue
      widgets++
      if (obj.get(PDFName.of('AP'))) withAP++
    }
    console.log(`${label} page ${p + 1}: ${withAP}/${widgets} widgets have AP`)
  }
}
await count('C:/Users/Owner/AppData/Local/Temp/acv-head.pdf', 'HEAD')
console.log()
await count('public/acv-template.pdf', 'CURRENT')
