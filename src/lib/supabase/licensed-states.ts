import { createClient as createBrowserClient } from './client'

export interface LicensedState {
  state: string        // 2-char code
  required: boolean
  forbidden: boolean   // Modern Appraisers cannot handle claims from this state at all
  notes: string | null
}

interface LicensedStateRow {
  state: string
  required: boolean
  forbidden?: boolean | null
  notes: string | null
}

export async function fetchLicensedStates(): Promise<LicensedState[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('licensed_states')
    .select('*')
    .order('state', { ascending: true })
  if (error) {
    console.error('fetchLicensedStates failed:', error)
    return []
  }
  return (data as LicensedStateRow[]).map(r => ({
    state: r.state,
    required: r.required,
    forbidden: r.forbidden === true,
    notes: r.notes,
  }))
}

/** True if the given state code is in the required list. */
export function isLicensedState(state: string | null | undefined, states: LicensedState[]): boolean {
  if (!state) return false
  return states.some(s => s.state === state && s.required)
}

/** True if Modern Appraisers cannot handle claims from this state at all. */
export function isForbiddenState(state: string | null | undefined, states: LicensedState[]): boolean {
  if (!state) return false
  return states.some(s => s.state === state && s.forbidden)
}
