import { ChatPermissionsClient } from './chat-permissions-client'

export default function AdminChatPermissionsPage() {
  return (
    <div>
      <h1 className="hp-display mb-6">Chat Permissions</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-2xl">
        Flip a cell to allow the two users to chat. Pairs are symmetric — allowing A ↔ B lets either side start the conversation. Admins can chat with anyone regardless of this grid.
      </p>
      <ChatPermissionsClient />
    </div>
  )
}
