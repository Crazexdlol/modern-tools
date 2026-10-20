import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/claims
// Public form submission from /submitaclaim. Server-side relay to the HAMS
// intake endpoint. Keeps the shared secret off the client; from the browser's
// perspective this is a same-origin fetch.
//
// Accepts multipart/form-data (when files are attached) or JSON (fields only).
// When files are present we forward multipart to HAMS so HAMS does the storage
// upload under the new claim's id prefix.
//
// Env:
//   HAMS_INTAKE_URL         — base URL to HAMS (http://localhost:3000 in dev,
//                             https://www.hamsportal.com in prod)
//   INTAKE_SHARED_SECRET    — matches the HAMS INTAKE_SHARED_SECRET env

interface FormBody {
  name?: string
  company?: string
  insuranceCompany?: string
  email?: string
  phone?: string
  claim?: string
  insured?: string
  vehicle?: string
  vin?: string
  dateOfLoss?: string
  service?: string
  message?: string
  // Checkbox from the form: when true, VIN length relaxation applies (classic
  // / specialty vehicles). Mapped through to HAMS claimTypes.
  specialty?: string | boolean
}

function serviceToClaimTypes(service: string | undefined, specialty: boolean): string[] {
  const s = (service || '').toLowerCase()
  const base: string[] = []
  if (s.includes('actual cash value')) base.push('acv')
  else if (s.includes('diminished value')) base.push('dv')
  else if (s.includes('cost of repair')) base.push('estimate')
  else if (s.includes('umpire')) base.push('acv', 'umpire')
  else if (s.includes('desk / subrogation') || s.includes('desk/subrogation') || s.includes('desk')) base.push('desk')
  if (specialty && !base.includes('specialty')) base.push('specialty')
  return base
}

