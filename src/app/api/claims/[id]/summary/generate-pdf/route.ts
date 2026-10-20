import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, fetchClaim } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { buildSummaryPdf } from '@/lib/summary/pdf'
import type { SavedSummary } from '@/app/summary-page/lib'

export const runtime = 'nodejs'

// Server-side Summary PDF generator. The client POSTs { summaryId } (or an
// inline summary payload for brand-new unsaved summaries); the route looks
// the record up, generates a PDF via pdf-lib, and returns the bytes. This
// bypasses the previous client-side html2canvas + jsPDF pipeline, which had
// too many silent-failure modes (DOM-measurement race on display:none, logo
// CORS taint, portal mount timing).
//
// Auth: logged-in user with access to the claim. We don't let a caller fetch
// an arbitrary summary id — we only accept a summaryId whose owning claim
// matches the id in the URL (via acv_history.reports_state->>'summaryId').
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  const { id: claimId } = await params
  const claim = await fetchClaim(claimId, caller!.activeCompanyId ?? undefined)
  if (!claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as {
    summaryId?: unknown
    summary?: unknown
  } | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let summary: SavedSummary | null = null

  // Primary source: inline `summary` payload from the client. As of
  // 2026-10-12, Summary data lives on acv_history.reports_state.summaryData
  // (same mechanism as Award / Notes) — the client sends the current draft
  // directly, no DB roundtrip needed. The old separate `summaries` table
  // is only consulted as a legacy fallback for claims that haven't been
  // migrated inline yet.
  if (body.summary && typeof body.summary === 'object') {
    summary = body.summary as SavedSummary
  } else if (typeof body.summaryId === 'string' && body.summaryId.length > 0) {
    // Legacy fallback: fetch from the summaries table.
    const service = createServiceClient()
    const { data: claimRow } = await service
      .from('acv_history')
      .select('reports_state')
      .eq('id', claimId)
      .maybeSingle()
    const rs = (claimRow?.reports_state ?? {}) as {
      summaryId?: string
      summaryData?: Partial<SavedSummary>
    }

    // Prefer the inline-on-claim data when present (hoisted from summaries
    // table on first open after the 2026-10-12 rewrite).
    if (rs.summaryData && typeof rs.summaryData === 'object') {
      summary = rs.summaryData as SavedSummary
    } else if (rs.summaryId === body.summaryId) {
      const { data: row } = await service
        .from('summaries')
        .select('*')
        .eq('id', body.summaryId)
        .maybeSingle()
      if (row) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = ((row as any).data ?? {}) as Partial<SavedSummary>
        summary = {
          date: data.date ?? '',
          claimNumber: data.claimNumber ?? '',
          insuranceCompany: data.insuranceCompany ?? '',
          vehicleOwner: data.vehicleOwner ?? '',
          vehicle: data.vehicle ?? '',
          dateOfLoss: data.dateOfLoss ?? '',
          opposingAppraiser: data.opposingAppraiser ?? '',
          oaCompany: data.oaCompany ?? '',
          oaPhone: data.oaPhone ?? '',
          oaEmail: data.oaEmail ?? '',
          oaPreferredContact: data.oaPreferredContact ?? '',
          dateReceivedClaim: data.dateReceivedClaim ?? '',
          initialContactDate: data.initialContactDate ?? '',
          initialContactVia: data.initialContactVia ?? '',
          statuses: data.statuses ?? [],
          additionalInfo: data.additionalInfo ?? [],
          stateLaws: data.stateLaws ?? [],
          id: body.summaryId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          createdAt: ((row as any).created_at as string) ?? '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updatedAt: ((row as any).updated_at as string) ?? '',
        }
      }
    }
  }

  if (!summary) {
    return NextResponse.json({ error: 'Missing summary payload — reopen the Summary tab and try again' }, { status: 400 })
  }

  // Resolve the active company's slug so the PDF uses the right logo /
  // brand name. Falls back to Modern Appraisers (every pre-multi-company
  // claim is in that brand).
  let companySlug = 'modern-appraisers'
  let brandName = 'Modern Appraisers'
  if (caller!.activeCompanyId) {
    const service = createServiceClient()
    const { data: company } = await service
      .from('companies')
      .select('slug, name')
      .eq('id', caller!.activeCompanyId)
      .maybeSingle()
    if (company?.slug) companySlug = company.slug as string
    if (company?.name) brandName = company.name as string
  }

  const bytes = await buildSummaryPdf(summary, companySlug, brandName)

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="summary.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
