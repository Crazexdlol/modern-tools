// Preview every claim-type combination that includes Est Dispute. Imports
// the main preview module's buildPdf by inlining it (preview module is a
// script, not an ES export) — simpler to copy the mock + regenerate per
// combo than to refactor. Produces one PNG per combo in tmp/variants/.
//
// Combinations covered: 2^3 = 8 (ACV on/off × DV on/off × Storage on/off),
// each always with 'estimate' included.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

mkdirSync('tmp/variants', { recursive: true })

const combos = [
  { types: ['estimate'],                      slug: 'est-only' },
  { types: ['acv', 'estimate'],               slug: 'acv-est' },
  { types: ['dv', 'estimate'],                slug: 'dv-est' },
  { types: ['storage', 'estimate'],           slug: 'storage-est' },
  { types: ['acv', 'dv', 'estimate'],         slug: 'acv-dv-est' },
  { types: ['acv', 'storage', 'estimate'],    slug: 'acv-storage-est' },
  { types: ['dv', 'storage', 'estimate'],     slug: 'dv-storage-est' },
  { types: ['acv', 'dv', 'storage', 'estimate'], slug: 'acv-dv-storage-est' },
]

for (const combo of combos) {
  // Patch the preview-script's mock claimTypes, run it, rename outputs.
  const src = readFileSync('scripts/preview-assignment-sheet.mjs', 'utf8')
  const patched = src.replace(/claimTypes:\s*\[[^\]]*\]/, `claimTypes: ${JSON.stringify(combo.types)}`)
  writeFileSync('scripts/_tmp-variant.mjs', patched)
  // Run the patched copy.
  execSync('node scripts/_tmp-variant.mjs', { stdio: 'inherit' })
  // Copy the latest canonical outputs to a named variant file.
  const stamp = Date.now()
  const srcPdf = 'tmp/assignment-sheet-preview.pdf'
  const srcPng = 'tmp/assignment-sheet-preview.png'
  const dstPdf = `tmp/variants/${combo.slug}.pdf`
  const dstPng = `tmp/variants/${combo.slug}.png`
  writeFileSync(dstPdf, readFileSync(srcPdf))
  writeFileSync(dstPng, readFileSync(srcPng))
  console.log(`→ ${combo.slug}: ${dstPng}`)
}

// Cleanup the throwaway patch.
try { execSync('del scripts\\_tmp-variant.mjs', { stdio: 'ignore' }) } catch {}
