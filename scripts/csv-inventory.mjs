// One-off: inventory the sync CSV so we can design the sync script correctly.
import fs from 'node:fs'

const CSV = 'C:/Users/Owner/Downloads/Current-Claims26-09-11.csv'
const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '')

// Basic CSV parser that handles quoted fields with embedded commas + newlines
function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else { inQuotes = false }
      } else {
        cell += c
      }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else { cell += c }
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const rows = parseCSV(text).filter(r => r.length > 1)
const header = rows[0]
const data = rows.slice(1)
console.log(`Total data rows: ${data.length}`)
console.log(`Columns (${header.length}):`, header)

const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
const count = (col) => {
  const c = new Map()
  for (const r of data) {
    const v = (r[idx[col]] ?? '').trim()
    c.set(v, (c.get(v) ?? 0) + 1)
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}

console.log('\n=== appraiser breakdown ===')
for (const [v, n] of count('appraiser')) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(v)}`)

console.log('\n=== status breakdown ===')
for (const [v, n] of count('status')) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(v)}`)

console.log('\n=== phase breakdown ===')
for (const [v, n] of count('phase')) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(v)}`)

console.log('\n=== ass_type breakdown ===')
for (const [v, n] of count('ass_type')) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(v)}`)

console.log('\n=== First 5 assignment_ids ===')
for (const r of data.slice(0, 5)) console.log(' ', r[idx['assignment_id']])
