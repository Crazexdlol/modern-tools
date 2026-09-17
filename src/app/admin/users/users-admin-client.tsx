"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fetchAllProfilesBrowser, type Profile, type Role } from '@/lib/supabase/profiles'
import { fetchAllLicenses, getLicenseAlertLevel, isBannerLevel } from '@/lib/supabase/appraiser-licenses'

export function UsersAdminClient() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [alertingUserIds, setAlertingUserIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = async () => {
    const [rows, licenses] = await Promise.all([fetchAllProfilesBrowser(), fetchAllLicenses()])
    setProfiles(rows)
    const alertIds = new Set<string>()
    for (const lic of licenses) {
      if (isBannerLevel(getLicenseAlertLevel(lic.expirationDate))) {
        alertIds.add(lic.userId)
      }
    }
    setAlertingUserIds(alertIds)
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
  }, [])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Failed'); return }
    setDeleteTarget(null)
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/settings/users/${p.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {alertingUserIds.has(p.id) && (
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="License expiring or expired" />
                    )}
                    {p.name || <span className="text-gray-400 italic">No name</span>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{p.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    p.role === 'admin'
                      ? 'text-purple-700 bg-purple-50 border-purple-200'
                      : 'text-gray-700 bg-gray-100 border-gray-200'
                  }`}>
                    {p.role === 'admin' ? 'Admin' : 'Appraiser'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.isActive ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-gray-500 bg-gray-100 border-gray-200">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="text-gray-400 hover:text-red-600"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddUserModal onClose={() => { setShowAdd(false); load() }} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this user?"
        message={
          deleteTarget ? (
            <>
              Delete <b>{deleteTarget.name || deleteTarget.email}</b>? They lose access immediately
              and any claims currently assigned to them become <b>Unassigned</b>. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        variant="danger"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
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
