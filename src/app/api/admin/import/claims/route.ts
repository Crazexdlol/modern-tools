import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'

// Header names the importer accepts (case-insensitive, trimmed).
// Everything is normalized via `normalizeHeader` on lookup so users can pass
// "MA#", "MA #", "ma number" — they all map to the same field.
//
// Also supports common external-source formats: composite Vehicle from
// v_year/v_make/v_model, composite Owner from first/last, composite Address
// from address/city/state/zip. Extra optional fields (adjuster, phones,
// email, mileage, ZIP) are captured into the claim jsonb when present.
const CANONICAL_HEADERS = {
  // Core (required)
  maNumber:      ['ma #', 'ma#', 'ma number', 'manumber', 'assignment_id', 'assignment id'],
  insuredName:   ['insured', 'insured name', 'insuredname', 'insured_name'],
  vehicle:       ['vehicle'],

  // Vehicle components — composed into `vehicle` if `vehicle` column is absent
  vehicleYear:   ['v_year', 'year', 'vehicle year'],
  vehicleMake:   ['v_make', 'make'],
  vehicleModel: ['v_model', 'model'],

  // Optional claim fields
  claimNumber:   ['claim #', 'claim#', 'claim number', 'claimnumber', 'claim_number'],
  vin:           ['vin', 'v_vin'],
  insuranceCo:   ['insurance co.', 'insurance co', 'insurance company', 'insurer', 'insurance'],
  ownerName:     ['owner', 'owner name', 'ownername'],
  ownerFirst:    ['owner_first_name', 'owner first name', 'first name', 'first_name'],
  ownerLast:     ['owner_last_name',  'owner last name',  'last name',  'last_name'],
  ownerEmail:    ['owner_email', 'owner email'],
  ownerPhoneMobile: ['mobile_phone', 'mobile phone', 'cell', 'cell phone'],
  ownerPhoneHome:   ['home_phone', 'home phone'],
  ownerPhoneWork:   ['work_phone', 'work phone'],
  ownerPhone:    ['owner_phone', 'phone', 'owner phone'],
  ownerAddress:  ['owner_address', 'owner address', 'address'],
  ownerCity:     ['owner_city', 'city'],
  ownerState:    ['owner_state', 'state'],
  ownerZip:      ['owner_zip', 'zip', 'zipcode', 'zip code'],
  location:      ['location'],
  date:          ['date'],
  dateOfLoss:    ['date_of_loss', 'date of loss', 'loss date', 'dol'],
  adjuster:      ['adjuster', 'adjuster name', 'handling adjuster'],
  mileage:       ['v_mileage', 'mileage', 'odometer'],
  vehicleZip:    ['v_zip'],
  deductible:    ['deductible_amount', 'deductible'],
  policyNumber:  ['policy_number', 'policy number', 'policy #'],
  damage:        ['damage', 'damage area'],
  assignedTo:    ['assigned to', 'assignedto', 'appraiser', 'assignee'],
  status:        ['status'],
  acv:           ['acv amount', 'acv', 'value', 'acv value'],
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

interface RawRow { [key: string]: string }

interface RowEval {
  rowNumber: number       // 1-indexed by data row (header excluded)
  ok: boolean
  skipReason?: string
  warnings: string[]
  // Fields resolved for insertion (only meaningful when ok=true)
  maNumber?: string
  insuredName?: string
  vehicle?: string
  vin?: string | null
  claimNumber?: string
  insuranceCo?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  ownerAddress?: string
  location?: string
  date?: string           // ISO
  dateOfLoss?: string     // ISO
  adjuster?: string
  mileage?: number
  year?: number
  make?: string
  model?: string
  zip?: string
  deductible?: string
  policyNumber?: string
  damage?: string
  assignedTo?: string | null
  status?: 'open' | 'closed'
  acv?: number | null
}

function toIsoDate(v: string | undefined | null): string | null {
  if (!v) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function parseAcv(v: string | undefined | null): number | null {
  if (!v) return null
  const cleaned = v.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function normalizeStatus(v: string | undefined | null): 'open' | 'closed' {
  if (!v) return 'open'
  const t = v.trim().toLowerCase()
  if (t === 'closed' || t === 'close') return 'closed'
  return 'open'
}

// POST /api/admin/import/claims?dryRun=true
// Body: { headers: string[], rows: string[][] }  -- from client-side Papa.parse
// Returns:
//   {
//     headerMap: { field -> csvHeader },
//     unknownHeaders: string[],
//     evaluations: RowEval[],
//     duplicateMANumbers: string[],
//     unmatchedAssignees: string[],
//     summary: { toImport, skippedInvalid, skippedDuplicate, warnings }
//   }
//
// If dryRun=false, actually inserts the ok rows into acv_history.
export async function POST(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') !== 'false'

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
  const unknownHeaders = headers.filter(h => {
    const nh = normalizeHeader(h)
    return !Object.values(CANONICAL_HEADERS).some(aliases => (aliases as readonly string[]).includes(nh))
  }).filter(h => h.trim().length > 0)

  // Vehicle can be a single "vehicle" column OR composed from
  // v_year + v_make + v_model (external-source format).
  const hasComposableVehicle = !!(headerMap.vehicleYear || headerMap.vehicleMake || headerMap.vehicleModel)
  if (!headerMap.maNumber || !headerMap.insuredName || (!headerMap.vehicle && !hasComposableVehicle)) {
    return NextResponse.json({
      error: `CSV is missing required column(s): ${
        [
          !headerMap.maNumber && 'MA # (or assignment_id)',
          !headerMap.insuredName && 'Insured (or insured_name)',
          (!headerMap.vehicle && !hasComposableVehicle) && 'Vehicle (or v_year + v_make + v_model)',
        ].filter(Boolean).join(', ')
      }`,
    }, { status: 400 })
  }

  // Convert each row into a keyed object using the actual CSV header names.
  const keyed: RawRow[] = rows.map(r => {
    const obj: RawRow = {}
    headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
    return obj
  })

  // Scope every acv_history read/write to the admin's active company. Rows
  // get imported into that company; duplicate-MA# check only looks at that
  // company's existing rows so an MA# collision across companies is allowed.
  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService

  // Pull existing MA numbers for duplicate detection + profiles for assignee resolution.
  const [existingMAResult, profilesResult] = await Promise.all([
    service.from('acv_history').select('ma_number').not('ma_number', 'is', null),
    rawService.from('profiles').select('id, name, email'),
  ])
  if (existingMAResult.error) return NextResponse.json({ error: existingMAResult.error.message }, { status: 500 })
  if (profilesResult.error)   return NextResponse.json({ error: profilesResult.error.message }, { status: 500 })

  const existingMAs = new Set<string>(
    ((existingMAResult.data ?? []) as { ma_number: string | null }[])
      .map(r => (r.ma_number ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
  const profiles = (profilesResult.data ?? []) as { id: string; name: string | null; email: string }[]
  const emailToId = new Map<string, string>()
  const nameToIds = new Map<string, string[]>()
  for (const p of profiles) {
    emailToId.set(p.email.trim().toLowerCase(), p.id)
    const name = (p.name ?? '').trim().toLowerCase()
    if (name) {
      const arr = nameToIds.get(name) ?? []
      arr.push(p.id)
      nameToIds.set(name, arr)
    }
  }

  // Walk each row, producing an evaluation.
  const evaluations: RowEval[] = []
  const seenMAThisImport = new Set<string>()
  for (let i = 0; i < keyed.length; i++) {
    const row = keyed[i]
    const ev: RowEval = { rowNumber: i + 1, ok: false, warnings: [] }
    const get = (field: FieldKey) => (headerMap[field] ? (row[headerMap[field]!] ?? '').trim() : '')

    const maRaw = get('maNumber')
    const insured = get('insuredName')

    // Vehicle: use the single "vehicle" column if present, else compose
    // from year + make + model.
    let vehicle = get('vehicle')
    if (!vehicle) {
      const yr = get('vehicleYear')
      const mk = get('vehicleMake')
      const md = get('vehicleModel')
      vehicle = [yr, mk, md].filter(Boolean).join(' ').trim()
    }

    if (!maRaw) { ev.skipReason = 'missing MA #'; evaluations.push(ev); continue }
    if (!insured) { ev.skipReason = 'missing Insured'; evaluations.push(ev); continue }
    if (!vehicle) { ev.skipReason = 'missing Vehicle (or year/make/model)'; evaluations.push(ev); continue }

    const maKey = maRaw.toLowerCase()
    if (existingMAs.has(maKey)) { ev.skipReason = `duplicate (MA# ${maRaw} already exists)`; ev.maNumber = maRaw; evaluations.push(ev); continue }
    if (seenMAThisImport.has(maKey)) { ev.skipReason = `duplicate within this CSV (MA# ${maRaw})`; ev.maNumber = maRaw; evaluations.push(ev); continue }
    seenMAThisImport.add(maKey)

    // Optional fields
    const vin = get('vin') || null
    const claimNumber = get('claimNumber')
    const insuranceCo = get('insuranceCo')

    // Owner: single "owner" column OR first+last composite.
    let ownerName = get('ownerName')
    if (!ownerName) {
      const first = get('ownerFirst')
      const last = get('ownerLast')
      ownerName = [first, last].filter(Boolean).join(' ').trim()
    }
    const ownerEmail = get('ownerEmail')
    // Best phone: prefer mobile → home → work → generic phone.
    const ownerPhone =
      get('ownerPhoneMobile') || get('ownerPhoneHome') || get('ownerPhoneWork') || get('ownerPhone')

    // Address: single "owner_address" OR compose address + city, state zip.
    const addrLine = get('ownerAddress')
    const city = get('ownerCity')
    const st = get('ownerState')
    const zip = get('ownerZip')
    const ownerAddress = addrLine
      ? [addrLine, [city, st].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim()
      : [[city, st].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim()

    const location = get('location') || [city, st].filter(Boolean).join(', ')
    const dateRaw = get('date') || get('dateOfLoss')
    const dateOfLossRaw = get('dateOfLoss')
    const assigneeRaw = get('assignedTo')
    const statusRaw = get('status')
    const acvRaw = get('acv')

    const adjuster = get('adjuster')
    const mileageStr = get('mileage')
    const mileage = mileageStr ? Number(mileageStr.replace(/[,\s]/g, '')) : NaN
    const year = get('vehicleYear') ? Number(get('vehicleYear')) : NaN
    const make = get('vehicleMake')
    const model = get('vehicleModel')
    const vehicleZip = get('vehicleZip')
    const deductible = get('deductible')
    const policyNumber = get('policyNumber')
    const damage = get('damage')

    let dateIso: string
    if (dateRaw) {
      const parsed = toIsoDate(dateRaw)
      if (!parsed) {
        ev.warnings.push(`unrecognized date "${dateRaw}" — defaulted to today`)
        dateIso = new Date().toISOString()
      } else {
        dateIso = parsed
      }
    } else {
      dateIso = new Date().toISOString()
    }

    let assignedTo: string | null = null
    if (assigneeRaw) {
      const asEmail = emailToId.get(assigneeRaw.toLowerCase())
      if (asEmail) {
        assignedTo = asEmail
      } else {
        const asName = nameToIds.get(assigneeRaw.toLowerCase())
        if (asName && asName.length === 1) {
          assignedTo = asName[0]
        } else if (asName && asName.length > 1) {
          ev.warnings.push(`assignee "${assigneeRaw}" is ambiguous (${asName.length} users match) — imported unassigned`)
        } else {
          ev.warnings.push(`assignee "${assigneeRaw}" not found — imported unassigned`)
        }
      }
    }

    const acv = parseAcv(acvRaw)
    if (acvRaw && acv === null) ev.warnings.push(`could not parse ACV "${acvRaw}" — left blank`)

    const dateOfLossIso = dateOfLossRaw ? (toIsoDate(dateOfLossRaw) ?? undefined) : undefined

    ev.ok = true
    ev.maNumber = maRaw
    ev.insuredName = insured
    ev.vehicle = vehicle
    ev.vin = vin
    ev.claimNumber = claimNumber
    ev.insuranceCo = insuranceCo
    ev.ownerName = ownerName
    ev.ownerEmail = ownerEmail
    ev.ownerPhone = ownerPhone
    ev.ownerAddress = ownerAddress
    ev.location = location
    ev.date = dateIso
    ev.dateOfLoss = dateOfLossIso
    ev.adjuster = adjuster
    ev.mileage = Number.isFinite(mileage) ? mileage : undefined
    ev.year = Number.isFinite(year) ? year : undefined
    ev.make = make
    ev.model = model
    ev.zip = vehicleZip
    ev.deductible = deductible
    ev.policyNumber = policyNumber
    ev.damage = damage
    ev.assignedTo = assignedTo
    ev.status = normalizeStatus(statusRaw)
    ev.acv = acv
    evaluations.push(ev)
  }

  const toImport = evaluations.filter(e => e.ok)
  const skippedDuplicate = evaluations.filter(e => !e.ok && e.skipReason?.startsWith('duplicate')).length
  const skippedInvalid   = evaluations.filter(e => !e.ok && !e.skipReason?.startsWith('duplicate')).length
  const duplicateMANumbers = evaluations
    .filter(e => !e.ok && e.skipReason?.startsWith('duplicate') && e.maNumber)
    .map(e => e.maNumber!)
  const unmatchedAssignees = Array.from(new Set(
    evaluations.flatMap(e => e.warnings)
      .map(w => /^assignee "([^"]+)" (?:not found|is ambiguous)/.exec(w)?.[1])
      .filter((v): v is string => !!v),
  ))
  const warningCount = evaluations.reduce((sum, e) => sum + e.warnings.length, 0)

  const summary = {
    total: evaluations.length,
    toImport: toImport.length,
    skippedInvalid,
    skippedDuplicate,
    warnings: warningCount,
  }

  if (dryRun) {
    return NextResponse.json({
      headerMap,
      unknownHeaders,
      summary,
      duplicateMANumbers,
      unmatchedAssignees,
      preview: evaluations.slice(0, 8),
    })
  }

  // Actual insert. Chunk to avoid a single huge INSERT payload.
  const CHUNK = 100
  let imported = 0
  const errors: { rowNumber: number; error: string }[] = []
  for (let start = 0; start < toImport.length; start += CHUNK) {
    const chunk = toImport.slice(start, start + CHUNK)
    const nowIso = new Date().toISOString()
    const inserts = chunk.map(e => ({
      id: crypto.randomUUID(),
      user_id: caller!.userId,
      date: e.date!,
      mode: 'comp-finder',
      vehicle: e.vehicle!,
      vin: e.vin,
      ma_number: e.maNumber!,
      acv: e.acv,
      status: e.status!,
      assigned_to: e.assignedTo ?? null,
      assigned_at: e.assignedTo ? nowIso : null,
      claim: {
        maNumber:         e.maNumber,
        insuredName:      e.insuredName,
        clientName:       e.insuredName,
        clientType:       'Insured',
        claimNumber:      e.claimNumber || undefined,
        insuranceCompany: e.insuranceCo || undefined,
        ownerName:        e.ownerName || undefined,
        ownerEmail:       e.ownerEmail || undefined,
        ownerPhone:       e.ownerPhone || undefined,
        ownerAddress:     e.ownerAddress || undefined,
        location:         e.location || undefined,
        dateOfLoss:       e.dateOfLoss || undefined,
        adjuster:         e.adjuster || undefined,
        mileage:          e.mileage,
        year:             e.year,
        make:             e.make || undefined,
        model:            e.model || undefined,
        vin:              e.vin || undefined,
        zip:              e.zip || undefined,
        deductible:       e.deductible || undefined,
        policyNumber:     e.policyNumber || undefined,
        damage:           e.damage || undefined,
      },
      comps: [],
      adjustments: {},
      result: {},
      mileage_rate: 0,
    }))
    const { error } = await service.from('acv_history').insert(inserts)
    if (error) {
      // Chunk-level failure: Supabase rolled back the entire chunk. Retry
      // each row individually so we can isolate which row(s) actually
      // failed instead of falsely blaming all 100.
      for (let i = 0; i < inserts.length; i++) {
        const rowInsert = inserts[i]
        const eRow = chunk[i]
        const single = await service.from('acv_history').insert(rowInsert)
        if (single.error) {
          errors.push({ rowNumber: eRow.rowNumber, error: single.error.message })
        } else {
          imported++
        }
      }
    } else {
      imported += chunk.length
    }
  }

  return NextResponse.json({
    summary: { ...summary, imported, insertErrors: errors.length },
    errors,
  })
}
