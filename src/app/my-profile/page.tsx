import { AppHeader } from '@/components/app-header'
import { MyProfileClient } from './my-profile-client'

export default function MyProfilePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="hp-display mb-6">My Profile</h1>
        <MyProfileClient />
      </main>
    </div>
  )
}
