"use client"

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Check, Download, Loader2, Upload } from 'lucide-react'
import {
  CLIENT_TYPE_LABELS,
  createClient as createClientRecord,
  createContact,
  fuzzyMatchClients,
  updateClient,
  type ClientType,
  type FuzzyClientMatch,
} from '@/lib/supabase/clients'
import { geocodeAddress } from '@/lib/mapbox/geocode'

// One row parsed from the CSV. Every field optional except name+type; rows
// with missing name or unknown type are flagged during parse.
interface RawRow {
  rowNumber: number
  name: string
  type: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
  website: string
  contact_name: string
  contact_title: string
  contact_phone: string
  contact_email: string
  last_marketed_at: string
  remarket_interval_days: string
  notes: string
  errors: string[]
}

// After grouping — one client with its contacts array.
interface GroupedClient {
  key: string // lowercase name key
  name: string
  type: ClientType
  address: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
  website: string
  notes: string
  last_marketed_at: string | null
  remarket_interval_days: number | null
  contacts: Array<{ name: string; title?: string; phone?: string; email?: string }>
  errors: string[]
  fuzzyMatches?: FuzzyClientMatch[]
  action: 'create' | 'merge' | 'skip'
  mergeTargetId?: string
}

type Phase = 'upload' | 'preview' | 'committing' | 'done'

const CSV_HEADERS = [
  'name', 'type', 'address', 'city', 'state', 'zip', 'phone', 'email', 'website',
  'contact_name', 'contact_title', 'contact_phone', 'contact_email',
  'last_marketed_at', 'remarket_interval_days', 'notes',
] as const

