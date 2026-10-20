import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { defaultAdjustments } from '@/lib/acv/calculations'
import type { ClaimInfo, ClaimType } from '@/lib/acv/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/intake
// Public endpoint — accepts claim submissions from modernappraisers.com (or
// any other authorized intake surface) and creates a HAMS claim that lands
// unassigned in the "New Assignments" dashboard tab.
//
// Auth: shared-secret header X-Intake-Secret. The relaying site keeps the
// same secret in its own env and sets this header on every call. Without
// the header (or with a mismatched one) the request 401s before touching
// the DB.
//
// Attribution: user_id is the oldest admin profile (resolved on first
// request and cached). acv_history.user_id is NOT NULL + ON DELETE CASCADE,
// so it needs a real auth user; attributing to the admin treats web intake
// as if the admin created the claim. assigned_to stays null so the claim
// shows up on the "New Assignments" tab. Any admin can delete it from that
// tab if the submission is spam or a duplicate.
//
// MA# is DB-owned (BEFORE INSERT trigger assigns from the sequence), so we
// omit ma_number from the insert payload and let the trigger do its job.

// Cached admin user_id — resolved once per lambda, invalidated on process
// restart. Null until resolved; "" after a failed resolution so we don't
// re-query every request if the DB is empty.
let cachedAdminUserId: string | null | '' = null
let cachedCompanyId: string | null | '' = null

async function resolveIntakeUserId(service: ReturnType<typeof createServiceClient>): Promise<string | null> {
  if (cachedAdminUserId !== null) return cachedAdminUserId || null

  // Env override wins if set (useful for pinning intake to a specific admin
  // in multi-admin environments, or for tests).
  const envOverride = process.env.HAMS_INTAKE_USER_ID
  if (envOverride) {
    cachedAdminUserId = envOverride
    return envOverride
  }

  const { data, error } = await service
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.id) {
    console.error('[intake] could not resolve admin user_id:', error)
    cachedAdminUserId = ''
    return null
  }
  cachedAdminUserId = data.id
  return data.id
}

// acv_history.company_id is NOT NULL since the multi-company rollout. We
// attribute web intake to the oldest company (Modern Appraisers), which
// matches how web intake was framed originally. Can be pinned via env.
async function resolveIntakeCompanyId(service: ReturnType<typeof createServiceClient>): Promise<string | null> {
  if (cachedCompanyId !== null) return cachedCompanyId || null

  const envOverride = process.env.HAMS_INTAKE_COMPANY_ID
  if (envOverride) {
    cachedCompanyId = envOverride
    return envOverride
  }

  const { data, error } = await service
    .from('companies')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.id) {
    console.error('[intake] could not resolve company_id:', error)
    cachedCompanyId = ''
    return null
  }
  cachedCompanyId = data.id
  return data.id
}

const INTAKE_FIELDS = [
  'claimNumber', 'dateOfLoss', 'clientType', 'clientName',
  'insuredName', 'ownerName', 'ownerPhone', 'ownerEmail', 'ownerAddress',
  'claimantName', 'claimantPhone', 'claimantEmail', 'claimantAddress',
  'insuranceCompany', 'adjuster', 'adjusterPhone', 'adjusterEmail',
  'vin', 'year', 'make', 'model', 'trim', 'engine', 'mileage',
  'negotiatingAppraiser',
] as const

type IntakeBody = Partial<Record<(typeof INTAKE_FIELDS)[number], unknown>> & {
  claimTypes?: unknown
  // Freeform message from the public form. Appended as the first message on
  // the thread via a follow-up auto-message insert.
  message?: unknown
  // Handling instructions / submitter context. Also populates claim.appraiserNotes
  // so admins see it on the Claim Info tab (not just the Messages thread).
  appraiserNotes?: unknown
  // Who routed the submission (e.g. "modernappraisers.com"). Stored in the
  // claim so admins can see where web intake came from.
  source?: unknown
}

// Caps on uploaded files. Per-file cap matches HAMS's MAX_DOCUMENT_BYTES
// (25 MB), total cap keeps a bursty intake from eating lambda memory.
const MAX_FILES = 15
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

