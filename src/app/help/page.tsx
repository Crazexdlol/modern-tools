import { AppHeader } from '@/components/app-header'
import { HelpClient } from './help-client'

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Help</h1>
          <p className="text-sm text-gray-500 max-w-xl mx-auto">
            Browse the curated how-to articles, or chat with Henry below.
          </p>
        </div>
        <HelpClient />
      </main>
    </div>
  )
}