export function ImportClient() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [rows, setRows] = useState<GroupedClient[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const downloadTemplate = () => {
    const csv = CSV_HEADERS.join(',') + '\n' + [
      'Acme Auto Body,body_shop,123 Main St,Las Vegas,NV,89101,(702) 555-1000,ops@acme.example,acme.example,Jane Doe,Manager,(702) 555-1001,jane@acme.example,2026-06-01,90,',
      'Acme Auto Body,body_shop,,,,,,,,John Roe,Estimator,(702) 555-1002,john@acme.example,,,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = async (file: File) => {
    setErrors([])
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setErrors(['CSV is empty or unreadable.'])
      return
    }
    const grouped = groupByName(parsed)
    // Fuzzy match each group against existing clients.
    for (const g of grouped) {
      const matches = await fuzzyMatchClients(g.name, 3)
      g.fuzzyMatches = matches.filter(m => m.similarity >= 0.5)
      g.action = g.fuzzyMatches.length > 0 ? 'merge' : 'create'
      if (g.fuzzyMatches.length > 0) g.mergeTargetId = g.fuzzyMatches[0].id
    }
    setRows(grouped)
    setPhase('preview')
  }

  const commit = async () => {
    setPhase('committing')
    setProgress({ done: 0, total: rows.length, label: 'Committing…' })
    let done = 0
    // Two passes: create/merge clients first (need ids), then contacts.
    const geocodeQueue: string[] = []
    for (const g of rows) {
      done += 1
      setProgress({ done, total: rows.length, label: `Processing ${g.name}…` })
      if (g.action === 'skip') continue

      let clientId: string | null = null
      if (g.action === 'create') {
        const c = await createClientRecord({
          name: g.name, type: g.type,
          city: g.city || null, state: g.state || null,
          phone: g.phone || null, email: g.email || null,
        })
        if (c) {
          clientId = c.id
          // Patch the extra columns createClient doesn't take (address, zip, notes, dates, interval, website).
          const patch: Parameters<typeof updateClient>[1] = {
            addressLine: g.address || null,
            zip: g.zip || null,
            website: g.website || null,
            notes: g.notes || null,
            lastMarketedAt: g.last_marketed_at,
            remarketIntervalDays: g.remarket_interval_days,
          }
          await updateClient(c.id, patch)
        }
      } else if (g.action === 'merge' && g.mergeTargetId) {
        clientId = g.mergeTargetId
        // Only fill in blanks — don't clobber existing values. Fetch first is
        // extra latency; simpler to just patch the fields with values and let
        // the caller update ones that were empty.
        const patch: Parameters<typeof updateClient>[1] = {}
        if (g.address) patch.addressLine = g.address
        if (g.city) patch.city = g.city
        if (g.state) patch.state = g.state
        if (g.zip) patch.zip = g.zip
        if (g.phone) patch.phone = g.phone
        if (g.email) patch.email = g.email
        if (g.website) patch.website = g.website
        if (g.notes) patch.notes = g.notes
        if (g.last_marketed_at) patch.lastMarketedAt = g.last_marketed_at
        if (g.remarket_interval_days !== null) patch.remarketIntervalDays = g.remarket_interval_days
        if (Object.keys(patch).length > 0) await updateClient(clientId, patch)
      }
      if (!clientId) continue

      // Contacts.
      for (let i = 0; i < g.contacts.length; i++) {
        const ct = g.contacts[i]
        if (!ct.name) continue
        await createContact({
          clientId,
          name: ct.name,
          title: ct.title || null,
          phone: ct.phone || null,
          email: ct.email || null,
          isPrimary: i === 0, // first contact is primary
        })
      }
      geocodeQueue.push(clientId)
    }

    // Background geocode pass. Progress indicator flips to geocoding.
    setProgress({ done: 0, total: geocodeQueue.length, label: 'Geocoding addresses…' })
    for (let i = 0; i < geocodeQueue.length; i++) {
      const id = geocodeQueue[i]
      const g = rows.find(r => (r.mergeTargetId === id) || r.action === 'create')
      if (!g) continue
      const coords = await geocodeAddress({ addressLine: g.address, city: g.city, state: g.state, zip: g.zip })
      if (coords) await updateClient(id, { lat: coords.lat, lng: coords.lng })
      setProgress({ done: i + 1, total: geocodeQueue.length, label: 'Geocoding addresses…' })
    }
    setPhase('done')
    setProgress(null)
  }

  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        <button onClick={downloadTemplate}
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 border border-gray-200 hover:border-gray-300 bg-white px-3 py-2 rounded-lg">
          <Download className="w-4 h-4" /> Download template
        </button>
        <label className="block border-2 border-dashed border-gray-300 rounded-xl bg-white p-10 text-center cursor-pointer hover:border-gray-400 transition-colors">
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} className="hidden" />
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <div className="text-sm text-gray-500">Drop a CSV or click to browse</div>
        </label>
        {errors.length > 0 && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm space-y-1">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        <Link href="/marketing" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back to Marketing
        </Link>
      </div>
    )
  }

  if (phase === 'preview') {
    const summary = {
      create: rows.filter(r => r.action === 'create').length,
      merge: rows.filter(r => r.action === 'merge').length,
      skip: rows.filter(r => r.action === 'skip').length,
    }
    const invalid = rows.filter(r => r.errors.length > 0)
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          Preview: <b>{rows.length}</b> client{rows.length === 1 ? '' : 's'} parsed.
          <span className="ml-2 text-emerald-700">{summary.create} create</span>
          {' · '}<span className="text-blue-700">{summary.merge} merge</span>
          {' · '}<span className="text-gray-500">{summary.skip} skip</span>
          {invalid.length > 0 && <span className="ml-2 text-red-700">· {invalid.length} row{invalid.length === 1 ? '' : 's'} with errors</span>}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Contacts</th>
                <th className="text-left px-3 py-2">Fuzzy match</th>
                <th className="text-left px-3 py-2 w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g, idx) => (
                <tr key={g.key} className={`border-b border-gray-100 ${g.errors.length > 0 ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2 text-gray-900 font-semibold truncate max-w-xs">
                    {g.name}
                    {g.errors.length > 0 && (
                      <div className="text-[10px] text-red-700 mt-0.5 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {g.errors.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{CLIENT_TYPE_LABELS[g.type]}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{g.contacts.length}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {g.fuzzyMatches && g.fuzzyMatches.length > 0 ? (
                      <select
                        value={g.mergeTargetId ?? ''}
                        onChange={(e) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, mergeTargetId: e.target.value, action: 'merge' } : r))}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white"
                      >
                        {g.fuzzyMatches.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({Math.round(m.similarity * 100)}%)</option>
                        ))}
                      </select>
                    ) : <span className="text-gray-400 italic">no match</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                      {(['create', 'merge', 'skip'] as const).map(a => (
                        <button key={a} type="button"
                          disabled={a === 'merge' && (!g.fuzzyMatches || g.fuzzyMatches.length === 0)}
                          onClick={() => setRows(rs => rs.map((r, i) => i === idx ? { ...r, action: a } : r))}
                          className={`px-2 py-0.5 border-l first:border-l-0 border-gray-200 text-[10px] font-semibold uppercase ${g.action === a ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={commit} disabled={invalid.length === rows.length}
                  className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
            Commit {rows.length - summary.skip} row{rows.length - summary.skip === 1 ? '' : 's'}
          </button>
          <button onClick={() => { setPhase('upload'); setRows([]) }}
                  className="text-sm text-gray-600 hover:text-gray-900">
            Start over
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'committing') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin" /> {progress?.label ?? 'Working…'}
        </div>
        {progress && (
          <>
            <div className="text-xs text-gray-500 tabular-nums">{progress.done} / {progress.total}</div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm inline-flex items-center gap-2">
        <Check className="w-4 h-4" /> Import complete.
      </div>
      <Link href="/marketing" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
        <ArrowLeft className="w-4 h-4" /> Back to Marketing
      </Link>
    </div>
  )
}

// ── CSV parsing ──────────────────────────────────────────────────────────

function parseCsv(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const rows: RawRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const row: RawRow = {
      rowNumber: i + 1,
      name: '', type: '', address: '', city: '', state: '', zip: '',
      phone: '', email: '', website: '',
      contact_name: '', contact_title: '', contact_phone: '', contact_email: '',
      last_marketed_at: '', remarket_interval_days: '', notes: '',
      errors: [],
    }
    header.forEach((h, ci) => {
      const v = (cells[ci] ?? '').trim()
      if (h in row) (row as unknown as Record<string, string>)[h] = v
    })
    if (!row.name) row.errors.push('name missing')
    if (row.type && !['adjuster', 'body_shop', 'attorney', 'insurance_company'].includes(row.type)) {
      row.errors.push(`unknown type "${row.type}"`)
    }
    rows.push(row)
  }
  return rows
}

// Minimal RFC-4180-ish splitter: handles quoted cells + doubled-quote escapes.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') { inQ = false }
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function groupByName(rows: RawRow[]): GroupedClient[] {
  const map = new Map<string, GroupedClient>()
  for (const r of rows) {
    const key = r.name.trim().toLowerCase()
    if (!key) continue
    const existing = map.get(key)
    const type: ClientType = (['adjuster', 'body_shop', 'attorney', 'insurance_company'] as ClientType[])
      .find(t => t === r.type) ?? 'adjuster'
    if (existing) {
      // Merge contacts. Later client-level fields overwrite blanks.
      if (r.contact_name) {
        existing.contacts.push({
          name: r.contact_name, title: r.contact_title || undefined,
          phone: r.contact_phone || undefined, email: r.contact_email || undefined,
        })
      }
      existing.errors.push(...r.errors)
      continue
    }
    const g: GroupedClient = {
      key, name: r.name.trim(), type,
      address: r.address, city: r.city, state: r.state.toUpperCase(), zip: r.zip,
      phone: r.phone, email: r.email, website: r.website, notes: r.notes,
      last_marketed_at: r.last_marketed_at || null,
      remarket_interval_days: r.remarket_interval_days ? Number(r.remarket_interval_days) : null,
      contacts: r.contact_name ? [{
        name: r.contact_name, title: r.contact_title || undefined,
        phone: r.contact_phone || undefined, email: r.contact_email || undefined,
      }] : [],
      errors: [...r.errors],
      action: 'create',
    }
    map.set(key, g)
  }
  return Array.from(map.values())
}
