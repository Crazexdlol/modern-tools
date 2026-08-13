"use client"

import { useState, useEffect } from 'react'
import { AppHeader } from "@/components/app-header";
import { ClaimsTable } from "@/components/claims-table";
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'

// All Claims — every claim regardless of status, with an Open/Closed column.
export default function AllClaimsPage() {
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    fetchACVHistory().then(result => {
      if (result === null) setFetchError(true)
      else setEntries(result)
    })
  }, [])

  const openCount = entries.filter(e => e.status !== 'closed').length
  const closedCount = entries.length - openCount

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">All Claims</h2>
          <p className="text-sm text-gray-400">
            {entries.length} claims — {openCount} open, {closedCount} closed
          </p>
        </div>

        {fetchError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh. If this keeps happening, log out and back in.
          </div>
        )}
        <ClaimsTable
          entries={entries}
          onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
          emptyText="No claims yet."
          showStatus
        />
      </main>
    </div>
  )
}
