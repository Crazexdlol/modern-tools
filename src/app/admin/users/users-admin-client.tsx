"use client"

import { useEffect, useState } from 'react'
import { Trash2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchAllProfilesBrowser, type Profile, type Role } from '@/lib/supabase/profiles'

export function UsersAdminClient() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setProfiles(await fetchAllProfilesBrowser())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const changeRole = async (id: string, role: Role) => {
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }
  const changeName = async (id: string, name: string) => {
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this user? They lose access immediately and any claims assigned to them become Unassigned.')) return
    setError(null)
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${profiles.length} user${profiles.length === 1 ? '' : 's'}`}
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white gap-2">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <input
                    className="bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none px-1 py-0.5 text-sm text-gray-800 w-full"
                    defaultValue={p.name}
                    onBlur={(e) => { if (e.target.value !== p.name) changeName(p.id, e.target.value) }}
                  />
                </td>
                <td className="px-4 py-3 text-gray-600">{p.email}</td>
                <td className="px-4 py-3">
                  <select
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-sm"
                    value={p.role}
                    onChange={(e) => changeRole(p.id, e.target.value as Role)}
                  >
                    <option value="appraiser">Appraiser</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(p.id)} className="text-gray-400 hover:text-red-600" title="Delete user">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddUserModal onClose={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('appraiser')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null)
    if (!email || !password) { setErr('Email and password are required'); return }
    if (password.length < 8) { setErr('Password must be 8+ characters'); return }
    setBusy(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, role }),
    })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? 'Create failed'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <input placeholder="Password (8+ chars)" type="password" value={password} onChange={e => setPassword(e.target.value)}
               className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm" />
        <select value={role} onChange={e => setRole(e.target.value as Role)}
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm">
          <option value="appraiser">Appraiser</option>
          <option value="admin">Admin</option>
        </select>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-blue-600 text-white">
            {busy ? 'Creating…' : 'Create User'}
          </Button>
        </div>
      </div>
    </div>
  )
}
