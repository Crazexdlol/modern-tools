// One-off transform: reads an insurance-companies CSV (external system export
// with heavy HTML entities + wall-of-text guidelines), decodes entities,
// detects structural markers (ALL-CAPS headings, numbered lists, bullets),
// and writes out a 2-column CSV (Insurance Company, Guidelines) that
// imports cleanly via the HamsPortal guidelines importer.
//
// Usage:
//   node scripts/transform-guidelines.mjs <input.csv> <output.csv>

import fs from 'node:fs'
import Papa from 'papaparse'

// ---------- HTML entity decode ----------
const HTML_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&ldquo;': '“',   // left double quote
  '&rdquo;': '”',   // right double quote
  '&lsquo;': '‘',   // left single quote
  '&rsquo;': '’',   // right single quote
  '&ndash;': '–',   // en dash
  '&mdash;': '—',   // em dash
  '&bull;': '•',    // bullet
  '&hellip;': '…',  // ellipsis
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&deg;': '°',
  '&cent;': '¢',
  '&pound;': '£',
  '&euro;': '€',
  '&sect;': '§',
  '&para;': '¶',
  '&middot;': '·',
  '&laquo;': '«',
  '&raquo;': '»',
  '&frac12;': '½',
  '&frac14;': '¼',
  '&frac34;': '¾',
}

function decodeHtml(s) {
  let out = s
  for (const [k, v] of Object.entries(HTML_ENTITIES)) {
    out = out.split(k).join(v)
  }
  // Numeric entities: &#123; or &#x1A;
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
  return out
}

// ---------- Guidelines reformatter ----------
// Common section markers seen in insurance guidelines. Order matters — longer
// phrases first so "TOTAL LOSS" wins over just "TOTAL". Only promoted to a
// heading when actually followed by a colon (strong "this is a heading, not
// mid-prose" signal). Short acronyms like CCC, OEM, IPDS are deliberately
// NOT here to avoid false positives.
const KNOWN_SECTIONS = [
  'IPDS ESTIMATE REQUIREMENTS',
  'USAA APD FLOOD GUIDELINES',
  'SPECIALTY VEHICLES',
  'PARTS USAGE',
  'STRUCTURAL TOTAL LOSS',
  'TOTAL LOSS',
  'ESTIMATE HEADER',
  'ESTIMATING',
  'PARTS',
  'PHOTOS',
  'BILLING',
  'BETTERMENT',
  'GLASS REPLACEMENT',
  'PAINT & FUEL SAMPLE',
  'FLOOD DAMAGED VEHICLES',
  'STOLEN AND RECOVERY VEHICLES',
  'STOLEN AND RECOVERY',
  'LIGHTNING STRUCK VEHICLES',
  'VIN TAG REPLACEMENT',
  'WHEEL ALIGNMENTS',
  'SUPPLEMENTS',
  'SUPPLEMENT PROCESS',
  'ADDITIONAL CONSIDERATIONS',
  'ADDITIONAL PAINT AND MATERIALS',
  'REMOVAL AND REINSTALLATION',
  'PAINT BLENDING',
  'PAINT TINTING',
  'PRE- AND POST-SCANS',
  'PRE AND POST SCANS',
  'MECHANICAL LABOR RATES',
  'FRAME REPAIRS',
  'CORROSION PROTECTION',
  'CHIP GUARD',
  'CHIP GUARD/TEXTURED REFINISHING',
  'COVERING THE VEHICLE',
  'DETAILING THE VEHICLE',
  'FEATHER, PRIME AND BLOCK',
  'FLEX ADDITIVE',
  'HAZARDOUS WASTE REMOVAL',
  'MISC. NUTS & BOLTS',
  'ANTIFREEZE',
  'BLUE PRINTING',
  'COLOR, SAND & BUFF',
  'ALUMINUM',
  'A/C SYSTEMS',
  'TOWING & STORAGE',
  'APPEARANCE ALLOWANCE',
  'UNDERCOATING',
  'TWO-TONE REFINISHING',
  'RAW PLASTIC PREP',
  'REFINISH',
  'SUBLET PAYMENTS',
  'SEAM SEALER',
  'FIRST PARTY',
  'THIRD PARTY',
  'FIRST PARTY (INSURED) PARTS USAGE GUIDELINES',
  'THIRD PARTY (NON-INSURED) PARTS USAGE GUIDELINES',
  'RECONDITIONED/REMANUFACTURED PARTS',
  'OEM RECYCLED PARTS',
  'NON-OEM PARTS',
  'HAIL',
  'HAIL / PDR',
  'HAIL PDR',
]

