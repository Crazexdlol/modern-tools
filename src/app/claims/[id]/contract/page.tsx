import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import type { ACVHistoryEntry } from '@/lib/supabase/history'
import { ContractClient } from './contract-client'

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: row } = await supabase
    .from('acv_history')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!row) notFound()

  const entry: ACVHistoryEntry = {
    id: row.id,
    date: row.date,
    mode: row.mode,
    vehicle: row.vehicle,
    vin: row.vin,
    maNumber: row.ma_number,
    acv: Number(row.acv),
    claim: row.claim as ClaimInfo,
    comps: (row.comps ?? []) as SelectedComp[],
    adjustments: row.adjustments as ACVAdjustments,
    result: row.result as ACVResult,
    mileageRate: Number(row.mileage_rate ?? 0),
    status: row.status === 'closed' ? 'closed' : 'open',
    assignedTo: row.assigned_to ?? null,
    submittedAt: row.submitted_at ?? null,
    submittedBy: row.submitted_by ?? null,
    reportsState: row.reports_state ?? undefined,
    auctionListings: row.auction_listings ?? undefined,
    estimate: row.estimate ?? undefined,
    documents: row.documents ?? undefined,
    dv: row.dv ?? undefined,
    invoice: row.invoice ?? undefined,
    statusPhase: row.status_phase ?? null,
    statusPhaseSetAt: row.status_phase_set_at ?? null,
  }

  return <ContractClient entry={entry} />
}
