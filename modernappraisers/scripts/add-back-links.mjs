// One-off: insert BackLink import + render block into each service detail
// page. Idempotent: skips any file that already has `BackLink` imported.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

// Each page gets its appropriate back target.
const PAGES = [
  { path: 'src/app/actualcashvalue/page.tsx',   href: '/righttoappraisal', label: 'Back to Right to Appraisal' },
  { path: 'src/app/diminishedvalue/page.tsx',   href: '/righttoappraisal', label: 'Back to Right to Appraisal' },
  { path: 'src/app/costofrepair/page.tsx',      href: '/righttoappraisal', label: 'Back to Right to Appraisal' },
  { path: 'src/app/lossofuse/page.tsx',         href: '/services',         label: 'Back to Services' },
  { path: 'src/app/storage/page.tsx',           href: '/services',         label: 'Back to Services' },
  { path: 'src/app/righttoappraisal/page.tsx',  href: '/services',         label: 'Back to Services' },
]

function render(href, label) {
  if (href === '/services' && label === 'Back to Services') {
    return `      <Container>\n        <BackLink />\n      </Container>\n`
  }
  return `      <Container>\n        <BackLink href="${href}" label="${label}" />\n      </Container>\n`
}

let updated = 0
let skipped = 0
for (const { path: rel, href, label } of PAGES) {
  const full = resolve(projectRoot, rel)
  let src = readFileSync(full, 'utf-8')

  if (src.includes("import { BackLink }")) {
    skipped++
    continue
  }

  // Insert import after the Container import.
  src = src.replace(
    /(import \{ Container \} from '@\/components\/container')/,
    `$1\nimport { BackLink } from '@/components/back-link'`,
  )

  // Insert the BackLink JSX right after `<main>`. Pages all have the same
  // shape: `return (\n    <main>\n      {/* Hero */}` or `<main>\n      <section`
  // We insert immediately after `<main>\n`.
  src = src.replace(
    /(\n    <main>\n)/,
    `$1${render(href, label)}`,
  )

  writeFileSync(full, src)
  updated++
}

console.log(`updated ${updated} files, skipped ${skipped}`)
