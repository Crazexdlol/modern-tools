// One-off: reads public/companies/eagleview/logo.png and produces a "-on-dark"
// variant where every dark pixel (all RGB channels < 80) becomes white with the
// original alpha preserved. This keeps the gold/orange VIEW text + eagle icon
// intact while making the black EAGLE letters + shield visible on the dark
// header (bg-gray-950). Idempotent — safe to re-run.
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const INPUT  = join(HERE, '..', 'public', 'companies', 'eagleview', 'logo.png')
const OUTPUT = join(HERE, '..', 'public', 'companies', 'eagleview', 'logo-on-dark.png')

const img = sharp(INPUT).ensureAlpha()
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
if (info.channels !== 4) throw new Error(`expected RGBA, got ${info.channels} channels`)

// Every pixel: if RGB are all dark (< 80), replace with white.
// Preserves gold VIEW (R~230, G~185, B~30) and orange eagle (R~250, G~140, B~40).
const buf = Buffer.from(data)
const DARK = 80
for (let i = 0; i < buf.length; i += 4) {
  const r = buf[i], g = buf[i + 1], b = buf[i + 2]
  if (r < DARK && g < DARK && b < DARK) {
    buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255
  }
}

const png = await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
writeFileSync(OUTPUT, png)
console.log(`wrote ${OUTPUT}  ${info.width}x${info.height}`)
