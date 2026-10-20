"use client"

import { useEffect, useRef, useState } from 'react'
import { Trash2, Download, Upload } from 'lucide-react'
import { fetchUserDocuments, type AppraiserDocument } from '@/lib/supabase/appraiser-documents'
import { confirmDialog } from '@/components/ui/dialog-service'

const KIND_SUGGESTIONS = ['W9', 'License', 'Contract', 'Insurance', 'Other']

export function DocumentsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AppraiserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setRows(await fetchUserDocuments(userId))
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-load pattern
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const upload = async (file: File) => {
    setBusy(true); setError(null)
    const form = new FormData()
    form.set('userId', userId)
    form.set('file', file)
    if (pendingKind) form.set('kind', pendingKind)
    const res = await fetch('/api/admin/appraiser-documents/upload', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Upload failed'); return }
    setPendingKind('')
    load()
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
    const res = await fetch(`/api/admin/appraiser-documents/${id}`, { method: 'DELETE' })
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
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
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
