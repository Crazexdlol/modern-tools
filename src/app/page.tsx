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
import { fetchSiteSetting } from '@/lib/supabase/site-settings'
import { fetchUnreadCount } from '@/lib/supabase/messages'

export default function DashboardPage() {
  const router = useRouter()
  const { profile } = useCurrentProfile()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [fetchError, setFetchError] = useState(false)
  const [allowCreate, setAllowCreate] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const load = async () => {
    const [claims, profs, gate, unread] = await Promise.all([
      fetchACVHistory(),
      fetchAllProfilesBrowser(),
      fetchSiteSetting<boolean>('allow_regular_create_claims'),
      fetchUnreadCount(),
    ])
    if (claims === null) setFetchError(true); else setEntries(claims)
    setProfiles(profs)
    setAllowCreate(gate ?? true)
    setUnreadMessages(unread)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern; setState fires only after the async fetch resolves
    load()
  }, [])

  const isAdmin = profile?.role === 'admin'
  const openClaims = entries.filter(e => e.status !== 'closed' && !e.submittedAt)
  const submittedClaims = entries.filter(e => e.status !== 'closed' && !!e.submittedAt)
  // Master + grant: admins always; non-admins need BOTH the site-wide master
  // (allowCreate) and their per-user grant (profile.canCreateClaims).
  const canCreate = isAdmin || (allowCreate && profile?.canCreateClaims === true)

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
          <div className="flex items-center gap-2">
            <Link
              href="/messages"
              className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Messages
              {unreadMessages > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold">
                  {unreadMessages}
                </span>
              )}
            </Link>
            {isAdmin && (
              <Link
                href="/completed-assignments"
                className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
              >
                <Inbox className="w-4 h-4" />
                Completed Assignments
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
        <ClaimsTable
          entries={openClaims}
          onDeleted={(id) => setEntries(prev => prev.filter(e => e.id !== id))}
          emptyText={isAdmin ? 'No open claims.' : 'No claims assigned to you.'}
          adminView={isAdmin}
          profiles={profiles}
          onAssignmentChanged={load}
        />
      </main>
    </div>
  )
}
