"use client"

import { useEffect, useRef, useState } from 'react'
import { fetchCurrentProfileBrowser, type Profile } from '@/lib/supabase/profiles'
import { fetchFeeCatalog, type FeeCatalogEntry } from '@/lib/supabase/fee-catalog'
import { fetchAppraiserFees } from '@/lib/supabase/appraiser-fees'
import {
  fetchUserLicenses,
  getLicenseAlertLevel,
  type AppraiserLicense,
  type LicenseAlertLevel,
} from '@/lib/supabase/appraiser-licenses'
import { fetchUserDocuments, type AppraiserDocument } from '@/lib/supabase/appraiser-documents'
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/ui/dialog-service'

type TabKey = 'info' | 'password' | 'licenses' | 'documents' | 'fees'

export function MyProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  useEffect(() => {
    fetchCurrentProfileBrowser().then(p => { setProfile(p); setLoading(false) })
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">Profile not found.</div>

  // Fees tab is admin-only. Appraisers never see fee amounts for themselves.
  const isAdmin = profile.role === 'admin'
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'info',      label: 'Information' },
    { key: 'password',  label: 'Password' },
    { key: 'licenses',  label: 'Licenses' },
    { key: 'documents', label: 'Documents' },
    ...(isAdmin ? [{ key: 'fees' as TabKey, label: 'Fees' }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'info'      && <InfoTab profile={profile} onProfileChange={setProfile} />}
      {tab === 'password'  && <PasswordTab email={profile.email} />}
      {tab === 'licenses'  && <LicensesTab userId={profile.id} />}
      {tab === 'documents' && <DocumentsTab userId={profile.id} />}
      {tab === 'fees'      && isAdmin && <FeesTab userId={profile.id} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Information tab
// ─────────────────────────────────────────────────────────────────────────────

function InfoTab({ profile, onProfileChange }: { profile: Profile; onProfileChange: (p: Profile) => void }) {
  const addr = [profile.addressStreet, profile.addressCity, profile.addressState, profile.addressZip].filter(Boolean).join(', ') || '—'
  return (
    <div className="space-y-6 max-w-lg">
      <dl className="space-y-3">
        <Row label="Name"    value={profile.name || '—'} />
        <Row label="Email"   value={profile.email} />
        <Row label="Phone"   value={profile.phone || '—'} />
        <Row label="Address" value={addr} />
        <Row label="Status"  value={profile.isActive ? 'Active' : 'Inactive'} />
      </dl>
      <EmailNotificationsToggle profile={profile} onProfileChange={onProfileChange} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100">
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-800">{value}</dd>
    </div>
  )
}

function EmailNotificationsToggle({ profile, onProfileChange }: { profile: Profile; onProfileChange: (p: Profile) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const next = !profile.emailNotificationsEnabled
    setSaving(true); setError(null)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailNotificationsEnabled: next }),
    })
    setSaving(false)
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: 'Failed to save' }))
      setError(msg ?? 'Failed to save')
      return
    }
    onProfileChange({ ...profile, emailNotificationsEnabled: next })
  }

  return (
    <div className="pt-4 border-t border-gray-200">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notifications</div>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={profile.emailNotificationsEnabled}
          onChange={toggle}
          disabled={saving}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800">Email me when system events happen</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Claim assigned to you, claim removed from your queue, new messages on your claims. Admin broadcasts come through regardless.
          </div>
          {saving && <div className="mt-1 text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</div>}
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
      </label>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Password tab (migrated from the old /profile page)
// ─────────────────────────────────────────────────────────────────────────────

function PasswordTab({ email }: { email: string }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changePassword = async () => {
    setPwErr(null); setPwMessage(null)
    if (newPw.length < 8) { setPwErr('New password must be 8+ characters'); return }
    if (newPw !== confirmPw) { setPwErr('New passwords do not match'); return }
    if (!email) { setPwErr('No email on profile'); return }
    setBusy(true)
    const supabase = createClient()
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
    if (reauthErr) { setBusy(false); setPwErr('Current password is incorrect'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setBusy(false)
    if (error) { setPwErr(error.message); return }
    setPwMessage('Password updated')
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
  }

  return (
    <div className="max-w-md space-y-3">
      <input
        type="password"
        placeholder="Current password"
        className={inputCls + ' w-full py-2'}
        value={currentPw}
        onChange={(e) => setCurrentPw(e.target.value)}
        autoComplete="current-password"
      />
      <input
        type="password"
        placeholder="New password (8+ chars)"
        className={inputCls + ' w-full py-2'}
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Confirm new password"
        className={inputCls + ' w-full py-2'}
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        autoComplete="new-password"
      />
      {pwErr && <div className="text-red-600 text-sm">{pwErr}</div>}
      {pwMessage && <div className="text-green-700 text-sm">{pwMessage}</div>}
      <button
        onClick={changePassword}
        disabled={busy}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Change Password'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Licenses tab — appraisers can self-manage via /api/profile/licenses
// ─────────────────────────────────────────────────────────────────────────────

interface LicenseDraft {
  id: string | null
  state: string
  licenseNumber: string
  expirationDate: string
  status: 'active' | 'expired' | 'pending'
  licenseType: string
  notes: string
}
const emptyLicenseDraft = (): LicenseDraft => ({ id: null, state: '', licenseNumber: '', expirationDate: '', status: 'active', licenseType: '', notes: '' })

function LicensesTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<LicenseDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => { setRows(await fetchUserLicenses(userId)); setLoading(false) }
  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId])

  const startEdit = (row: AppraiserLicense) => {
    setDraft({
      id: row.id,
      state: row.state,
      licenseNumber: row.licenseNumber,
      expirationDate: row.expirationDate,
      status: row.status,
      licenseType: row.licenseType ?? '',
      notes: row.notes ?? '',
    })
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.state || !draft.licenseNumber || !draft.expirationDate) {
      setError('State, license number, and expiration date are required.')
      return
    }
    setBusy(true); setError(null)
    const body = {
      state: draft.state,
      licenseNumber: draft.licenseNumber,
      expirationDate: draft.expirationDate,
      status: draft.status,
      licenseType: draft.licenseType.trim() || null,
      notes: draft.notes || null,
    }
    const res = draft.id === null
      ? await fetch('/api/profile/licenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`/api/profile/licenses/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setDraft(null); load()
  }

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete license?', message: 'This license record will be removed. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' }))) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/profile/licenses/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading licenses…</div>

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex justify-end">
        <button
          onClick={() => { setDraft(emptyLicenseDraft()); setError(null) }}
          disabled={draft !== null}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add License
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">State</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">License #</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[260px]">Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Expires</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Status</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditing = draft?.id === row.id
              const level = getLicenseAlertLevel(row.expirationDate)
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50/40' : ''}`}>
                  {isEditing && draft ? (
                    <LicenseEditRow draft={draft} setDraft={setDraft} save={save} cancel={() => setDraft(null)} busy={busy} />
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{row.state}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.licenseNumber}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 break-words">{row.licenseType || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.expirationDate}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={row.status} />
                          <LevelBadge level={level} expiration={row.expirationDate} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => startEdit(row)} disabled={draft !== null || busy} className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-40">Edit</button>
                          <button onClick={() => remove(row.id)} disabled={draft !== null || busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {draft && draft.id === null && (
              <tr className="bg-blue-50/40 border-b border-gray-100">
                <LicenseEditRow draft={draft} setDraft={setDraft} save={save} cancel={() => setDraft(null)} busy={busy} />
              </tr>
            )}
            {rows.length === 0 && !draft && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400 italic">No licenses on file. Click Add License to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

function LicenseEditRow({ draft, setDraft, save, cancel, busy }: { draft: LicenseDraft; setDraft: (d: LicenseDraft) => void; save: () => void; cancel: () => void; busy: boolean }) {
  return (
    <>
      <td className="px-3 py-2"><StateSelect value={draft.state} onChange={v => setDraft({ ...draft, state: v })} /></td>
      <td className="px-3 py-2"><input value={draft.licenseNumber} onChange={e => setDraft({ ...draft, licenseNumber: e.target.value })} placeholder="License #" className={inputCls + ' w-full'} /></td>
      <td className="px-3 py-2"><input value={draft.licenseType} onChange={e => setDraft({ ...draft, licenseType: e.target.value })} placeholder="e.g. Independent Adjuster" className={inputCls + ' w-full'} /></td>
      <td className="px-3 py-2"><input type="date" value={draft.expirationDate} onChange={e => setDraft({ ...draft, expirationDate: e.target.value })} className={inputCls + ' w-full'} /></td>
      <td className="px-3 py-2">
        <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as LicenseDraft['status'] })} className={inputCls + ' w-full'}>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-2">
          <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} disabled={busy} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded disabled:opacity-40">
            Cancel
          </button>
        </div>
      </td>
    </>
  )
}

function StateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls + ' w-full'}>
      <option value="">Select…</option>
      {US_STATES.map(s => (
        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
      ))}
    </select>
  )
}

