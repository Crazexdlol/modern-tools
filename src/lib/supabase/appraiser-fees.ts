import { createClient as createBrowserClient } from './client'

export interface AppraiserFee {
  userId: string
  feeId: string
  amount: number | null
}

interface AppraiserFeeRow {
  user_id: string
  fee_id: string
  amount: number | null
}

/** Fetch fee amounts for a single user, keyed by fee_id. */
export async function fetchAppraiserFees(userId: string): Promise<Map<string, number | null>> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_fees')
    .select('fee_id, amount')
    .eq('user_id', userId)
  if (error) {
    console.error('fetchAppraiserFees failed:', error)
    return new Map()
  }
  const map = new Map<string, number | null>()
  for (const row of data as { fee_id: string; amount: number | null }[]) {
    map.set(row.fee_id, row.amount)
  }
  return map
}