function parseVehicle(raw: string | undefined): { year: number; make: string; model: string; trim: string } {
  const parts = (raw || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { year: 0, make: '', model: '', trim: '' }
  let year = 0
  let i = 0
  if (/^\d{4}$/.test(parts[0] || '')) {
    const parsed = Number(parts[0])
    if (parsed >= 1900 && parsed <= 2100) {
      year = parsed
      i = 1
    }
  }
  const make = parts[i] || ''
  const model = parts[i + 1] || ''
  const trim = parts.slice(i + 2).join(' ')
  return { year, make, model, trim }
}

// Build the submitter + context block that HAMS pins to claim.appraiserNotes
// (visible on Claim Info tab) AND sends as an auto-message on the thread.
function buildContextBlock(body: FormBody): string {
  return [
    'Web Assignment',
    '',
    body.service ? `Service requested: ${body.service}` : null,
    body.name ? `Submitter: ${body.name}${body.company ? ` (${body.company})` : ''}` : null,
    body.insuranceCompany ? `Insurance company: ${body.insuranceCompany}` : null,
    body.phone ? `Phone: ${body.phone}` : null,
    body.email ? `Email: ${body.email}` : null,
    body.message ? `\nContext:\n${body.message}` : null,
  ].filter(Boolean).join('\n')
}

// ──────────────────────────────────────────────────────────────────────────
// Email notification: fires after a successful HAMS intake so Henry (or
// info@) gets a branded Web Assignment email with the claim snapshot. Kept
// out of the critical path — a Resend failure is logged but never bubbles
// up and never blocks the claim creation (the row already exists in HAMS).

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

interface AssignmentEmailData {
  maNumber: string
  claimNumber: string
  insuredName: string
  vehicleLabel: string
  vin: string
  dateOfLoss: string
  service: string
  insuranceCompany: string
  submitterName: string
  submitterCompany: string
  submitterEmail: string
  submitterPhone: string
  context: string
  fileCount: number
}

function buildAssignmentSubject(d: AssignmentEmailData): string {
  const parts = [
    'Web Assignment',
    d.insuredName || 'Unknown Owner',
    d.vehicleLabel || 'Vehicle TBD',
    `MA#${d.maNumber || '-'}`,
    `CL#${d.claimNumber || '-'}`,
  ]
  return parts.join(' | ')
}

function renderAssignmentHtml(d: AssignmentEmailData): string {
  // No horizontal separators between rows — Gmail doubles them inconsistently
  // across row counts. Padding alone separates each field, which reads cleaner
  // and is bulletproof across every email client.
  const row = (label: string, value: string) => {
    const v = (value || '').trim()
    if (!v) return ''
    return `
      <tr>
        <td style="padding:14px 0;color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;vertical-align:top;width:180px;font-family:'Times New Roman',Times,serif;font-weight:bold;">${esc(label)}</td>
        <td style="padding:14px 0;color:#0a0a0a;font-size:15px;font-family:'Times New Roman',Times,serif;line-height:1.5;">${esc(v)}</td>
      </tr>`
  }
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Times New Roman',Times,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;background:#f5f5f5;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-collapse:collapse;">
        <tr>
          <td style="background:#0a0a0a;padding:28px 32px;border-bottom:4px solid #2563eb;">
            <div style="color:#ffffff;font-size:26px;font-weight:bold;letter-spacing:-0.01em;font-family:'Times New Roman',Times,serif;">Modern Appraisers</div>
            <div style="color:#b3b3b3;font-size:13px;margin-top:6px;font-family:'Times New Roman',Times,serif;">New Web Assignment from modernappraisers.com</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${row('MA #', d.maNumber)}
              ${row('Claim #', d.claimNumber)}
              ${row('Service Requested', d.service)}
              ${row('Owner / Insured', d.insuredName)}
              ${row('Vehicle', d.vehicleLabel)}
              ${row('VIN', d.vin)}
              ${row('Date of Loss', d.dateOfLoss)}
              ${row('Insurance Company', d.insuranceCompany)}
              ${row('Submitter', d.submitterName + (d.submitterCompany ? ` (${d.submitterCompany})` : ''))}
              ${row('Submitter Email', d.submitterEmail)}
              ${row('Submitter Phone', d.submitterPhone)}
              ${row('Files Attached', d.fileCount > 0 ? String(d.fileCount) : '')}
            </table>
          </td>
        </tr>
        ${d.context ? `
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <div style="color:#8a8a8a;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:bold;font-family:'Times New Roman',Times,serif;margin-bottom:14px;">Context / What they need</div>
            <div style="padding:20px 24px;background:#f8f8f8;border-left:4px solid #2563eb;color:#0a0a0a;font-size:15px;line-height:1.65;white-space:pre-wrap;font-family:'Times New Roman',Times,serif;">${esc(d.context)}</div>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:24px 32px;background:#f8f8f8;border-top:1px solid #e5e5e5;color:#8a8a8a;font-size:12px;text-align:center;font-family:'Times New Roman',Times,serif;line-height:1.5;">
            This claim is on the <b>New Assignments</b> tab in HamsPortal. Reply to this email to respond directly to ${esc(d.submitterName)} at ${esc(d.submitterEmail)}.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function renderAssignmentText(d: AssignmentEmailData): string {
  const line = (label: string, v: string) => v && v.trim() ? `${label}: ${v.trim()}\n` : ''
  return (
    `New Web Assignment from modernappraisers.com\n\n` +
    line('MA #', d.maNumber) +
    line('Claim #', d.claimNumber) +
    line('Service Requested', d.service) +
    line('Owner / Insured', d.insuredName) +
    line('Vehicle', d.vehicleLabel) +
    line('VIN', d.vin) +
    line('Date of Loss', d.dateOfLoss) +
    line('Insurance Company', d.insuranceCompany) +
    line('Submitter', d.submitterName + (d.submitterCompany ? ` (${d.submitterCompany})` : '')) +
    line('Submitter Email', d.submitterEmail) +
    line('Submitter Phone', d.submitterPhone) +
    (d.fileCount > 0 ? `Files Attached: ${d.fileCount}\n` : '') +
    (d.context ? `\nContext:\n${d.context}\n` : '')
  )
}

async function sendAssignmentEmail(d: AssignmentEmailData): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[claims] RESEND_API_KEY missing; assignment created but notification not emailed')
    return
  }
  const { Resend } = await import('resend')
  const resend = new Resend(key)
  await resend.emails.send({
    from: 'Modern Appraisers <website@modernappraisers.com>',
    to: 'info@modernappraisers.com',
    replyTo: d.submitterEmail || undefined,
    subject: buildAssignmentSubject(d),
    html: renderAssignmentHtml(d),
    text: renderAssignmentText(d),
  })
}

async function readBody(request: NextRequest): Promise<{ body: FormBody; files: File[] } | { error: string }> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData
    try { form = await request.formData() } catch { return { error: 'Invalid multipart body' } }
    const body: FormBody = {}
    for (const key of ['name', 'company', 'insuranceCompany', 'email', 'phone', 'claim', 'insured', 'vehicle', 'vin', 'dateOfLoss', 'service', 'message', 'specialty'] as const) {
      const v = form.get(key)
      if (typeof v === 'string') (body as Record<string, unknown>)[key] = v
    }
    const files = form.getAll('documents').filter((d): d is File => d instanceof File && d.size > 0)
    return { body, files }
  }
  try {
    const body = await request.json()
    return { body, files: [] }
  } catch { return { error: 'Invalid JSON body' } }
}

export async function POST(request: NextRequest) {
  const intakeUrl = process.env.HAMS_INTAKE_URL
  const secret = process.env.INTAKE_SHARED_SECRET
  if (!intakeUrl || !secret) {
    console.error('[claims] HAMS_INTAKE_URL or INTAKE_SHARED_SECRET missing')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const read = await readBody(request)
  if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 })
  const { body, files } = read

  const name = (body.name || '').trim()
  const email = (body.email || '').trim()
  const insured = (body.insured || '').trim()
  const claimNumber = (body.claim || '').trim()
  const vehicle = parseVehicle(body.vehicle)
  const specialty = body.specialty === true || body.specialty === 'true' || body.specialty === 'on'

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }
  if (!insured && !claimNumber) {
    return NextResponse.json({ error: 'Please include either the insured/claimant name or the claim number' }, { status: 400 })
  }
  const vin = (body.vin || '').trim().toUpperCase()
  if (!specialty && vin.length !== 17) {
    return NextResponse.json({ error: 'VIN must be exactly 17 characters (check the Classic / Specialty box if yours is shorter)' }, { status: 400 })
  }

  const contextBlock = buildContextBlock(body)
  const claimTypes = serviceToClaimTypes(body.service, specialty)

  // Shared field mapping — same payload whether we end up sending JSON or
  // multipart to HAMS. The sibling file list decides which format.
  // clientName = submitter's own firm/company (who hired MA).
  // insuranceCompany = the carrier the claim is through — lands on the
  // dedicated Claim Info "Insurance Company" field in HAMS, not just the
  // appraiserNotes blob.
  const commonFields: Record<string, string> = {
    claimNumber,
    dateOfLoss: body.dateOfLoss || '',
    clientType: 'Insured',
    clientName: (body.company || '').trim(),
    insuranceCompany: (body.insuranceCompany || '').trim(),
    insuredName: insured,
    ownerName: insured,
    ownerPhone: (body.phone || '').trim(),
    ownerEmail: email,
    vin,
    year: String(vehicle.year || ''),
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    source: 'modernappraisers.com',
    message: contextBlock,
    appraiserNotes: contextBlock,
  }

  const url = `${intakeUrl.replace(/\/$/, '')}/api/intake`
  let res: Response
  try {
    if (files.length > 0) {
      // Multipart passthrough — HAMS writes files into the claim-documents
      // bucket under the new claim's id.
      const forward = new FormData()
      for (const [k, v] of Object.entries(commonFields)) if (v) forward.append(k, v)
      forward.append('claimTypes', JSON.stringify(claimTypes))
      for (const f of files) forward.append('documents', f, f.name)
      res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Intake-Secret': secret },
        body: forward,
        signal: AbortSignal.timeout(55_000),
      })
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Intake-Secret': secret,
        },
        body: JSON.stringify({ ...commonFields, claimTypes }),
        signal: AbortSignal.timeout(15_000),
      })
    }
  } catch (err) {
    console.error('[claims] HAMS intake call failed:', err)
    return NextResponse.json(
      { error: 'Could not reach the claim-intake server. Please try again or email info@modernappraisers.com.' },
      { status: 502 },
    )
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[claims] HAMS intake rejected submission:', res.status, json)
    return NextResponse.json(
      { error: typeof json.error === 'string' ? json.error : 'Intake rejected the submission' },
      { status: res.status },
    )
  }

  // Fire the Web Assignment notification email. Wrapped in try/catch so a
  // Resend failure never takes down the user-facing success — the claim is
  // already in HAMS at this point.
  try {
    await sendAssignmentEmail({
      maNumber:         String(json.maNumber ?? ''),
      claimNumber,
      insuredName:      insured,
      vehicleLabel:     [vehicle.year || '', vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ').trim(),
      vin,
      dateOfLoss:       body.dateOfLoss || '',
      service:          body.service || '',
      insuranceCompany: (body.insuranceCompany || '').trim(),
      submitterName:    name,
      submitterCompany: (body.company || '').trim(),
      submitterEmail:   email,
      submitterPhone:   (body.phone || '').trim(),
      context:          (body.message || '').trim(),
      fileCount:        files.length,
    })
  } catch (err) {
    console.error('[claims] assignment email send failed (non-fatal):', err)
  }

  return NextResponse.json({
    ok: true,
    id: json.id,
    maNumber: json.maNumber ?? null,
  })
}
