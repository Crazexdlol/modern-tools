// One-off: walk every PNG in public/logos/insurance/raw/, strip near-white
// background pixels to full transparency, and write the result alongside
// the original (without /raw) so the UI can reference them from a stable
// path. SVGs are copied as-is (already transparent by convention).

import { readdir, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename, extname } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = resolve(here, '..', 'public', 'logos', 'insurance', 'raw')
const outDir = resolve(here, '..', 'public', 'logos', 'insurance')

// Pixels this close to pure white become fully transparent. Pixels between
// FADE_THRESHOLD and WHITE_THRESHOLD get soft alpha so the edge doesn't
// pixelate. Values are tuned conservatively so colored elements that happen
// to contain near-white pixels don't vanish.
const WHITE_THRESHOLD = 245  // pure white, becomes alpha=0
const FADE_THRESHOLD  = 225  // start fading alpha from 255 → 0

async function stripPng(inPath, outPath) {
  const input = sharp(inPath).ensureAlpha()
  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) throw new Error(`${inPath}: expected 4-channel RGBA`)

  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2], a = out[i + 3]
    if (a === 0) continue
    const minChan = Math.min(r, g, b)
    if (minChan >= WHITE_THRESHOLD) {
      out[i + 3] = 0
    } else if (minChan >= FADE_THRESHOLD) {
      // Linear taper between FADE_THRESHOLD (alpha unchanged) and
      // WHITE_THRESHOLD (alpha → 0).
      const t = (minChan - FADE_THRESHOLD) / (WHITE_THRESHOLD - FADE_THRESHOLD)
      out[i + 3] = Math.round(a * (1 - t))
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const files = (await readdir(rawDir)).filter(f => !f.startsWith('.'))
  for (const file of files) {
    const inPath = resolve(rawDir, file)
    const ext = extname(file).toLowerCase()
    const base = basename(file, ext)
    const outPath = resolve(outDir, `${base}${ext}`)

    if (ext === '.svg') {
      await copyFile(inPath, outPath)
      console.log(`copied  ${file}`)
      continue
    }
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      await stripPng(inPath, outPath.replace(/\.jpe?g$/i, '.png'))
      console.log(`stripped ${file}`)
      continue
    }
    console.log(`skipped  ${file} (unknown ext)`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
