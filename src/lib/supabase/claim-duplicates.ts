import { useEffect, useState } from 'react'

export interface DuplicateMatch {
  id: string
  maNumber: string
  claimNumber: string
  insuredName: string
  vehicle: string
  date: string  // ISO
}

export interface DuplicateResult {
  vinMatches: DuplicateMatch[]
  vinCount: number
  claimNumberMatches: DuplicateMatch[]
  claimNumberCount: number
  maNumberMatches: DuplicateMatch[]
  maNumberCount: number
}

const EMPTY: DuplicateResult = {
  vinMatches: [], vinCount: 0,
  claimNumberMatches: [], claimNumberCount: 0,
  maNumberMatches: [], maNumberCount: 0,
}

export async function fetchClaimDuplicates(params: {
  vin?: string
  claimNumber?: string
  maNumber?: string
  excludeId?: string | null
}): Promise<DuplicateResult> {
  const { vin, claimNumber, maNumber, excludeId } = params
  if (!vin?.trim() && !claimNumber?.trim() && !maNumber?.trim()) return EMPTY
  const q = new URLSearchParams()
  if (vin?.trim()) q.set('vin', vin.trim())
  if (claimNumber?.trim()) q.set('claimNumber', claimNumber.trim())
  if (maNumber?.trim()) q.set('maNumber', maNumber.trim())
  if (excludeId) q.set('excludeId', excludeId)
  try {
    const res = await fetch(`/api/claims/duplicates?${q.toString()}`)
    if (!res.ok) return EMPTY
    return (await res.json()) as DuplicateResult
  } catch {
    return EMPTY
  }
}

// Debounced live duplicate check as the user types VIN / claim # / MA#.
// Callers pass current field values + optional excludeId (the current
// claim's id when editing an existing claim).
export function useDuplicateCheck(
  vin: string,
  claimNumber: string,
  maNumber: string,
  excludeId?: string | null,
  delayMs: number = 500,
): DuplicateResult {
  const [result, setResult] = useState<DuplicateResult>(EMPTY)
  useEffect(() => {
    const v = vin.trim()
    const c = claimNumber.trim()
    const m = maNumber.trim()
    if (!v && !c && !m) { setResult(EMPTY); return }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchClaimDuplicates({ vin: v, claimNumber: c, maNumber: m, excludeId }).then(r => {
        if (!cancelled) setResult(r)
      })
    }, delayMs)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [vin, claimNumber, maNumber, excludeId, delayMs])
  return result
}
