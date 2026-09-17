// Dumps ALL text-drawing ops on page 1 with x-positions so we can see the
// exact label strings (colons, spacing) and compare to widget rect.x.

import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib'
import zlib from 'node:zlib'

const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'acv-template.pdf'))
const doc = await PDFDocument.load(bytes)
const page = doc.getPage(0)
const pageH = page.getHeight()

function decodeStream(s) {
  const raw = s.contents ?? s.getContents?.()
  if (!raw) return ''
  const filter = s.dict.get(PDFName.of('Filter'))
  const filterName = filter?.encodedName ?? (filter?.array?.[0]?.encodedName)
  if (filterName === '/FlateDecode') {
    try { return zlib.inflateSync(Buffer.from(raw)).toString('binary') } catch { return '' }
  }
  return new TextDecoder().decode(raw)
}

const contents = page.node.Contents()
const streams = contents instanceof PDFArray
  ? contents.asArray().map(r => doc.context.lookup(r))
  : [doc.context.lookup(contents) ?? contents]

for (let idx = 0; idx < streams.length; idx++) {
  const s = streams[idx]
  if (!s) continue
  const text = decodeStream(s)
  const lines = text.split(/[\r\n]/)
  let inText = false
  let currentTm = null
  let currentTd = { x: 0, y: 0 }
  let currentFont = null
  let currentSize = null
  for (const line of lines) {
    const t = line.trim()
    if (t === 'BT') { inText = true; currentTd = { x: 0, y: 0 }; currentTm = null; continue }
    if (t === 'ET') { inText = false; continue }
    if (!inText) continue

    const tm = t.match(/([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm\b/)
    if (tm) { currentTm = { x: parseFloat(tm[5]), y: parseFloat(tm[6]) }; continue }
    const td = t.match(/([\d.\-]+)\s+([\d.\-]+)\s+T[dD]\b/)
    if (td) { currentTd.x += parseFloat(td[1]); currentTd.y += parseFloat(td[2]); continue }
    const tf = t.match(/\/(\w+)\s+([\d.]+)\s+Tf\b/)
    if (tf) { currentFont = tf[1]; currentSize = parseFloat(tf[2]); continue }

    const tjLit = t.match(/\((.*?)\)\s*(Tj|'|")\b/)
    const tjHex = t.match(/<([0-9A-Fa-f\s]+)>\s*(Tj|'|")\b/)
    const tjArr = t.match(/\[(.*?)\]\s*TJ\b/)
    let str = null
    if (tjLit) str = tjLit[1]
    else if (tjHex) {
      const hex = tjHex[1].replace(/\s+/g, '')
      str = ''
      for (let i = 0; i < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
    } else if (tjArr) {
      const chunks = [...tjArr[1].matchAll(/\((.*?)\)|<([0-9A-Fa-f\s]+)>/g)]
      str = chunks.map(c => {
        if (c[1] != null) return c[1]
        const hex = c[2].replace(/\s+/g, '')
        let ss = ''
        for (let i = 0; i < hex.length; i += 2) ss += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
        return ss
      }).join('')
    }
    if (str) {
      const x = (currentTm?.x ?? 0) + currentTd.x
      const y = (currentTm?.y ?? 0) + currentTd.y
      // only page-1 info-block region (y ~ 300 to 550 in PDF coords, roughly)
      if (y >= 250 && y <= 560) {
        console.log(`  Font=${currentFont}/${currentSize}  x=${x.toFixed(1)}  y=${y.toFixed(1)} (yTop=${(pageH - y).toFixed(1)})  text=${JSON.stringify(str)}`)
      }
    }
  }
}
