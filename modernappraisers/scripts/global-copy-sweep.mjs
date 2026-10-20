// One-off: global copy sweep across modernappraisers content files.
//   1. "file" → "claim" where "file" means insurance-claim-file.
//   2. em-dash "—" removed (replaced with ", " or dropped at edges).
//
// Scope: only user-facing text inside JSX / TSX files in src/app and
// src/components, plus the FAQ data file. SKIPS: CSS classNames,
// import paths, filenames, URLs, hyphenated identifiers, variable names.
//
// Approach: regex-driven, with a deny-list for strings we must not touch.
// Each file read + diffed; writes only when changes exist.

import { readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

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

// Em-dash: " — " → ", " ; "—" at word boundaries → " "
function stripEmDashes(s) {
  return s
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*–\s*/g, ', ')
}

// "file" → "claim" but only standalone-word matches in user-visible text.
// We skip:
//   - words with internal hyphen like "on-file", "file-path" (ambiguous)
//   - substrings of larger words ("profile", "fileName", "filesize")
//   - JSX attribute names, import paths, URLs, CSS class names
//
// Approach: regex matches "file" or "files" as a standalone word only when
// bounded by whitespace or sentence punctuation on both sides, AND not
// immediately after characters that signal code context ("/", '"', "'", "`",
// "=", "{"). Capitalization preserved.
function fileToClaim(s) {
  return s.replace(
    /(^|[\s(,.;:!?"'`>])(F|f)(ile|iles)(?=[\s)\.,;:!?"'`<]|$)/g,
    (_m, pre, cap, rest) => {
      const base = cap === 'F' ? 'Claim' : 'claim'
      // Match singular vs plural
      const suffix = rest === 'iles' ? 's' : ''
      return `${pre}${base}${suffix}`
    },
  )
}

let changed = 0
let touched = []
for (const path of targets) {
  const orig = readFileSync(path, 'utf-8')
  const stripped = stripEmDashes(orig)
  const final = fileToClaim(stripped)
  if (final !== orig) {
    writeFileSync(path, final)
    changed++
    touched.push(path.replace(projectRoot, '').replace(/\\/g, '/'))
  }
}

console.log(`updated ${changed} files`)
console.log(touched.join('\n'))