// Mirror of HAMS's documents MIME allowlist — kept in sync with
// src/lib/supabase/documents.ts. Anything outside this is rejected before
// hitting Supabase storage.
const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
])

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ ()-]+/g, '_').slice(0, 120) || 'file'
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}
function n(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export async function POST(request: NextRequest) {
  // Shared-secret auth. Constant-time comparison via Buffer.timingSafeEqual
  // so a timing attack can't probe the secret byte by byte.
  const expected = process.env.INTAKE_SHARED_SECRET
  if (!expected) {
    console.error('[intake] INTAKE_SHARED_SECRET not configured on server')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const presented = request.headers.get('x-intake-secret') || ''
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  const intakeUserId = await resolveIntakeUserId(service)
  if (!intakeUserId) {
    return NextResponse.json(
      { error: 'No admin user available to attribute intake claim to' },
      { status: 500 },
    )
  }

  const intakeCompanyId = await resolveIntakeCompanyId(service)
  if (!intakeCompanyId) {
    return NextResponse.json(
      { error: 'No company available to attribute intake claim to' },
      { status: 500 },
    )
  }

  // Accept JSON or multipart/form-data. Multipart is used when the submitter
  // includes file attachments (photos, assignment PDF, etc.). JSON path is
  // kept for callers that just submit fields.
  let body: IntakeBody
  const uploads: { name: string; type: string; buffer: Buffer }[] = []
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
    }
    body = {} as IntakeBody
    // Walk every known text field. formData.get returns string | File | null.
    for (const key of INTAKE_FIELDS) {
      const v = form.get(key)
      if (typeof v === 'string') (body as Record<string, unknown>)[key] = v
    }
    for (const extra of ['message', 'appraiserNotes', 'source'] as const) {
      const v = form.get(extra)
      if (typeof v === 'string') (body as Record<string, unknown>)[extra] = v
    }
    const ctRaw = form.get('claimTypes')
    if (typeof ctRaw === 'string') {
      try { body.claimTypes = JSON.parse(ctRaw) } catch { /* ignore */ }
    }
    // Files land under field name "documents" (<input name="documents" multiple>).
    const docs = form.getAll('documents').filter((d): d is File => d instanceof File && d.size > 0)
    if (docs.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 400 })
    }
    let total = 0
    for (const d of docs) {
      if (d.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `File "${d.name}" exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 400 })
      }
      total += d.size
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: `Total upload exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB` }, { status: 400 })
      }
      const mime = (d.type || 'application/octet-stream').toLowerCase()
      if (!ALLOWED_MIME.has(mime)) {
        return NextResponse.json({ error: `File type "${mime}" not allowed` }, { status: 400 })
      }
      uploads.push({
        name: d.name || 'file',
        type: mime,
        buffer: Buffer.from(await d.arrayBuffer()),
      })
    }
  } else {
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }

  // Minimum identifying field: at least one of insuredName, claimNumber, or
  // ownerName must be present. Matches the acv_history_identifiable check
  // constraint — surfacing it here gives a clean 400 instead of a 23514.
  const insuredName = s(body.insuredName) || s(body.ownerName)
  const claimNumber = s(body.claimNumber)
  if (!insuredName && !claimNumber) {
    return NextResponse.json(
      { error: 'At least one of insuredName, ownerName, or claimNumber is required' },
      { status: 400 },
    )
  }

  // Build the ClaimInfo blob. Keep everything that isn't provided empty-
  // defaulted so the shape matches what the workspace expects on read.
  const year = n(body.year)
  const make = s(body.make)
  const model = s(body.model)
  const trim = s(body.trim)

  // claimTypes: accept array of strings; filter to known types to avoid
  // garbage ending up in the jsonb.
  const KNOWN_TYPES: ClaimType[] = ['rta', 'acv', 'dv', 'estimate', 'storage', 'other', 'desk', 'lou', 'full', 'salvage', 'specialty', 'umpire']
  const rawTypes = Array.isArray(body.claimTypes) ? body.claimTypes : []
  const claimTypes = rawTypes
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter((t): t is ClaimType => (KNOWN_TYPES as string[]).includes(t))

  const claim: ClaimInfo = {
    maNumber: '',                 // DB trigger assigns
    claimNumber,
    negotiatingAppraiser: s(body.negotiatingAppraiser),
    claimTypes: claimTypes.length ? claimTypes : undefined,
    dateOfLoss: s(body.dateOfLoss),
    clientType: (s(body.clientType) === 'Claimant' ? 'Claimant' : 'Insured'),
    clientName: s(body.clientName),
    insuredName,
    ownerName: s(body.ownerName) || insuredName,
    ownerPhone: s(body.ownerPhone),
    ownerEmail: s(body.ownerEmail),
    ownerAddress: s(body.ownerAddress),
    claimantName: s(body.claimantName) || undefined,
    claimantPhone: s(body.claimantPhone) || undefined,
    claimantEmail: s(body.claimantEmail) || undefined,
    claimantAddress: s(body.claimantAddress) || undefined,
    insuranceCompany: s(body.insuranceCompany),
    adjuster: s(body.adjuster),
    adjusterPhone: s(body.adjusterPhone),
    adjusterEmail: s(body.adjusterEmail),
    vin: s(body.vin).toUpperCase(),
    year,
    make,
    model,
    trim,
    engine: s(body.engine),
    drivetrain: '',
    transmission: '',
    fuelType: '',
    mileage: n(body.mileage),
    zip: '',
    radius: 50,
    // Handling instructions / submitter context — shows on the Claim Info
    // tab as "Handling Instructions" so admins see it without scrolling into
    // Messages. Falls back to undefined so empty intake doesn't clutter the
    // field with a blank string.
    appraiserNotes: s(body.appraiserNotes) || undefined,
  }

  // Short, human label — matches the ClaimWorkspace's own derivation so this
  // column reads sensibly in list views before the user ever opens the claim.
  const vehicleLabel = [year || '', make, model, trim].filter(Boolean).join(' ').trim()

  const id = crypto.randomUUID()
  const todayIso = new Date().toISOString().slice(0, 10)

  // Upload any attached files to the claim-documents bucket under the new
  // claim's id prefix, then capture metadata for the documents jsonb. If a
  // single upload fails we skip just that file — the rest of the intake
  // continues; nothing here can abort the claim creation.
  const documents: Array<{
    id: string
    name: string
    source: 'document'
    path: string
    size: number
    createdAt: string
  }> = []
  for (const file of uploads) {
    const clean = sanitizeFilename(file.name)
    const path = `${id}/${Date.now()}-${clean}`
    const { error: uploadErr } = await service.storage
      .from('claim-documents')
      .upload(path, file.buffer, { contentType: file.type, upsert: false })
    if (uploadErr) {
      console.warn('[intake] file upload failed (skipping):', clean, uploadErr.message)
      continue
    }
    documents.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      source: 'document',
      path,
      size: file.buffer.length,
      createdAt: new Date().toISOString(),
    })
  }

  const insertPayload: Record<string, unknown> = {
    id,
    user_id: intakeUserId,
    company_id: intakeCompanyId,
    assigned_to: null,
    workflow_stage: 'main',
    status: 'open',
    date: todayIso,
    mode: 'auto-acv',
    vehicle: vehicleLabel,
    vin: claim.vin,
    acv: 0,
    claim,
    comps: [],
    adjustments: defaultAdjustments(),
    result: {
      comp1Value: 0,
      comp2Value: 0,
      comp3Value: 0,
      averageValue: 0,
      totalAdjustments: 0,
      taxAmount: 0,
      acv: 0,
    },
    mileage_rate: 0,
    documents,
  }

  const { error: insertErr } = await service.from('acv_history').insert(insertPayload)
  if (insertErr) {
    console.error('[intake] insert failed:', insertErr)
    return NextResponse.json({ error: `Insert failed: ${insertErr.message}` }, { status: 500 })
  }

  // Read back ma_number — the BEFORE INSERT trigger assigned it, but we
  // didn't get it in the insert response because we're not using .select().
  // A quick round-trip is fine (one row by PK).
  const { data: row } = await service
    .from('acv_history')
    .select('id, ma_number')
    .eq('id', id)
    .maybeSingle()

  // Append the freeform message (if any) as an auto-message on the claim
  // thread so admins see the submitter's context when they open the claim.
  // Non-fatal — the claim exists even if this fails.
  const freeformMessage = s(body.message)
  const source = s(body.source) || 'web intake'
  if (freeformMessage) {
    const header = `Submitted via ${source}.`
    const combined = `${header}\n\n${freeformMessage}`.slice(0, 7500)
    try {
      await service.from('messages').insert({
        id: crypto.randomUUID(),
        claim_id: id,
        sender_id: null,
        sender_name: 'Web Intake',
        recipient_ids: [],
        recipient_names: [],
        body: combined,
        is_auto_request: true,
      })
    } catch (err) {
      console.warn('[intake] auto-message insert failed (non-fatal):', err)
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    maNumber: row?.ma_number ?? null,
  })
}
