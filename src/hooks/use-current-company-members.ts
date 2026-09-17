'use client'
import { useEffect, useState } from 'react'

// Returns the set of userIds who have access to the caller's currently-
// active company. Used by ClaimWorkspace + claims-table to filter the
// Handling Appraiser + Reassign lists so cross-company appraisers don't
// appear in company-specific pickers.
//
// While loading OR if the server returned an empty list (pre-migration or
// no active company), `memberIds` is null — callers should treat null as
// "no filtering, show everyone" for backward compatibility.
export function useCurrentCompanyMembers(): { memberIds: Set<string> | null; loading: boolean } {
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/companies/current/members', { cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setLoading(false); return }
        const json = await r.json() as { userIds?: string[] }
        if (cancelled) return
        const ids = Array.isArray(json.userIds) ? json.userIds : []
        // Empty result → treat as no-filter (pre-migration fallback).
        setMemberIds(ids.length > 0 ? new Set(ids) : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { memberIds, loading }
}
