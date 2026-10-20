import { AppHeader } from '@/components/app-header'
import { AdminGuard } from '../_guard'
import { SettingsNav } from './_settings-nav'

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AdminGuard />
      <AppHeader />
      <main className="max-w-[1400px] mx-auto px-6 py-7 flex gap-8">
        <SettingsNav />
        <div className="flex-1 min-w-0">{children}</div>
      </main>
    </div>
  )
}
