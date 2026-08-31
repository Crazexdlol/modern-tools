import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function GET() {
  const { errorResponse } = await requireAdmin()
  if (errorResponse) return errorResponse

  const headers = ['Insurance Company', 'Guidelines']
  const body = '﻿' + headers.join(',') + '\r\n'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modern-tools-guidelines-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
