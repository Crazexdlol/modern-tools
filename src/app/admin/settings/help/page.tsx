import { SuperAdminGuard } from '@/app/admin/_guard'
import { HelpAdminClient } from './help-admin-client'

export default async function AdminSettingsHelpPage() {
  await SuperAdminGuard()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Help Articles</h1>
      <p className="text-sm text-gray-500 mb-6">
        Curated Q&amp;A shown to users on <code>/help</code>. Henry (the built-in AI
        assistant) also reads these articles as context for answers he generates —
        keep them concise and current.
      </p>
      <HelpAdminClient />
    </div>
  )
}
