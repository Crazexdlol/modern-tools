import { useEffect, useState } from 'react'

export interface DuplicateMatch {
  id: string
  maNumber: string
  insuredName: string
  vehicle: string
  date: string  // ISO
}

export interface DuplicateResult {
  vinMatches: DuplicateMatch[]
  claimNumberMatches: DuplicateMatch[]
}

const EMPTY: DuplicateResult = { vinMatches: [], claimNumberMatches: [] }

export async function fetchClaimDuplicates(params: {
  vin?: string
  claimNumber?: string
  excludeId?: string | null
}): Promise<DuplicateResult> {
  const { vin, claimNumber, excludeId } = params
  if (!vin?.trim() && !claimNumber?.trim()) return EMPTY
  const q = new URLSearchParams()
  if (vin?.trim()) q.set('vin', vin.trim())
  if (claimNumber?.trim()) q.set('claimNumber', claimNumber.trim())
  if (excludeId) q.set('excludeId', excludeId)
  try {
    const res = await fetch(`/api/claims/duplicates?${q.toString()}`)
    if (!res.ok) return EMPTY
    return (await res.json()) as DuplicateResult
  } catch {
    return EMPTY
  }
}

// Debounced live duplicate check as the user types VIN / claim #.
// Callers pass current field values + optional excludeId (the current
// claim's id when editing an existing claim).
export function useDuplicateCheck(
  vin: string,
  claimNumber: string,
  excludeId?: string | null,
  delayMs: number = 500,
): DuplicateResult {
  const [result, setResult] = useState<DuplicateResult>(EMPTY)
  useEffect(() => {
    const v = vin.trim()
    const c = claimNumber.trim()
    if (!v && !c) { setResult(EMPTY); return }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchClaimDuplicates({ vin: v, claimNumber: c, excludeId }).then(r => {
        if (!cancelled) setResult(r)
      })
    }, delayMs)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [vin, claimNumber, excludeId, delayMs])
  return result
}
