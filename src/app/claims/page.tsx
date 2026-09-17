"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppHeader } from "@/components/app-header";
import { ClaimsTable } from "@/components/claims-table";
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'

// All Claims — every claim regardless of status, with an Open/Closed column.
// Admin-only: non-admins are redirected to the dashboard. The top-nav link is
// hidden for non-admins in app-header.tsx, and RLS on acv_history would still
// filter the fetch, but the redirect keeps the URL from resolving to an empty
// page for anyone who deep-links here.
export default function AllClaimsPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const { profile, loading: profileLoading } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'

  // Route-level guard: bounce non-admins as soon as their profile resolves.
  useEffect(() => {
    if (profileLoading) return
    if (profile && !isAdmin) router.replace('/')
  }, [profile, profileLoading, isAdmin, router])

  const load = () => {
    fetchACVHistory().then(result => {
      if (result === null) setFetchError(true)
      else setEntries(result)
    })
    fetchAllProfilesBrowser().then(setProfiles)
  }

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">All Claims</h2>
          <p className="text-sm text-gray-400">{entries.length} claims</p>
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
          adminView={isAdmin}
          profiles={profiles}
          onAssignmentChanged={load}
          onStarChanged={(id, starred) => setEntries(prev =>
            prev.map(e => e.id === id ? { ...e, starred } : e)
          )}
        />
      </main>
    </div>
  )
}
