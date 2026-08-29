import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { SettingsNav } from './_settings-nav'

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AdminGuard />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-8 flex gap-8">
        <SettingsNav />
        <div className="flex-1 min-w-0">{children}</div>
      </main>
    </div>
  )
}
