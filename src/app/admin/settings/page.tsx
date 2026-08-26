import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { SettingsAdminClient } from './settings-admin-client'

export default async function AdminSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AdminGuard />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Site Settings</h1>
        <SettingsAdminClient />
      </main>
    </div>
  )
}
