// Fails build if the states data has structural issues. Runnable standalone
// or wired into `npm run lint`. Zero deps beyond Node + fs.
//
// What it checks:
//   - _index.ts contains exactly 48 entries
//   - No entry has slug 'massachusetts' or 'rhode-island'
//   - No duplicate slugs
//   - Every indexed slug has a matching data file at data/states/<slug>.ts
//   - No orphan data files (file exists but not in _index.ts)
//   - Each data file's intro is 50-120 words
//   - heroImage, when non-null, has all required fields
//   - No two states share the same hero image URL

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'src', 'data', 'states')
const INDEX_FILE = join(DATA_DIR, '_index.ts')

const EXCLUDED_SLUGS = new Set(['massachusetts', 'rhode-island'])
const EXPECTED_COUNT = 48
const INTRO_WORD_MIN = 50
const INTRO_WORD_MAX = 120

export function validate() {
  const errors = []
  const warnings = []

  if (!existsSync(INDEX_FILE)) {
    errors.push(`Missing index file: ${INDEX_FILE}`)
    return { errors, warnings }
  }

  const indexSrc = readFileSync(INDEX_FILE, 'utf8')
  const slugRegex = /slug:\s*'([a-z-]+)'/g
  const indexSlugs = []
  let m
  while ((m = slugRegex.exec(indexSrc)) !== null) indexSlugs.push(m[1])

  if (indexSlugs.length !== EXPECTED_COUNT) {
    errors.push(`Expected ${EXPECTED_COUNT} entries in _index.ts, found ${indexSlugs.length}.`)
  }

  const seen = new Set()
  for (const slug of indexSlugs) {
    if (seen.has(slug)) errors.push(`Duplicate slug in _index.ts: ${slug}`)
    seen.add(slug)
    if (EXCLUDED_SLUGS.has(slug)) errors.push(`Forbidden slug in _index.ts: ${slug}`)
  }

  for (const slug of indexSlugs) {
    const dataFile = join(DATA_DIR, `${slug}.ts`)
    if (!existsSync(dataFile)) {
      errors.push(`Missing data file for slug ${slug}: ${dataFile}`)
      continue
    }
    const src = readFileSync(dataFile, 'utf8')
    const introMatch = src.match(/intro:\s*(?:`([\s\S]*?)`|'([^']*)'|"([^"]*)")/)
    if (!introMatch) {
      errors.push(`${slug}: missing intro string`)
    } else {
      const intro = (introMatch[1] ?? introMatch[2] ?? introMatch[3] ?? '').trim()
      const words = intro.split(/\s+/).filter(Boolean).length
      if (words < INTRO_WORD_MIN || words > INTRO_WORD_MAX) {
        errors.push(`${slug}: intro has ${words} words, expected ${INTRO_WORD_MIN}-${INTRO_WORD_MAX}`)
      }
    }

    const heroNull = /heroImage:\s*null/.test(src)
    if (heroNull) {
      warnings.push(`${slug}: heroImage is null (placeholder in Phase 1)`)
    } else {
      for (const field of ['url', 'sourcePageUrl', 'author', 'license', 'attribution', 'verifiedAt']) {
        const re = new RegExp(`${field}:\\s*(?:'[^']+'|"[^"]+")`)
        if (!re.test(src)) {
          errors.push(`${slug}: heroImage missing field "${field}"`)
        }
      }
    }
  }

  const dataFiles = readdirSync(DATA_DIR).filter(f => f.endsWith('.ts') && f !== '_index.ts').map(f => f.replace(/\.ts$/, ''))
  for (const f of dataFiles) {
    if (!seen.has(f)) errors.push(`Orphan data file not in _index.ts: ${f}.ts`)
    if (EXCLUDED_SLUGS.has(f)) errors.push(`Forbidden data file exists: ${f}.ts`)
  }

  const heroUrlRegex = /url:\s*'(\/states\/[^']+)'/
  const heroUrls = new Map()
  for (const f of dataFiles) {
    const src = readFileSync(join(DATA_DIR, `${f}.ts`), 'utf8')
    const match = src.match(heroUrlRegex)
    if (match) {
      const url = match[1]
      if (heroUrls.has(url)) {
        errors.push(`Duplicate hero image URL ${url} used by both ${heroUrls.get(url)} and ${f}`)
      }
      heroUrls.set(url, f)
    }
  }

  return { errors, warnings }
}

// Standalone entrypoint.
if (process.argv[1]?.endsWith('validate-states.mjs')) {
  const { errors, warnings } = validate()
  for (const w of warnings) console.warn(`WARN: ${w}`)
  for (const e of errors) console.error(`ERROR: ${e}`)
  if (errors.length > 0) {
    console.error(`\nvalidate-states: ${errors.length} error(s), ${warnings.length} warning(s).`)
    process.exit(1)
  }
  console.log(`validate-states: 0 errors, ${warnings.length} warning(s).`)
}
