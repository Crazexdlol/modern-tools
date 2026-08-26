import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { UsersAdminClient } from './users-admin-client'

export default async function AdminUsersPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Renders notFound() (404) for non-admins before the client component mounts */}
      <AdminGuard />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        <UsersAdminClient />
      </main>
    </div>
  )
}
