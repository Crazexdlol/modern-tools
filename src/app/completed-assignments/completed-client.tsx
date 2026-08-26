"use client"

import { useEffect, useState } from 'react'
import { ClaimsTable } from '@/components/claims-table'
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'

export function CompletedAssignmentsClient() {
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const load = async () => {
    const [claims, profs] = await Promise.all([
      fetchACVHistory(),
      fetchAllProfilesBrowser(),
    ])
    if (claims === null) setFetchError(true)
    else setEntries(claims)
    setProfiles(profs)
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern; setState fires only after the async fetch resolves
    load()
  }, [])

  // Only claims that are: open (not yet closed) AND have a submitted_at set.
  // These are the ones waiting on admin review.
  const submitted = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)

  if (fetchError) {
    return (
      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        Could not load claims from the database. Check your connection, then refresh.
      </div>
    )
  }

  return (
    <ClaimsTable
      entries={submitted}
      onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
      emptyText={loading ? 'Loading…' : 'No completed assignments to review.'}
      adminView
      profiles={profiles}
      showSubmittedColumn
      onAssignmentChanged={load}
    />
  )
}
