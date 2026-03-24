import { createClient } from './client'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'

// ── ACV History ──────────────────────────────────────────────────────────────

export interface ACVHistoryEntry {
  id: string
  date: string
  mode: string
  vehicle: string
  vin: string
  maNumber: string
  acv: number
  claim: ClaimInfo
  comps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
  mileageRate?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auctionListings?: any[]
}

export async function fetchACVHistory(): Promise<ACVHistoryEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('acv_history')
    .select('*')
    .order('date', { ascending: false })

  if (error) {
    console.error('Failed to fetch ACV history:', error)
    return []
  }

  return (data ?? []).map(row => ({
    id: row.id,
    date: row.date,
    mode: row.mode,
    vehicle: row.vehicle,
    vin: row.vin,
    maNumber: row.ma_number,
    acv: Number(row.acv),
    claim: row.claim as ClaimInfo,
    comps: row.comps as SelectedComp[],
    adjustments: row.adjustments as ACVAdjustments,
    result: row.result as ACVResult,
    mileageRate: Number(row.mileage_rate ?? 0),
  }))
}

export async function saveACVHistory(entry: ACVHistoryEntry, editId?: string | null) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const id = editId || entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  if (editId) {
    await supabase.from('acv_history').delete().eq('id', editId)
  }

  const { error } = await supabase.from('acv_history').upsert({
    id,
    user_id: user.id,
    date: entry.date,
    mode: entry.mode,
    vehicle: entry.vehicle,
    vin: entry.vin,
    ma_number: entry.maNumber,
    acv: entry.acv,
    claim: entry.claim,
    comps: entry.comps,
    adjustments: entry.adjustments,
    result: entry.result,
    mileage_rate: entry.mileageRate ?? 0,
  })

  if (error) console.error('Failed to save ACV history:', error)
}

export async function deleteACVHistory(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('acv_history').delete().eq('id', id)
  if (error) console.error('Failed to delete ACV history:', error)
}

// ── Estimate History ─────────────────────────────────────────────────────────

export interface EstimateHistoryEntry {
  id: string
  date: string
  vehicle: Record<string, string>
  softwareA: string
  softwareB: string
  fileNameA: string
  fileNameB: string
  grandTotalA: number
  grandTotalB: number
  totalDifference: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim?: any
}

export async function fetchEstimateHistory(): Promise<EstimateHistoryEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('estimate_history')
    .select('*')
    .order('date', { ascending: false })

  if (error) {
    console.error('Failed to fetch estimate history:', error)
    return []
  }

  return (data ?? []).map(row => ({
    id: row.id,
    date: row.date,
    vehicle: row.vehicle as Record<string, string>,
    softwareA: row.software_a,
    softwareB: row.software_b,
    fileNameA: row.file_name_a,
    fileNameB: row.file_name_b,
    grandTotalA: Number(row.grand_total_a),
    grandTotalB: Number(row.grand_total_b),
    totalDifference: Number(row.total_difference),
    result: row.result,
    claim: row.claim,
  }))
}

export async function saveEstimateHistory(entry: EstimateHistoryEntry) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('estimate_history').upsert({
    id: entry.id,
    user_id: user.id,
    date: entry.date,
    vehicle: entry.vehicle,
    software_a: entry.softwareA,
    software_b: entry.softwareB,
    file_name_a: entry.fileNameA,
    file_name_b: entry.fileNameB,
    grand_total_a: entry.grandTotalA,
    grand_total_b: entry.grandTotalB,
    total_difference: entry.totalDifference,
    result: entry.result,
    claim: entry.claim,
  })

  if (error) console.error('Failed to save estimate history:', error)
}

export async function deleteEstimateHistory(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('estimate_history').delete().eq('id', id)
  if (error) console.error('Failed to delete estimate history:', error)
}

// ── Migration: localStorage → Supabase ───────────────────────────────────────

export async function migrateLocalStorageToSupabase() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Migrate ACV history
  const acvRaw = localStorage.getItem('modern-tools-acv-history')
  if (acvRaw) {
    try {
      const entries: ACVHistoryEntry[] = JSON.parse(acvRaw)
      if (entries.length > 0) {
        const rows = entries.map(e => ({
          id: e.id,
          user_id: user.id,
          date: e.date,
          mode: e.mode,
          vehicle: e.vehicle,
          vin: e.vin,
          ma_number: e.maNumber,
          acv: e.acv,
          claim: e.claim,
          comps: e.comps ?? [],
          adjustments: e.adjustments ?? {},
          result: e.result ?? {},
          mileage_rate: e.mileageRate ?? 0,
        }))
        const { error } = await supabase.from('acv_history').upsert(rows)
        if (!error) {
          localStorage.removeItem('modern-tools-acv-history')
        } else {
          console.error('ACV migration error:', error)
        }
      }
    } catch (err) {
      console.error('Failed to parse ACV localStorage:', err)
    }
  }

  // Migrate Estimate history
  const estRaw = localStorage.getItem('modern-tools-estimate-history')
  if (estRaw) {
    try {
      const entries: EstimateHistoryEntry[] = JSON.parse(estRaw)
      if (entries.length > 0) {
        const rows = entries.map(e => ({
          id: e.id,
          user_id: user.id,
          date: e.date,
          vehicle: e.vehicle,
          software_a: e.softwareA,
          software_b: e.softwareB,
          file_name_a: e.fileNameA,
          file_name_b: e.fileNameB,
          grand_total_a: e.grandTotalA,
          grand_total_b: e.grandTotalB,
          total_difference: e.totalDifference,
          result: e.result,
          claim: e.claim,
        }))
        const { error } = await supabase.from('estimate_history').upsert(rows)
        if (!error) {
          localStorage.removeItem('modern-tools-estimate-history')
        } else {
          console.error('Estimate migration error:', error)
        }
      }
    } catch (err) {
      console.error('Failed to parse estimate localStorage:', err)
    }
  }
}