function StatusPill({ status }: { status: 'active' | 'expired' | 'pending' }) {
  const styles: Record<string, string> = {
    active:  'text-emerald-700 bg-emerald-50 border-emerald-200',
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
    expired: 'text-red-700 bg-red-100 border-red-300',
  }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${styles[status] ?? styles.active}`}>{status}</span>
}

function LevelBadge({ level, expiration }: { level: LicenseAlertLevel; expiration: string }) {
  if (level === 'none') return null
  const daysUntil = Math.floor((new Date(expiration + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const styles: Record<Exclude<LicenseAlertLevel, 'none'>, { cls: string; text: string }> = {
    notice:  { cls: 'text-amber-700 bg-amber-50 border-amber-200', text: `${daysUntil}d` },
    warning: { cls: 'text-amber-700 bg-amber-100 border-amber-300', text: `${daysUntil}d` },
    urgent:  { cls: 'text-red-700 bg-red-50 border-red-200', text: `${daysUntil}d` },
    expired: { cls: 'text-red-700 bg-red-100 border-red-300', text: 'EXPIRED' },
  }
  const s = styles[level]
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents tab — appraisers can self-manage via /api/profile/documents
// ─────────────────────────────────────────────────────────────────────────────

const KIND_SUGGESTIONS = ['W9', 'License', 'Contract', 'Insurance', 'Other']

function DocumentsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => { setRows(await fetchUserDocuments(userId)); setLoading(false) }
  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId])

  const upload = async (file: File) => {
    setBusy(true); setError(null)
    const form = new FormData()
    form.set('file', file)
    if (pendingKind) form.set('kind', pendingKind)
    const res = await fetch('/api/profile/documents/upload', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Upload failed'); return }
    setPendingKind(''); load()
  }

  const download = async (id: string) => {
    const res = await fetch(`/api/appraiser-documents/${id}/download`)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Download failed'); return }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete document?', message: 'This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' }))) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/profile/documents/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">Loading documents…</div>

  return (
    <div
      className="relative space-y-4 max-w-3xl"
      onDragEnter={(e) => {
        if (!busy && e.dataTransfer.types.includes('Files')) setDragOver(true)
      }}
      onDragOver={(e) => { e.preventDefault() }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (busy) return
        const f = e.dataTransfer.files?.[0]
        if (f) upload(f)
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-blue-500/10 outline-dashed outline-2 outline-blue-500 outline-offset-[-4px]">
          <div className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-bold shadow-lg">
            <Upload className="w-5 h-5" /> Drop files to upload
          </div>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <label className="block flex-1 max-w-xs">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Kind (optional)</span>
          <input
            list="doc-kinds"
            value={pendingKind}
            onChange={e => setPendingKind(e.target.value)}
            placeholder="e.g. W9"
            className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <datalist id="doc-kinds">
            {KIND_SUGGESTIONS.map(k => <option key={k} value={k} />)}
          </datalist>
        </label>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4" /> Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Kind</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Uploaded</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(doc => (
              <tr key={doc.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2 text-gray-800">{doc.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{doc.kind ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => download(doc.id)} className="text-gray-400 hover:text-blue-600" title="Download"><Download className="w-4 h-4" /></button>
                    <button onClick={() => remove(doc.id)} disabled={busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400 italic">No documents on file.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fees tab — admin-only (hidden from appraisers)
// ─────────────────────────────────────────────────────────────────────────────

function FeesTab({ userId }: { userId: string }) {
  const [catalog, setCatalog] = useState<FeeCatalogEntry[]>([])
  const [amounts, setAmounts] = useState<Map<string, number | null>>(new Map())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([fetchFeeCatalog(), fetchAppraiserFees(userId)]).then(([c, a]) => {
      setCatalog(c); setAmounts(a); setLoading(false)
    })
  }, [userId])
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
            <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount ($)</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map(entry => {
            const label = entry.unit === 'per_mile' ? `${entry.label} ($/mile)` : entry.label
            const value = amounts.get(entry.id)
            return (
              <tr key={entry.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-2 text-gray-800">{label}</td>
                <td className="px-4 py-2 text-right text-gray-800">{value === null || value === undefined ? <span className="text-gray-400">—</span> : value.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const inputCls = 'bg-white border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
