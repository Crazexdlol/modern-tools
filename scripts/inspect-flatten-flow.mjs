// Mimics the actual pdf-filler.ts fill flow (setField -> defaultUpdateAppearances)
// then inspects the generated widget /AP streams to see the text positioning
// pdf-lib bakes in. Text position in AP is what flatten() burns onto the page.
//
// If Q=0 (left-align) is being respected, the Td/Tm x-offset in the AP stream
// should be tiny (a few px padding from the left edge). If Q=1 (center-align)
// leaks through anywhere, the x-offset will be roughly (rect.width - textWidth)/2.

import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts, PDFStream, PDFRawStream, PDFContentStream } from 'pdf-lib'

const TEMPLATE = path.join(process.cwd(), 'public', 'acv-template.pdf')
const bytes = fs.readFileSync(TEMPLATE)
const doc = await PDFDocument.load(bytes)
const form = doc.getForm()
const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

// Mirror the actual setField() from pdf-filler.ts
function setField(name, value) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP')))
  } catch { /* skip */ }
}

setField('Modern file #', '3939420')
setField('Ins Claim #', '000830909230')
setField('Client', 'SEDGWICK')
setField('Owner Name', 'Lisa Sobel')
setField('complete vehicle information', '2022 Land Rover Range Rover Sport')
setField('Date of Loss', '06/20/2026')

// Same regen as pdf-filler.ts lines 226-256
form.getFields().forEach(f => {
  try {
    const tf = form.getTextField(f.getName())
    tf.defaultUpdateAppearances(timesRoman)
  } catch { /* not text */ }
})

// Now inspect widget /AP for our target fields (BEFORE flatten so we can read the stream)
const targets = [
  { name: 'Modern file #', label: 'MA#' },
  { name: 'Ins Claim #', label: 'CL#' },
  { name: 'Client', label: 'Client (control - works)' },
  { name: 'Owner Name', label: 'Insured (control - works)' },
  { name: 'Date of Loss', label: 'DOL (control - works)' },
]

for (const t of targets) {
  const field = form.getTextField(t.name)
  const widgets = field.acroField.getWidgets()
  widgets.forEach((w, i) => {
    const rect = w.getRectangle()
    if (rect.y > 700) return // skip small header widgets, only care about info block
    const ap = w.dict.get(PDFName.of('AP'))
    if (!ap) {
      console.log(`${t.label} w${i}: no /AP`)
      return
    }
    const n = ap.get(PDFName.of('N'))
    const stream = doc.context.lookup(n)
    if (!(stream instanceof PDFStream)) {
      console.log(`${t.label} w${i}: /AP/N is not a stream`)
      return
    }
    const bbox = stream.dict.get(PDFName.of('BBox'))
    let text = ''
    if (stream instanceof PDFContentStream) {
      // content stream: has operators/operands
      text = stream.getContentsString?.() ?? '(cannot decode)'
    } else if (stream.contents) {
      text = new TextDecoder().decode(stream.contents)
    } else if (typeof stream.getContents === 'function') {
      text = new TextDecoder().decode(stream.getContents())
    }
    console.log(`\n=== ${t.label} w${i} ===`)
    console.log(`  rect: x=${rect.x.toFixed(1)} y=${rect.y.toFixed(1)} w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)}`)
    console.log(`  bbox: ${bbox}`)
    console.log(`  /AP/N stream content:`)
    console.log(text.split('\n').map(l => '    ' + l).join('\n'))
  })
}
