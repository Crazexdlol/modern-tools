// One-off: regenerate every HamsPortal icon/favicon from the master
// `public/hamsportal-logo.png` so there is exactly ONE source of truth for
// the brand mark. Overwrites in place.
//
// Usage: node scripts/regenerate-icons.mjs

import sharp from 'sharp'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const SRC = 'public/hamsportal-logo.png'

async function generate(sizeW, sizeH, out, { background = { r: 255, g: 255, b: 255, alpha: 1 } } = {}) {
  await sharp(SRC)
    .resize(sizeW, sizeH, { fit: 'contain', background })
    .png()
    .toFile(out)
  console.log(`✓ ${out} (${sizeW}×${sizeH})`)
}

async function main() {
  // 192×192 — manifest small icon + sw.js badge
  await generate(192, 192, 'public/favicon.png')

  // 512×512 — manifest install prompt icon (Chrome prefers 512 for install dialog)
  await generate(512, 512, 'public/hamsportal-logo-512.png')

  // 64×64 — Next.js app-router convention file (served at /icon.png)
  await generate(64, 64, 'src/app/icon.png')

  // Delete the legacy favicon.ico (Next's app/icon.png convention replaces it)
  // and the legacy /logo.jpg used only by the Modern Appraisers summary print.
  for (const legacy of ['src/app/favicon.ico', 'public/logo.jpg']) {
    if (existsSync(legacy)) {
      await unlink(legacy)
      console.log(`✗ deleted ${legacy}`)
    }
  }

  console.log('\nDone. All icons regenerated from hamsportal-logo.png.')
}

main().catch((err) => {
  console.error('regenerate-icons failed:', err)
  process.exit(1)
})
