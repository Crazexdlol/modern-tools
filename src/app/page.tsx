"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { MigrateData } from "@/components/migrate-data";
import { AppHeader } from "@/components/app-header";
import { ClaimsTable } from "@/components/claims-table";
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'

export default function OpenClaimsDashboard() {
  const router = useRouter()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    fetchACVHistory().then(result => {
      if (result === null) setFetchError(true)
      else setEntries(result)
    })
  }, [])

  const open = entries.filter(e => e.status !== 'closed')

  const startNewClaim = () => {
    // Clear any stale drafts so a new claim always starts blank.
    localStorage.removeItem('modern-tools-comp-finder-draft')
    localStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-comp-finder-draft')
    sessionStorage.removeItem('modern-tools-auto-acv-draft')
    sessionStorage.removeItem('modern-tools-acv-edit')
    router.push('/claims/new')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <MigrateData />
      <AppHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-400">{open.length} claims</p>
          </div>
          <button
            onClick={startNewClaim}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Claim
          </button>
        </div>

        {fetchError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh. If this keeps happening, log out and back in.
          </div>
        )}
        <ClaimsTable
          entries={open}
          onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
          emptyText="No open claims. Click New Claim to start one."
        />
      </main>
    </div>
  )
}
