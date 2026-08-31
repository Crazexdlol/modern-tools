import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

// GET /api/admin/import/claims/template — returns a blank CSV with just the
// header row so admins know the exact column names the importer expects.
export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const headers = [
    'MA #',
    'Insured',
    'Vehicle',
    'Claim #',
    'VIN',
    'Insurance Co.',
    'Owner',
    'Location',
    'Date',
    'Assigned To',
    'Status',
    'ACV Amount',
  ]

  // Include one example row (commented via '#' won't help since Excel doesn't
  // treat # as a comment — leave it blank and put the guidance in the UI).
  const body = '﻿' + headers.join(',') + '\r\n'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modern-tools-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
