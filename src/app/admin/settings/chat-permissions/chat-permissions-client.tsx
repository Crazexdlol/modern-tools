"use client"

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { canonicalPair, type ChatContact } from '@/lib/chat/types'

interface PermRow { userAId: string; userBId: string }
interface LoadResponse { users: ChatContact[]; permissions: PermRow[]; migrationPending?: true }

export function ChatPermissionsClient() {
  const [users, setUsers] = useState<ChatContact[] | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [migrationPending, setMigrationPending] = useState(false)
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const res = await fetch('/api/admin/chat-permissions')
    const body = await res.json().catch(() => null) as LoadResponse | null
    if (!body) return setError('Load failed')
    setUsers(body.users)
    setPerms(new Set(body.permissions.map(p => `${p.userAId}|${p.userBId}`)))
    setMigrationPending(body.migrationPending === true)
  }

  useEffect(() => { void reload() }, [])

  const toggle = async (a: string, b: string, next: boolean) => {
    const pair = canonicalPair(a, b)
    const key = `${pair.userAId}|${pair.userBId}`
    setBusyCell(key)
    const prev = new Set(perms)
    const optimistic = new Set(perms)
    if (next) optimistic.add(key); else optimistic.delete(key)
    setPerms(optimistic)
    const res = await fetch('/api/admin/chat-permissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAId: pair.userAId, userBId: pair.userBId, allow: next }),
    })
    setBusyCell(null)
    if (!res.ok) { setPerms(prev); setError('Toggle failed') }
  }

  const activeUsers = useMemo(() => (users ?? []), [users])

  if (users === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (migrationPending) {
    return (
      <div className="p-6 rounded border border-amber-200 bg-amber-50 text-sm text-amber-900">
        Chat tables haven&apos;t been created yet. Run <code>supabase/migration-chat.sql</code> in the Supabase SQL editor, then reload.
      </div>
    )
  }
  if (activeUsers.length === 0) {
    return <div className="text-sm text-slate-500 italic">No users yet.</div>
  }

  return (
    <div className="overflow-auto bg-white border border-slate-200 rounded-lg">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">User</th>
            {activeUsers.map(u => (
              <th
                key={u.id}
                className="border-b border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-600 whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', minWidth: 32 }}
                title={u.email}
              >
                {u.name || u.email}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeUsers.map(row => (
            <tr key={row.id}>
              <th className="sticky left-0 bg-white border-r border-slate-200 px-3 py-1.5 text-left font-medium text-slate-800 whitespace-nowrap">
                {row.name || row.email}
                {row.role === 'admin' && <span className="ml-2 text-blue-600 text-xs">Admin</span>}
              </th>
              {activeUsers.map(col => {
                const diag = row.id === col.id
                const adminRow = row.role === 'admin'
                const adminCol = col.role === 'admin'
                const alwaysAllowed = adminRow || adminCol
                const pair = canonicalPair(row.id, col.id)
                const key = `${pair.userAId}|${pair.userBId}`
                const checked = alwaysAllowed || perms.has(key)
                const disabled = diag || alwaysAllowed || busyCell === key
                return (
                  <td key={col.id} className="border-t border-slate-100 px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={e => void toggle(row.id, col.id, e.target.checked)}
                      className="accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="p-3 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
    </div>
  )
}
