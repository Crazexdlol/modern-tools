"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { MigrateData } from "@/components/migrate-data"
import { AppHeader } from "@/components/app-header"
import { ClaimsTable } from "@/components/claims-table"
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchSiteSetting } from '@/lib/supabase/site-settings'

export default function DashboardPage() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [allowCreate, setAllowCreate] = useState(true)

  const load = async () => {
    const [claims, profs, gate] = await Promise.all([
      fetchACVHistory(),
      fetchAllProfilesBrowser(),
      fetchSiteSetting<boolean>('allow_regular_create_claims'),
    ])
    if (claims === null) setFetchError(true); else setEntries(claims)
    setProfiles(profs)
    setAllowCreate(gate ?? true)
  }
  useEffect(() => { load() }, [])

  const isAdmin = profile?.role === 'admin'
  const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
  const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
  const canCreate = isAdmin || allowCreate

  const startNewClaim = () => {
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
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <p className="text-sm text-gray-400">{openClaims.length} open</p>
          </div>
          {canCreate && (
            <button
              onClick={startNewClaim}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Claim
            </button>
          )}
        </div>

        {fetchError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh.
          </div>
        )}

        {/* Open Claims card */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Open Claims</h3>
          <ClaimsTable
            entries={openClaims}
            onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
            emptyText={isAdmin ? 'No open claims.' : 'No claims assigned to you.'}
            adminView={isAdmin}
            profiles={profiles}
            onAssignmentChanged={load}
          />
        </section>

        {/* Completed Assignments (admin only) */}
        {isAdmin && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Completed Assignments</h3>
            {submittedClaims.length === 0 ? (
              <div className="text-sm text-gray-400 italic">No completed assignments to review.</div>
            ) : (
              <ClaimsTable
                entries={submittedClaims}
                onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
                emptyText=""
                adminView
                profiles={profiles}
                showSubmittedColumn
                onAssignmentChanged={load}
              />
            )}
          </section>
        )}
      </main>
    </div>
  )
}
