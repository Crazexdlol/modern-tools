"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Inbox, MessageSquare } from 'lucide-react'
import { MigrateData } from "@/components/migrate-data"
import { AppHeader } from "@/components/app-header"
import { ClaimsTable } from "@/components/claims-table"
import { fetchACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import { useCurrentProfile, fetchAllProfilesBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchUnreadCount } from '@/lib/supabase/messages'
import { LicenseExpirationBanner } from '@/components/license-expiration-banner'

export default function DashboardPage() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [claimsLoading, setClaimsLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  // Three independent fetches. Each has its own timing log so we can spot the
  // slow one. Nothing blocks anything else — the claims table can render as
  // soon as its own fetch resolves, without waiting for messages or profiles.
  const load = () => {
    const time = <T,>(label: string, fn: () => Promise<T>) => {
      const start = performance.now()
      return fn().then(result => {
        console.log(`[dashboard perf] ${label}: ${Math.round(performance.now() - start)}ms`)
        return result
      })
    }
    setClaimsLoading(true)
    time('fetchACVHistory', fetchACVHistory).then(claims => {
      if (claims === null) setFetchError(true); else setEntries(claims)
      setClaimsLoading(false)
    })
    time('fetchAllProfilesBrowser', fetchAllProfilesBrowser).then(setProfiles)
    time('fetchUnreadCount', fetchUnreadCount).then(setUnreadMessages)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern; setState fires only after the async fetch resolves
    load()
  }, [])

  const isAdmin = profile?.role === 'admin'
  const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
  const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
  // Admins always; non-admins need their per-user grant (profile.canCreateClaims).
  const canCreate = isAdmin || profile?.canCreateClaims === true

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
      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
        <LicenseExpirationBanner profile={profile ?? null} allProfiles={profiles} />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-sm">
                <span className="text-base leading-none">{openClaims.length}</span>
                <span className="text-xs uppercase tracking-wide opacity-90">open</span>
              </span>
              <Link
                href="/messages"
                className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Messages
                {unreadMessages > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold">
                    {unreadMessages}
                  </span>
                )}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/completed-assignments"
                className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
              >
                <Inbox className="w-4 h-4" />
                Completed
                {submittedClaims.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold">
                    {submittedClaims.length}
                  </span>
                )}
              </Link>
            )}
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
        </div>

        {fetchError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Could not load claims from the database. Check your connection, then refresh.
          </div>
        )}

        {/* Open Claims — the only table on the dashboard. Completed assignments
            live on /completed-assignments (button above). */}
        {claimsLoading ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 flex items-center justify-center gap-3 text-gray-500">
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading claims…</span>
          </div>
        ) : (
          <ClaimsTable
            entries={openClaims}
            onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
            emptyText={isAdmin ? 'No open claims.' : 'No claims assigned to you.'}
            adminView={isAdmin}
            profiles={profiles}
            onAssignmentChanged={load}
          />
        )}
      </main>
    </div>
  )
}
