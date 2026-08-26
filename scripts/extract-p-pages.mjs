// One-shot: extract text from Henry's CCC P-Pages PDF into a committed .txt
// Run manually when the P-Pages source updates:
//   node scripts/extract-p-pages.mjs "C:/Users/Owner/Desktop/CCC Estimate Guide - P Pages.pdf"
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { extractText } from 'unpdf'

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/extract-p-pages.mjs <path-to-p-pages.pdf>')
  process.exit(1)
}
const dest = 'src/lib/estimate-review/p-pages.txt'

const buf = readFileSync(src)
const { totalPages, text } = await extractText(new Uint8Array(buf), { mergePages: true })

mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, text, 'utf8')
console.log(`Extracted ${totalPages} pages, ${text.length.toLocaleString()} chars → ${dest}`)
