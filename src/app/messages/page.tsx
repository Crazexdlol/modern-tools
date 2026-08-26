import { AppHeader } from '@/components/app-header'
import { MessagesQueueClient } from './messages-queue-client'

export default async function MessagesQueuePage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Messages</h2>
          <p className="text-sm text-gray-400">
            Claims with unread messages for you. Open one to read the thread and reply.
          </p>
        </div>
        <MessagesQueueClient />
      </main>
    </div>
  )
}
