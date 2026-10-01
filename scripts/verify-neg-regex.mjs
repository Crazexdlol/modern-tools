// Standalone regex sanity-check. No DB. Run:  node scripts/verify-neg-regex.mjs
// Imports the production source directly via tsx-free dynamic import after
// hand-compiling the exact regex copies here (keeps the script zero-dep).

const stripSubjectNoise = (subject) => {
  if (!subject) return ''
  let out = subject
  let prev = ''
  const prefix = /^\s*(?:\[(?:spam|external|ext|secure)\]|fwd|fw|re)\s*:?\s*/i
  while (out !== prev) { prev = out; out = out.replace(prefix, '') }
  return out.trim()
}

const MA_REGEX = /\bMA[\s\-#:.]*\d{3,8}\b/gi
const CL_REGEX = /\bCL[\s\-#:.]*(\d{4,15})\b/gi
const EV_REGEX = /\b(?:2[2-9]\d{4}|3\d{5})\b/g
const LABELED_ID_REGEX = /(?:claim\s*(?:#|no\.?|number|id)?|file\s*(?:#|no\.?|number))\s*:?\s*([A-Z0-9][A-Z0-9\-]{4,20})/gi

function extractIdentifiers(text) {
  const src = stripSubjectNoise(text || '')
  const nums = new Set()
  for (const m of src.matchAll(MA_REGEX)) {
    const d = m[0].replace(/^MA/i, '').replace(/[\s\-#:.]/g, '')
    if (d.length >= 3) nums.add(d)
  }
  for (const m of src.matchAll(CL_REGEX)) nums.add((m[1] || '').toUpperCase())
  for (const m of src.matchAll(EV_REGEX)) nums.add(m[0])
  for (const m of src.matchAll(LABELED_ID_REGEX)) {
    const raw = (m[1] || '').toUpperCase()
    if (raw.length >= 5) nums.add(raw)
  }
  return Array.from(nums)
}

const CASES = [
  { subj: '[SPAM] Re: [SPAM] RIF-KOSA CONSTRUCTION LLC | 2015 Land Rover Range Rover Evoque | File # 3971247 | Claim # CA0021715171-02',
    expect: ['3971247', 'CA0021715171-02'] },
  { subj: 'RE: Amber Aiton | 2021 Ford F-150 Lariat | CL# 4683005 | MA# 3950817',
    expect: ['3950817', '4683005'] },
  { subj: 'Re: GREGORY GALE | 2017 JAYCO M-213 JAY FEATHER | File # 3951773 | Claim # 000830291050',
    expect: ['3951773', '000830291050'] },
  { subj: 'Fwd: GREGORY GALE | 2017 JAYCO M-213 | File # 3951773 | Claim # 000830291050',
    expect: ['3951773', '000830291050'] },
  { subj: 'Fwd: unrelated marketing update',
    expect: [] },
]

let failures = 0
for (const c of CASES) {
  const got = extractIdentifiers(c.subj)
  const missing = c.expect.filter(e => !got.includes(e))
  const ok = missing.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.subj.slice(0, 80)}${c.subj.length > 80 ? '…' : ''}"`)
  console.log(`      extracted: [${got.join(', ')}]  missing: [${missing.join(', ')}]`)
  if (!ok) failures++
}
console.log(failures === 0 ? '\nAll regex cases pass.' : `\n${failures} case(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
