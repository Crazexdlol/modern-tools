import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { normalizeCompanyKey } from '@/lib/supabase/insurance-guidelines'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'

const CANONICAL_HEADERS = {
  name:       ['insurance company', 'company', 'insurance co.', 'insurance co', 'insurer', 'name'],
  guidelines: ['guidelines', 'notes', 'guideline'],
} as const

type FieldKey = keyof typeof CANONICAL_HEADERS

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildHeaderMap(rawHeaders: string[]): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {}
  const normalized = rawHeaders.map(normalizeHeader)
  for (const key of Object.keys(CANONICAL_HEADERS) as FieldKey[]) {
    const aliases = CANONICAL_HEADERS[key] as readonly string[]
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) {
        result[key] = rawHeaders[i]
        break
      }
    }
  }
  return result
}

interface RowEval {
  rowNumber: number
  ok: boolean
  skipReason?: string
  action?: 'insert' | 'update'
  name?: string
  guidelinesPreview?: string
}

export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') !== 'false'
  const overwrite = url.searchParams.get('overwrite') === 'true'

  const body = await request.json().catch(() => null) as {
    headers?: unknown
    rows?: unknown
  } | null
  if (!body || !Array.isArray(body.headers) || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'Body must be { headers: string[], rows: string[][] }' }, { status: 400 })
  }
  const headers = (body.headers as unknown[]).map(h => String(h ?? ''))
  const rows = (body.rows as unknown[]).map(r => Array.isArray(r) ? (r as unknown[]).map(v => String(v ?? '')) : [])

  const headerMap = buildHeaderMap(headers)
  if (!headerMap.name || !headerMap.guidelines) {
    return NextResponse.json({
      error: `CSV is missing required column(s): ${
        [!headerMap.name && 'Insurance Company', !headerMap.guidelines && 'Guidelines']
          .filter(Boolean).join(', ')
      }`,
    }, { status: 400 })
  }

  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService
  const { data: existing, error: exErr } = await service
    .from('insurance_guidelines')
    .select('id, name_key')
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const existingKeys = new Map<string, string>() // name_key -> id
  for (const r of (existing ?? []) as { id: string; name_key: string }[]) {
    existingKeys.set(r.name_key, r.id)
  }

  const nameCol = headerMap.name
  const guidelinesCol = headerMap.guidelines

  const evaluations: RowEval[] = []
  const seenThisImport = new Set<string>()
  const toInsert: Array<{ id: string; name: string; name_key: string; guidelines: string }> = []
  const toUpdate: Array<{ id: string; name: string; name_key: string; guidelines: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowObj: Record<string, string> = {}
    headers.forEach((h, idx) => { rowObj[h] = row[idx] ?? '' })
    const ev: RowEval = { rowNumber: i + 1, ok: false }

    const rawName = (rowObj[nameCol] ?? '').trim()
    const guidelines = (rowObj[guidelinesCol] ?? '').trim()
    if (!rawName) { ev.skipReason = 'missing Insurance Company'; evaluations.push(ev); continue }
    if (!guidelines) {
      ev.skipReason = 'empty Guidelines column'
      ev.name = rawName
      evaluations.push(ev)
      continue
    }

    const nameKey = normalizeCompanyKey(rawName)
    if (seenThisImport.has(nameKey)) {
      ev.skipReason = `duplicate within CSV (${rawName})`
      ev.name = rawName
      evaluations.push(ev)
      continue
    }
    seenThisImport.add(nameKey)

    const existingId = existingKeys.get(nameKey)
    if (existingId && !overwrite) {
      ev.skipReason = `already exists (${rawName}) — enable Overwrite to replace`
      ev.name = rawName
      evaluations.push(ev)
      continue
    }

    ev.ok = true
    ev.name = rawName
    ev.action = existingId ? 'update' : 'insert'
    ev.guidelinesPreview = guidelines.slice(0, 120) + (guidelines.length > 120 ? '…' : '')
    evaluations.push(ev)
    if (existingId) toUpdate.push({ id: existingId, name: rawName, name_key: nameKey, guidelines })
    else            toInsert.push({ id: crypto.randomUUID(), name: rawName, name_key: nameKey, guidelines })
  }

  const summary = {
    total: evaluations.length,
    toInsert: toInsert.length,
    toUpdate: toUpdate.length,
    skipped: evaluations.filter(e => !e.ok).length,
  }

  if (dryRun) {
    return NextResponse.json({
      summary,
      preview: evaluations.slice(0, 20),
    })
  }

  // Actual write.
  const nowIso = new Date().toISOString()
  let inserted = 0
  let updated = 0
  const errors: Array<{ rowNumber: number; error: string }> = []

  if (toInsert.length > 0) {
    const { error } = await service.from('insurance_guidelines').insert(
      toInsert.map(t => ({
        ...t,
        created_at: nowIso,
        updated_at: nowIso,
        created_by: caller!.userId,
        updated_by: caller!.userId,
      })),
    )
    if (error) errors.push({ rowNumber: 0, error: error.message })
    else inserted = toInsert.length
  }

  for (const t of toUpdate) {
    const { error } = await service
      .from('insurance_guidelines')
      .update({
        name: t.name,
        name_key: t.name_key,
        guidelines: t.guidelines,
        updated_at: nowIso,
        updated_by: caller!.userId,
      })
      .eq('id', t.id)
    if (error) errors.push({ rowNumber: 0, error: error.message })
    else updated++
  }

  return NextResponse.json({
    summary: { ...summary, inserted, updated, errors: errors.length },
    errors,
  })
}
