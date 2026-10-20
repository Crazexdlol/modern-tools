// Targeted fixup for the em-dash sweep.
// The previous sweep replaced "—" with ", " indiscriminately, which broke
// number ranges like "$25–$75" → "$25, $75" (reads as a list, not a range).
// This script restores numeric ranges to use "to" (readable, no dash
// character per Henry's hard rule) and leaves genuine commas intact.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = resolve(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, out)
    else if (/\.(tsx?|md)$/.test(entry)) out.push(full)
  }
  return out
}

const targets = [
  ...walk(resolve(projectRoot, 'src/app')),
  ...walk(resolve(projectRoot, 'src/components')),
  resolve(projectRoot, 'src/lib/faq-content.ts'),
]

// Pattern fixes (ordered — first = most specific):
const fixes = [
  // $25, $75/day → $25 to $75/day
  { re: /(\$\d[\d,]*(?:\.\d+)?),\s+(\$\d[\d,]*(?:\.\d+)?)/g, replace: '$1 to $2' },
  // 10, 15% → 10 to 15%
  { re: /\b(\d+(?:\.\d+)?),\s+(\d+(?:\.\d+)?)%/g, replace: '$1 to $2%' },
  // 3, 5 business days / years / hours / minutes / days / weeks / months / miles
  { re: /\b(\d+(?:\.\d+)?),\s+(\d+(?:\.\d+)?)\s+(business days|days|years|hours|minutes|weeks|months|miles|hr|hrs|business hours)\b/g, replace: '$1 to $2 $3' },
  // "P1 to P5" style percentile ranges that got comma'd
  { re: /\b(P\d+),\s+(P\d+)\b/g, replace: '$1 to $2' },
  // Range: 60, 80% of OEM cost
  // Already covered by %-pattern above.
  // Title separator: "Something, Modern Appraisers" → "Something | Modern Appraisers"
  // (only when it's clearly a title string, i.e., inside a title: 'X, Modern Appraisers' context)
  { re: /title: ['"](.*?), Modern Appraisers['"]/g, replace: (m, pre) => `title: '${pre} | Modern Appraisers'` },
  // Range mid-sentence: "X, Y" where both sides are small numbers next to a unit word later
  // Covered by day/year/hour patterns above.
]

let changed = 0
for (const path of targets) {
  const orig = readFileSync(path, 'utf-8')
  let next = orig
  for (const { re, replace } of fixes) {
    next = next.replace(re, replace)
  }
  if (next !== orig) {
    writeFileSync(path, next)
    changed++
  }
}

console.log(`fixed ranges in ${changed} files`)
