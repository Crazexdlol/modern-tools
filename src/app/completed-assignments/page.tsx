import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../admin/_guard'
import { CompletedAssignmentsClient } from './completed-client'

export default async function CompletedAssignmentsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Renders notFound() (404) for non-admins */}
      <AdminGuard />
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Completed Assignments</h2>
          <p className="text-sm text-gray-400">
            Claims submitted by appraisers, waiting for admin review. Open a
            claim to Approve (close it) or Send Back (return to the appraiser).
          </p>
        </div>
        <CompletedAssignmentsClient />
      </main>
    </div>
  )
}