function reformatGuidelines(raw) {
  // 1. Decode entities. Also normalize weird Unicode spaces.
  let t = decodeHtml(raw).replace(/ /g, ' ')

  // 2. Collapse runs of spaces/tabs but keep newlines.
  t = t.replace(/[ \t]+/g, ' ')

  // 3. Bullet characters → newline + "- "
  t = t.replace(/[•○◦▪▫⁃]\s*/g, '\n- ')

  // 4. Numbered list markers "1)" or "1." after whitespace → newline + "N. "
  //    Guard against decimals ("1.5") by requiring a space after.
  t = t.replace(/(^|\s)(\d{1,2})\)\s+/g, '$1\n$2. ')
  //    Also convert "1. Item ... 2. Item" runs — split at ` N. ` when a number
  //    follows a space and is followed by an uppercase letter / word char.
  t = t.replace(/(?<=[.:;)\s])(\d{1,2})\.\s+(?=[A-Z(])/g, '\n$1. ')

  // 5. Known section markers → paragraph break + "# HEADING" heading.
  //    ONLY promote when the marker is followed by a colon (real heading
  //    signal). Prose mentions without a colon get left alone.
  //    Longest first so "TOTAL LOSS" wins over "TOTAL" if both matched.
  const sorted = KNOWN_SECTIONS.slice().sort((a, b) => b.length - a.length)
  for (const s of sorted) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s.!?;])${escaped}\\s*:\\s*`, 'g')
    t = t.replace(re, (_m, pre) => `${pre === '\n' ? '' : pre}\n\n# ${s}\n\n`)
  }

  // 6. Mixed-case "Something Header:" or "Something Guidelines:" patterns —
  //    common as section titles. Convert to subheading.
  t = t.replace(/(^|\s)(Estimate Header|Total Loss Guidelines|Paint Guidelines|Parts Guidelines):\s*/g,
    '$1\n\n## $2\n\n')

  // 6b. Title-Case section headers commonly used in guidelines (no colon,
  //     used as inline topic labels between paragraphs of prose). We only
  //     promote when: (a) the phrase is in this exact whitelist AND (b) it's
  //     preceded by a period + space (sentence boundary) AND (c) followed by
  //     a capital-letter word (start of next sentence). Prevents mangling
  //     any prose that happens to contain these words.
  const MIXED_SECTIONS = [
    'Appearance Allowance',
    'Towing & Storage',
    'A/C Systems',
    'Additional Paint and Materials',
    'Two-Tone Refinishing',
    'Undercoating/Rustproofing',
    'Blue Printing Estimate Fees',
    'Blue Printing',
    'Chip Guard/Textured Refinishing',
    'Color, Sand & Buff',
    'Corrosion Protection/E-coat',
    'Corrosion Protection',
    'Covering the Vehicle',
    'Detailing the Vehicle after Repairs',
    'Detailing the Vehicle',
    'Feather, Prime and Block',
    'Flex Additive for Plastic Panels',
    'Frame Repairs',
    'Glass Replacement',
    'Hazardous Waste Removal',
    'Mechanical Labor Rates',
    'Misc. Nuts & Bolts',
    'Paint Blending',
    'Paint Tinting',
    'Pre- and Post-Scans',
    'Pre and Post Scans',
    'Raw Plastic Prep',
    'Refinish (Partial)',
    'Removal and Reinstallation (R & I) of Trim',
    'Removal and Reinstallation',
    'Seam Sealer/Caulk',
    'Seam Sealer',
    'Sublet Payments',
    'Supplement Process',
    'Wheel Alignments',
    'Stolen and Recovery Vehicles',
    'Flood Damaged Vehicles',
    'Lightning Struck Vehicles',
    'VIN Tag Replacement',
    'Structural Total Loss',
    'Total Losses',
    'OEM Recycled Parts',
    'Non-OEM Parts',
    'Reconditioned/Remanufactured Parts',
    'Aluminum',
    'Antifreeze',
    'Supplements',
    'Betterment',
    'Photos',
    'Parts',
    'Total Loss',
    'Additional Considerations for Certain Loss Types',
  ]
  const mixedSorted = MIXED_SECTIONS.slice().sort((a, b) => b.length - a.length)
  for (const s of mixedSorted) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Sentence-boundary match: preceded by ". " (period+space), followed by
    // a capital-letter word starting the next sentence. That's the signature
    // of these inline topic labels.
    const re = new RegExp(`\\.\\s+${escaped}(?=\\s+[A-Z])`, 'g')
    t = t.replace(re, `.\n\n## ${s}\n\n`)
  }

  // 7. Sentence boundaries help paragraph breaks:
  //    A period followed by a capitalized start-of-topic word gets a soft break.
  //    Conservative — only apply for a small set of transition phrases.
  const paraStarts = [
    'Photos', 'PARTS', 'TOTAL LOSS', 'Billing', 'Betterment', 'Any', 'Note that',
    'Please', 'DO NOT', 'IMPORTANT', 'NOTE',
  ]
  for (const w of paraStarts) {
    const re = new RegExp(`\\.\\s+(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s)`, 'g')
    t = t.replace(re, '.\n\n$1')
  }

  // 8. Collapse 3+ newlines to 2.
  t = t.replace(/\n{3,}/g, '\n\n')
  // Trim leading spaces on each line (except intentional list indentation).
  t = t.split('\n').map(line => line.replace(/^ +/, '')).join('\n')
  // Collapse repeated blank lines again.
  t = t.replace(/\n{3,}/g, '\n\n')

  return t.trim()
}

// ---------- CSV escape ----------
function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// ---------- Main ----------
const [,, inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: node transform-guidelines.mjs <input.csv> <output.csv>')
  process.exit(1)
}

const raw = fs.readFileSync(inputPath, 'utf-8')
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: 'greedy' })
if (parsed.errors.length) {
  console.error('CSV parse errors:')
  for (const e of parsed.errors) console.error(' ', e)
}

const out = []
let kept = 0
let skipped = 0
for (const row of parsed.data) {
  const name = (row.name || '').trim()
  const guidelines = (row.guidelines || '').trim()
  if (!name) { skipped++; continue }
  if (!guidelines) { skipped++; continue }
  const reformatted = reformatGuidelines(guidelines)
  out.push({ name, guidelines: reformatted })
  kept++
}

const headers = ['Insurance Company', 'Guidelines']
const lines = ['﻿' + headers.join(',')]
for (const r of out) {
  lines.push([r.name, r.guidelines].map(csvEscape).join(','))
}
fs.writeFileSync(outputPath, lines.join('\r\n') + '\r\n', 'utf-8')

console.log(`Read ${parsed.data.length} rows.`)
console.log(`Kept ${kept} with guidelines, skipped ${skipped} (empty or nameless).`)
console.log(`Wrote ${outputPath}`)
