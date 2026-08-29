"use client"

import { useState, useRef } from 'react'
import { Download, Upload, Loader2, FileText, AlertTriangle, X } from 'lucide-react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from '../_shared'

type StatusFilter = 'all' | 'open' | 'closed'

interface RowEval {
  rowNumber: number
  ok: boolean
  skipReason?: string
  warnings: string[]
  maNumber?: string
  insuredName?: string
  vehicle?: string
  status?: 'open' | 'closed'
  acv?: number | null
}

interface DryRunResponse {
  headerMap: Record<string, string>
  unknownHeaders: string[]
  summary: { total: number; toImport: number; skippedInvalid: number; skippedDuplicate: number; warnings: number }
  duplicateMANumbers: string[]
  unmatchedAssignees: string[]
  preview: RowEval[]
}

interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export function DataClient() {
  // ------- Export state -------
  const [status, setStatus] = useState<StatusFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ------- Import state -------
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skippedInvalid: number; skippedDuplicate: number; insertErrors: number } | null>(null)

  const doExport = async () => {
    setError(null)
    setBusy(true)
    try {
      const params = new URLSearchParams({ status })
      if (from) params.set('from', from)
      if (to)   params.set('to',   to)
      const res = await fetch(`/api/admin/export/claims?${params.toString()}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = extractFilename(res.headers.get('content-disposition')) ?? 'modern-tools-claims.csv'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = async () => {
    const res = await fetch('/api/admin/import/claims/template')
    if (!res.ok) { setImportError('Could not download template'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modern-tools-import-template.csv'
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
      const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: 'greedy',
      })
      if (parseResult.errors.length > 0) {
        const first = parseResult.errors[0]
        throw new Error(`CSV parse error: ${first.message} (row ${first.row ?? '?'})`)
      }
      const data = parseResult.data as string[][]
      if (data.length < 2) throw new Error('CSV must have a header row + at least one data row.')
      const headers = data[0].map(h => (h ?? '').trim())
      const rows = data.slice(1)
      const p: ParsedCsv = { headers, rows }
      setParsed(p)

      // Dry-run against the server for authoritative validation + preview.
      const res = await fetch('/api/admin/import/claims?dryRun=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Preview failed (${res.status})`)
      setDryRun(body as DryRunResponse)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImportBusy(false)
      // Reset the input so re-uploading the same file works.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const doImport = async () => {
    if (!parsed) return
    setConfirmOpen(false)
    setImportError(null)
    setImportBusy(true)
    try {
      const res = await fetch('/api/admin/import/claims?dryRun=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Import failed (${res.status})`)
      setImportResult({
        imported: body.summary?.imported ?? 0,
        skippedInvalid: body.summary?.skippedInvalid ?? 0,
        skippedDuplicate: body.summary?.skippedDuplicate ?? 0,
        insertErrors: body.summary?.insertErrors ?? 0,
      })
      setParsed(null)
      setDryRun(null)
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
      {/* ==================== EXPORT ==================== */}
      <SectionCard
        title="Export Claims"
        description="Download every claim in one CSV. Opens cleanly in Excel and Google Sheets."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All (open + closed)</option>
                <option value="open">Open only</option>
                <option value="closed">Closed only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                From date (optional)
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                To date (optional)
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="text-xs text-gray-500 leading-relaxed">
            <strong>Columns included:</strong> MA #, Claim #, Insured, Owner, Vehicle, VIN,
            Date, Insurance Co., Location, Assigned To, Status, Submitted At, Submitted By,
            ACV Amount.
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={doExport}
              disabled={busy}
              className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {busy ? 'Preparing…' : 'Download CSV'}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </SectionCard>

      {/* ==================== IMPORT ==================== */}
      <SectionCard
        title="Import Claims"
        description="Bulk-add claims from a CSV. Duplicates (by MA #) are skipped. You'll see a preview before anything is written."
      >
        <div className="space-y-4">
          <div className="text-xs text-gray-500 leading-relaxed">
            <strong>Required columns:</strong> MA #, Insured, Vehicle.{' '}
            <strong>Optional:</strong> Claim #, VIN, Insurance Co., Owner, Location, Date,
            Assigned To (email or exact name), Status (open/closed), ACV Amount.
            Anything else is ignored.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={downloadTemplate}
              variant="outline"
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Download template
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
                <li>{importResult.imported} claim{importResult.imported === 1 ? '' : 's'} imported</li>
                {importResult.skippedDuplicate > 0 && <li>{importResult.skippedDuplicate} skipped as duplicates</li>}
                {importResult.skippedInvalid > 0 && <li>{importResult.skippedInvalid} skipped (missing required fields)</li>}
                {importResult.insertErrors > 0 && <li>{importResult.insertErrors} failed to insert (see server logs)</li>}
              </ul>
            </div>
          )}

          {dryRun && parsed && (
            <PreviewPanel
              dryRun={dryRun}
              onCancel={cancelImport}
              onConfirm={() => setConfirmOpen(true)}
              busy={importBusy}
            />
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        title={`Import ${dryRun?.summary.toImport ?? 0} claims?`}
        message={
          dryRun ? (
            <>
              This will insert <b>{dryRun.summary.toImport}</b> new claims into your database.{' '}
              {dryRun.summary.skippedDuplicate > 0 && <>{dryRun.summary.skippedDuplicate} duplicates will be skipped. </>}
              {dryRun.summary.skippedInvalid > 0 && <>{dryRun.summary.skippedInvalid} rows will be skipped (missing required fields). </>}
              This action cannot be undone easily (you&apos;d have to delete each imported claim manually).
            </>
          ) : null
        }
        confirmLabel="Import"
        variant="primary"
        busy={importBusy}
        onConfirm={doImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function PreviewPanel({
  dryRun,
  onCancel,
  onConfirm,
  busy,
}: {
  dryRun: DryRunResponse
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}) {
  const { summary, duplicateMANumbers, unmatchedAssignees, unknownHeaders, preview } = dryRun
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-sm text-gray-800">Preview</div>
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-gray-400 hover:text-gray-700 p-1"
          title="Discard this upload"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <StatCard label="Total rows" value={summary.total} tone="neutral" />
          <StatCard label="Ready to import" value={summary.toImport} tone="good" />
          <StatCard label="Duplicates" value={summary.skippedDuplicate} tone="warn" />
          <StatCard label="Invalid" value={summary.skippedInvalid} tone={summary.skippedInvalid > 0 ? 'bad' : 'neutral'} />
        </div>

        {unknownHeaders.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Columns not recognized (ignored): {unknownHeaders.join(', ')}
            </div>
          </div>
        )}
        {duplicateMANumbers.length > 0 && (
          <div className="text-xs text-gray-600">
            <strong>Duplicate MA #s (will skip):</strong>{' '}
            {duplicateMANumbers.slice(0, 10).join(', ')}
            {duplicateMANumbers.length > 10 && <> and {duplicateMANumbers.length - 10} more</>}
          </div>
        )}
        {unmatchedAssignees.length > 0 && (
          <div className="text-xs text-gray-600">
            <strong>Assignees not matched (imported unassigned):</strong>{' '}
            {unmatchedAssignees.join(', ')}
          </div>
        )}

        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Row</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">MA #</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Insured</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Vehicle</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Status</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">ACV</th>
                <th className="text-left px-2 py-1.5 text-gray-500 uppercase text-[10px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => (
                <tr key={row.rowNumber} className={`border-b border-gray-100 ${row.ok ? '' : 'bg-red-50/40'}`}>
                  <td className="px-2 py-1.5 text-gray-500">{row.rowNumber}</td>
                  <td className="px-2 py-1.5 text-gray-800">{row.maNumber ?? ''}</td>
                  <td className="px-2 py-1.5 text-gray-800">{row.insuredName ?? ''}</td>
                  <td className="px-2 py-1.5 text-gray-800">{row.vehicle ?? ''}</td>
                  <td className="px-2 py-1.5 text-gray-800">{row.status ?? ''}</td>
                  <td className="px-2 py-1.5 text-gray-800">{row.acv != null ? row.acv : ''}</td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {row.skipReason && <span className="text-red-600">Skip: {row.skipReason}</span>}
                    {row.warnings.length > 0 && (
                      <span className="text-amber-700">{row.warnings.join('; ')}</span>
                    )}
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
            disabled={busy || summary.toImport === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            Import {summary.toImport} claim{summary.toImport === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
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

// Content-Disposition parser (best-effort): pulls filename= or filename*=UTF-8''
// Falls back to null so caller uses a default name.
function extractFilename(cd: string | null): string | null {
  if (!cd) return null
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (utf) { try { return decodeURIComponent(utf[1]) } catch { /* ignore */ } }
  const m = /filename="?([^";]+)"?/i.exec(cd)
  return m ? m[1] : null
}
