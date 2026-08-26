"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchUnreadQueue, type UnreadClaim } from '@/lib/supabase/messages'

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function MessagesQueueClient() {
  const [claims, setClaims] = useState<UnreadClaim[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUnreadQueue()
      .then(setClaims)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load queue'))
  }, [])

  if (error) {
    return (
      <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
    )
  }

  if (claims === null) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (claims.length === 0) {
    return <div className="text-sm text-gray-500 italic">No unread messages.</div>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Claim</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unread</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last message</th>
          </tr>
        </thead>
        <tbody>
          {claims.map(c => (
            <tr key={c.claimId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/claims/${encodeURIComponent(c.claimId)}?tab=messages`}
                  className="text-gray-900 hover:text-blue-600 font-medium block"
                >
                  {c.maNumber || c.claimId}
                  {c.insuredName && <span className="text-gray-500 font-normal"> · {c.insuredName}</span>}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-700">{c.vehicle || '—'}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-blue-600 text-white text-xs font-bold">
                  {c.unreadCount}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {fmtStamp(c.lastMessageAt)} <span className="text-gray-400">·</span> {c.lastMessageFrom}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
