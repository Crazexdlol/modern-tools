import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { createClient } from '@/lib/supabase/server'
import { getLockoutStateForUser } from '@/lib/supabase/lockout'
import { MessagesQueueClient } from './messages-queue-client'

export default async function MessagesQueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const lockout = await getLockoutStateForUser(user.id)
    if (lockout.isLocked) redirect('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      {/* Match the main dashboard container width (max-w-[1920px] + px-6) so
          the queue table has the same horizontal real estate — all columns
          fit without horizontal scroll. */}
      <main className="max-w-[1920px] mx-auto px-6 pt-4 pb-8 space-y-5">
        <Link href="/" className="hp-btn hp-btn-sm hp-btn-ghost w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <h1 className="hp-display">Messages</h1>
        <MessagesQueueClient />
      </main>
    </div>
  )
}
