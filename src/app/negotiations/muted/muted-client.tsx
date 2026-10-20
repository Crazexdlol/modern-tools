"use client"

import { useEffect, useState } from 'react'
import type { MutedSenderRow } from '@/app/api/negotiations/mute/route'
import { confirmDialog } from '@/components/ui/dialog-service'

export function MutedClient() {
  const [entries, setEntries] = useState<MutedSenderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/negotiations/mute', { cache: 'no-store' })
      const json = await res.json() as { entries?: MutedSenderRow[]; error?: string }
      if (json.error) setError(json.error)
      setEntries(json.entries ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => { load() }, [])

  const unmute = async (id: string) => {
    if (!(await confirmDialog({ title: 'Unmute sender?', message: 'Future emails will show up in triage again. Already-muted threads stay in spam.', confirmLabel: 'Unmute' }))) return
    const res = await fetch(`/api/negotiations/mute/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError(`Unmute failed (${res.status})`)
      return
    }
    setEntries(prev => (prev ?? []).filter(e => e.id !== id))
  }

  if (error) return <div className="text-sm text-red-600">Error: {error}</div>
  if (entries === null) return <div className="text-sm text-gray-400">Loading…</div>
  if (entries.length === 0) return <div className="text-sm text-gray-500">Nothing muted yet.</div>

  return (
    <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-xl overflow-hidden">
      {entries.map(e => (
        <li key={e.id} className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-900 truncate">
              {e.email ?? `@${e.domain}`}
            </div>
            <div className="text-xs text-gray-500">
              Muted {new Date(e.muted_at).toLocaleDateString()}
              {e.note ? ` — ${e.note}` : ''}
            </div>
          </div>
          <button
            onClick={() => unmute(e.id)}
            className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-md px-2 py-1"
          >
            Unmute
          </button>
        </li>
      ))}
    </ul>
  )
}
