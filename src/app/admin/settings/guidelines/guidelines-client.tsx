"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, Search, Upload, FileText, Loader2, Download } from 'lucide-react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from '../_shared'
import {
  fetchAllGuidelinesBrowser,
  type InsuranceGuideline,
} from '@/lib/supabase/insurance-guidelines'

interface ImportPreviewRow {
  rowNumber: number
  ok: boolean
  skipReason?: string
  action?: 'insert' | 'update'
  name?: string
  guidelinesPreview?: string
}
interface ImportDryRun {
  summary: { total: number; toInsert: number; toUpdate: number; skipped: number }
  preview: ImportPreviewRow[]
}
interface ParsedCsv { headers: string[]; rows: string[][] }

export function GuidelinesClient() {
  const [guidelines, setGuidelines] = useState<InsuranceGuideline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Edit state (per-row).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftGuidelines, setDraftGuidelines] = useState('')
  const [saving, setSaving] = useState(false)

  // Add state.
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addGuidelines, setAddGuidelines] = useState('')

  // Delete state.
  const [deleteTarget, setDeleteTarget] = useState<InsuranceGuideline | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [confirmDeleteEmpty, setConfirmDeleteEmpty] = useState(false)
  const [deleteEmptyBusy, setDeleteEmptyBusy] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)

  // Import state.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [dryRun, setDryRun] = useState<ImportDryRun | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [confirmImportOpen, setConfirmImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; errors: number } | null>(null)

  const load = async () => {
    setLoading(true)
    const rows = await fetchAllGuidelinesBrowser()
    setGuidelines(rows)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guidelines
    return guidelines.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.guidelines.toLowerCase().includes(q),
    )
  }, [guidelines, search])

  const startEdit = (g: InsuranceGuideline) => {
    setError(null)
    setEditingId(g.id)
    setDraftName(g.name)
    setDraftGuidelines(g.guidelines)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
    setDraftGuidelines('')
  }
  const saveEdit = async (g: InsuranceGuideline) => {
    setError(null)
    setSaving(true)
    const res = await fetch('/api/insurance-guidelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, name: draftName, guidelines: draftGuidelines }),
    })
    setSaving(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    cancelEdit()
    load()
  }

  const openAdd = () => {
    setError(null)
    setAddName('')
    setAddGuidelines('')
    setAddOpen(true)
  }
  const submitAdd = async () => {
    if (!addName.trim()) { setError('Name is required'); return }
    setSaving(true)
    const res = await fetch('/api/insurance-guidelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName, guidelines: addGuidelines }),
    })
    setSaving(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Save failed'); return }
    setAddOpen(false)
    load()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setError(null)
    const res = await fetch(`/api/insurance-guidelines/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    setDeleteTarget(null)
    load()
  }

  const deleteEmpty = async () => {
    setConfirmDeleteEmpty(false)
    setDeleteEmptyBusy(true)
    setError(null)
    const res = await fetch('/api/insurance-guidelines/empty', { method: 'DELETE' })
    setDeleteEmptyBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  const deleteAll = async () => {
    setConfirmDeleteAll(false)
    setDeleteAllBusy(true)
    setError(null)
    const res = await fetch('/api/insurance-guidelines/all', { method: 'DELETE' })
    setDeleteAllBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Delete failed'); return }
    load()
  }

  const emptyCount = useMemo(
    () => guidelines.filter(g => !g.guidelines || !g.guidelines.trim()).length,
    [guidelines],
  )

  // ---- Import flow ----
  const downloadTemplate = async () => {
    const res = await fetch('/api/admin/import/guidelines/template')
    if (!res.ok) { setImportError('Could not download template'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'modern-tools-guidelines-template.csv'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
  const onFilePick = async (file: File) => {
    setImportError(null)
    setDryRun(null)
    setParsed(null)
    setImportResult(null)
    setImportBusy(true)
    try {
      const text = await file.text()
      const parseResult = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
      if (parseResult.errors.length > 0) {
        const first = parseResult.errors[0]
        throw new Error(`CSV parse error: ${first.message} (row ${first.row ?? '?'})`)
      }
      const data = parseResult.data as string[][]
      if (data.length < 2) throw new Error('CSV must have a header row + at least one data row.')
      const p: ParsedCsv = { headers: data[0].map(h => (h ?? '').trim()), rows: data.slice(1) }
      setParsed(p)
      const res = await fetch(`/api/admin/import/guidelines?dryRun=true&overwrite=${overwrite}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Preview failed (${res.status})`)
      setDryRun(body as ImportDryRun)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImportBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  // Re-run the dry-run when overwrite toggles (so preview stats reflect the new mode).
  const refreshDryRun = async (nextOverwrite: boolean) => {
    if (!parsed) return
    setImportBusy(true)
    try {
      const res = await fetch(`/api/admin/import/guidelines?dryRun=true&overwrite=${nextOverwrite}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Preview failed (${res.status})`)
      setDryRun(body as ImportDryRun)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setImportBusy(false)
    }
  }
  const doImport = async () => {
    if (!parsed) return
    setConfirmImportOpen(false)
    setImportError(null)
    setImportBusy(true)
    try {
      const res = await fetch(`/api/admin/import/guidelines?dryRun=false&overwrite=${overwrite}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Import failed (${res.status})`)
      setImportResult({
        inserted: body.summary?.inserted ?? 0,
        updated: body.summary?.updated ?? 0,
        skipped: body.summary?.skipped ?? 0,
        errors: body.summary?.errors ?? 0,
      })
      setParsed(null)
      setDryRun(null)
      load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportBusy(false)
    }
  }
  const cancelImport = () => {
    setParsed(null)
    setDryRun(null)
    setImportError(null)
  }

  return (
    <div className="space-y-6">
      {/* ==================== IMPORT ==================== */}
      <SectionCard
        title="Import Guidelines"
        description="Bulk-add insurance company guidelines from a CSV. Preview before anything is written."
      >
        <div className="space-y-4">
          <div className="text-xs text-gray-500 leading-relaxed">
            <strong>Required columns:</strong> Insurance Company, Guidelines.
            Column names are matched case-insensitively (e.g., &quot;Company&quot;, &quot;Insurer&quot;, and &quot;Insurance Co.&quot; all map to Insurance Company).
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={downloadTemplate} variant="outline" className="gap-2">
              <FileText className="w-4 h-4" /> Download template
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importBusy}
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importBusy ? 'Processing…' : 'Upload CSV'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilePick(f) }}
            />
            <label className="flex items-center gap-2 text-xs text-gray-600 ml-2 select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => { setOverwrite(e.target.checked); if (parsed) refreshDryRun(e.target.checked) }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Overwrite existing companies
            </label>
          </div>

          {importError && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {importError}
            </div>
          )}

          {importResult && !dryRun && (
            <div className="p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm space-y-1">
              <div className="font-semibold">Import complete</div>
              <ul className="list-disc pl-5 text-green-700">
                <li>{importResult.inserted} new</li>
                {importResult.updated > 0 && <li>{importResult.updated} updated</li>}
                {importResult.skipped > 0 && <li>{importResult.skipped} skipped</li>}
                {importResult.errors > 0 && <li>{importResult.errors} errored (see server logs)</li>}
              </ul>
            </div>
          )}

          {dryRun && parsed && (
            <ImportPreview
              dryRun={dryRun}
              onCancel={cancelImport}
              onConfirm={() => setConfirmImportOpen(true)}
              busy={importBusy}
            />
          )}
        </div>
      </SectionCard>

      {/* ==================== MANAGE ==================== */}
      <SectionCard
        title="Manage Guidelines"
        description="View, edit, add, or delete guidelines. Every signed-in user can read; only admins can edit."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search company or content…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {emptyCount > 0 && (
                <Button
                  onClick={() => setConfirmDeleteEmpty(true)}
                  disabled={deleteEmptyBusy || deleteAllBusy}
                  variant="outline"
                  className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteEmptyBusy ? 'Deleting…' : `Delete ${emptyCount} empty`}
                </Button>
              )}
              {guidelines.length > 0 && (
                <Button
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={deleteAllBusy || deleteEmptyBusy}
                  variant="outline"
                  className="gap-2 border-red-300 text-red-800 hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteAllBusy ? 'Deleting…' : `Delete all (${guidelines.length})`}
                </Button>
              )}
              <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                <Plus className="w-4 h-4" /> Add Company
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-400 italic py-8 text-center">
              {guidelines.length === 0 ? 'No guidelines yet — add one or import a CSV.' : 'No companies match your search.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {filtered.map(g => {
                const isEditing = editingId === g.id
                return (
                  <div key={g.id} className={`p-4 ${isEditing ? 'bg-blue-50/40' : 'bg-white'}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Company name"
                        />
                        <textarea
                          value={draftGuidelines}
                          onChange={(e) => setDraftGuidelines(e.target.value)}
                          rows={12}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
                          placeholder={`Guidelines for this insurer…

# Section heading
Blank line = new paragraph.

- Bullet point
- Another bullet

**Bold** text and https://links.example.com become clickable.`}
                        />
                        <FormattingHint />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1">
                            <X className="w-4 h-4" /> Cancel
                          </Button>
                          <Button onClick={() => saveEdit(g)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1">
                            <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{g.name}</div>
                          <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-3">
                            {g.guidelines.trim() || <span className="italic text-gray-400">No guidelines yet.</span>}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-1">
                            Updated {new Date(g.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(g)}
                            disabled={editingId !== null}
                            className="text-gray-400 hover:text-blue-600 p-1 disabled:opacity-40"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(g)}
                            disabled={editingId !== null}
                            className="text-gray-400 hover:text-red-600 p-1 disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ---- Add modal ---- */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={(e) => { if (e.target === e.currentTarget && !saving) setAddOpen(false) }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Insurance Company</h2>
              <button onClick={() => setAddOpen(false)} disabled={saving} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Company Name
                </label>
                <input
                  autoFocus
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g., State Farm"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Guidelines
                </label>
                <textarea
                  value={addGuidelines}
                  onChange={(e) => setAddGuidelines(e.target.value)}
                  rows={12}
                  placeholder={`Notes appraisers should follow when working a State Farm claim…

# Section heading
Blank line = new paragraph.

- Bullet point
- Another bullet

**Bold** text and https://links.example.com become clickable.`}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
                />
                <FormattingHint />
              </div>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={submitAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
                {saving ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this company's guidelines?"
        message={
          deleteTarget ? (
            <>Delete guidelines for <b>{deleteTarget.name}</b>? This cannot be undone.</>
          ) : null
        }
        confirmLabel="Delete"
        variant="danger"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        title={`Delete ALL ${guidelines.length} guideline${guidelines.length === 1 ? '' : 's'}?`}
        message={
          <>
            This wipes the guidelines directory clean — <b>every</b> insurance company
            and their guidelines will be permanently deleted. Use this before a fresh
            CSV reimport when you want a clean slate. This cannot be undone.
          </>
        }
        confirmLabel={`Delete all ${guidelines.length}`}
        variant="danger"
        busy={deleteAllBusy}
        onConfirm={deleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      <ConfirmDialog
        open={confirmDeleteEmpty}
        title={`Delete ${emptyCount} empty guideline${emptyCount === 1 ? '' : 's'}?`}
        message={
          <>
            This will permanently delete every company row whose Guidelines text is
            empty. The company names themselves will be gone — add them back later if
            needed. This cannot be undone.
          </>
        }
        confirmLabel={`Delete ${emptyCount}`}
        variant="danger"
        busy={deleteEmptyBusy}
        onConfirm={deleteEmpty}
        onCancel={() => setConfirmDeleteEmpty(false)}
      />

      <ConfirmDialog
        open={confirmImportOpen}
        title={`Import ${(dryRun?.summary.toInsert ?? 0) + (dryRun?.summary.toUpdate ?? 0)} companies?`}
        message={
          dryRun ? (
            <>
              This will {dryRun.summary.toInsert > 0 && <>insert <b>{dryRun.summary.toInsert}</b></>}
              {dryRun.summary.toInsert > 0 && dryRun.summary.toUpdate > 0 && <> and </>}
              {dryRun.summary.toUpdate > 0 && <>update <b>{dryRun.summary.toUpdate}</b></>}
              {' '}insurance company guideline record{(dryRun.summary.toInsert + dryRun.summary.toUpdate) === 1 ? '' : 's'}.
              {dryRun.summary.skipped > 0 && <> {dryRun.summary.skipped} rows will be skipped.</>}
            </>
          ) : null
        }
        confirmLabel="Import"
        variant="primary"
        busy={importBusy}
        onConfirm={doImport}
        onCancel={() => setConfirmImportOpen(false)}
      />
    </div>
  )
}

function ImportPreview({
  dryRun,
  onCancel,
  onConfirm,
  busy,
}: {
  dryRun: ImportDryRun
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}) {
  const { summary, preview } = dryRun
  const canImport = summary.toInsert + summary.toUpdate > 0
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-sm text-gray-800">Preview</div>
        <button onClick={onCancel} disabled={busy} className="text-gray-400 hover:text-gray-700 p-1" title="Discard">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Total rows" value={summary.total} />
          <Stat label="Will insert" value={summary.toInsert} tone="good" />
          <Stat label="Will update" value={summary.toUpdate} tone={summary.toUpdate > 0 ? 'warn' : 'neutral'} />
          <Stat label="Skipped" value={summary.skipped} tone={summary.skipped > 0 ? 'bad' : 'neutral'} />
        </div>

        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Row</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Action</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Company</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Guidelines Preview</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => (
                <tr key={row.rowNumber} className={`border-b border-gray-100 ${row.ok ? '' : 'bg-red-50/40'}`}>
                  <td className="px-2 py-1.5 text-gray-500">{row.rowNumber}</td>
                  <td className="px-2 py-1.5">
                    {row.action === 'insert' && <span className="text-emerald-700 font-semibold">Insert</span>}
                    {row.action === 'update' && <span className="text-amber-700 font-semibold">Update</span>}
                    {!row.ok && <span className="text-red-600">Skip</span>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-800">{row.name ?? ''}</td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {row.skipReason
                      ? <span className="text-red-600">{row.skipReason}</span>
                      : (row.guidelinesPreview ?? <span className="italic text-gray-400">empty</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.total > preview.length && (
            <div className="px-2 py-1.5 text-[11px] text-gray-400 border-t border-gray-100 bg-gray-50">
              Showing first {preview.length} of {summary.total} rows.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={busy || !canImport}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-1"
          >
            <Download className="w-4 h-4" />
            Import {summary.toInsert + summary.toUpdate} compan{(summary.toInsert + summary.toUpdate) === 1 ? 'y' : 'ies'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  const toneClass = {
    good:    'text-emerald-700 bg-emerald-50 border-emerald-200',
    bad:     'text-red-700 bg-red-50 border-red-200',
    warn:    'text-amber-700 bg-amber-50 border-amber-200',
    neutral: 'text-gray-700 bg-gray-50 border-gray-200',
  }[tone]
  return (
    <div className={`border rounded px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

// Small inline hint shown under the guidelines textarea so admins know how
// to structure the content — mirrors the mini-formatter in guidelines-tab.tsx.
function FormattingHint() {
  return (
    <div className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
      <strong>Formatting:</strong> blank line = new paragraph ·{' '}
      <code className="px-1 bg-gray-100 rounded"># Heading</code> ·{' '}
      <code className="px-1 bg-gray-100 rounded">- Bullet</code> ·{' '}
      <code className="px-1 bg-gray-100 rounded">1. Numbered</code> ·{' '}
      <code className="px-1 bg-gray-100 rounded">**bold**</code> ·{' '}
      URLs auto-link.
    </div>
  )
}
