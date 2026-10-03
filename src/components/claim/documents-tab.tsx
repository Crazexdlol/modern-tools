"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import JSZip from 'jszip'
import { Check, Download, ExternalLink, FileText, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react'
import {
  uploadClaimDocument,
  getClaimDocumentUrl,
  deleteClaimDocument,
  type ClaimDocument,
} from '@/lib/supabase/documents'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const SOURCE_LABELS: Record<ClaimDocument['source'], string> = {
  'acv-report': 'ACV Report',
  'award': 'Award',
  'closing-notes': 'Closing Notes',
  'summary': 'Summary',
  'dv-report': 'DV Report',
  'estimate': 'Estimate',
  'estimate-review': 'Estimate Review',
  'invoice': 'Invoice',
  'storage': 'Storage Charges',
  'upload': 'Uploaded',
  'labor-rates': 'Labor Rates',
}

const USER_TAGGABLE = new Set<ClaimDocument['source']>(['upload', 'labor-rates'])

// Extension → MIME map for zip-extracted entries. The zip's inner files don't
// carry a MIME type on their own, so we infer from the extension to satisfy
// the storage bucket's allowlist. Anything not in the list is skipped.
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf', txt: 'text/plain', csv: 'text/csv',
}

function inferMimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return EXT_MIME[ext] ?? null
}

function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

// The in-app preview modal only handles types the browser can render natively.
// Everything else (docx / xlsx / etc.) falls back to opening in a new browser
// tab, which delegates to the OS's default handler for those formats.
function canPreviewInline(name: string): boolean {
  const e = extOf(name)
  return e === 'pdf' || e === 'jpg' || e === 'jpeg' || e === 'png' || e === 'gif' || e === 'webp'
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// showSaveFilePicker is Chromium-only. Type it loosely and try/catch — every
// other browser falls through to an anchor download.
interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
}
interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}
interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}
type ShowSaveFilePicker = (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>

function pickerAvailable(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

// Actually save a blob to disk — File System Access API when available
// (Chromium: opens the native Save-As dialog, user picks folder), anchor
// fallback everywhere else (goes to the browser's default Downloads folder).
async function saveBlob(blob: Blob, suggestedName: string): Promise<void> {
  if (pickerAvailable()) {
    try {
      const picker = (window as unknown as { showSaveFilePicker: ShowSaveFilePicker }).showSaveFilePicker
      const handle = await picker({ suggestedName })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      // AbortError = user cancelled the picker; don't fall back.
      if ((err as { name?: string })?.name === 'AbortError') return
      // Any other failure (permission denied, non-secure origin, etc) — fall
      // through to the anchor-download path so the user still gets their file.
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // The URL has to outlive the click but not the tab — revoke on next tick.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}

// Fetch the signed URL for a doc, download the blob, hand it to the OS
// via saveBlob. Filename passed here is what the user sees on disk.
async function downloadOne(doc: ClaimDocument): Promise<{ ok: boolean; error?: string }> {
  const url = await getClaimDocumentUrl(doc.path, doc.name)
  if (!url) return { ok: false, error: `Could not fetch ${doc.name}` }
  try {
    const response = await fetch(url)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} fetching ${doc.name}` }
    const blob = await response.blob()
    await saveBlob(blob, doc.name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message || `Failed to download ${doc.name}` }
  }
}

// Zip up the given docs and prompt to save the zip. Sequence duplicate names
// so multiple "Invoice.pdf" entries land as "Invoice.pdf", "Invoice (2).pdf", ...
async function downloadZip(docs: ClaimDocument[], zipName: string): Promise<{ ok: boolean; errors: string[] }> {
  const zip = new JSZip()
  const seen = new Map<string, number>()
  const errors: string[] = []
  for (const doc of docs) {
    const url = await getClaimDocumentUrl(doc.path)
    if (!url) { errors.push(doc.name); continue }
    try {
      const response = await fetch(url)
      if (!response.ok) { errors.push(doc.name); continue }
      const blob = await response.blob()
      // Dedup filenames inside the zip.
      const seq = (seen.get(doc.name) ?? 0) + 1
      seen.set(doc.name, seq)
      const inZipName = seq === 1
        ? doc.name
        : (() => {
            const dot = doc.name.lastIndexOf('.')
            if (dot < 0) return `${doc.name} (${seq})`
            return `${doc.name.slice(0, dot)} (${seq})${doc.name.slice(dot)}`
          })()
      zip.file(inZipName, blob)
    } catch {
      errors.push(doc.name)
    }
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  await saveBlob(zipBlob, zipName)
  return { ok: errors.length === 0, errors }
}

export function DocumentsTab({
  claimId,
  documents,
  onDocumentsChange,
}: {
  claimId: string
  documents: ClaimDocument[]
  onDocumentsChange: (next: ClaimDocument[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ClaimDocument | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState<'selected' | 'all' | null>(null)
  const [previewDoc, setPreviewDoc] = useState<ClaimDocument | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const handleDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return
    setUploading(true)
    setError(null)
    setUploadStatus(null)
    const added: ClaimDocument[] = []
    const failures: string[] = []

    for (const file of accepted) {
      const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'

      if (isZip) {
        // Extract every non-directory entry, infer MIME by extension, upload
        // each as its own document. Entries with unsupported extensions are
        // silently skipped so a bag of ".DS_Store" / ".txt~" doesn't spam
        // the failures list.
        setUploadStatus(`Extracting ${file.name}…`)
        try {
          const zip = await JSZip.loadAsync(file)
          const entries = Object.values(zip.files).filter(e => !e.dir)
          let done = 0
          for (const entry of entries) {
            done += 1
            const filename = entry.name.split('/').pop() ?? entry.name
            if (!filename || filename.startsWith('.')) continue
            const mime = inferMimeFromName(filename)
            if (!mime) continue // unsupported extension — skip silently
            setUploadStatus(`Extracting ${file.name} (${done}/${entries.length}): ${filename}`)
            const blob = await entry.async('blob')
            const asFile = new File([blob], filename, { type: mime })
            const doc = await uploadClaimDocument(claimId, asFile, filename, 'upload')
            if (doc) added.push(doc)
            else failures.push(filename)
          }
        } catch (err) {
          console.error('zip extract failed:', err)
          failures.push(file.name)
        }
        continue
      }

      setUploadStatus(`Uploading ${file.name}…`)
      const doc = await uploadClaimDocument(claimId, file, file.name, 'upload')
      if (doc) added.push(doc)
      else failures.push(file.name)
    }

    if (added.length > 0) onDocumentsChange([...documents, ...added])
    if (failures.length > 0) {
      setError(`Failed on: ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? ` and ${failures.length - 5} more` : ''}.`)
    }
    setUploadStatus(null)
    setUploading(false)
  }, [claimId, documents, onDocumentsChange])

  const { getRootProps, getInputProps } = useDropzone({ onDrop: handleDrop, noDrag: true })

  // Open in-app preview by default, unless (a) the file type isn't previewable
  // in-browser (docx, xlsx, etc.), in which case fall back to opening a signed
  // URL in a new tab; or (b) the user held Ctrl (or Cmd on Mac), which forces
  // the new-tab behavior regardless.
  const handleOpen = async (doc: ClaimDocument, e?: React.MouseEvent) => {
    setError(null)
    if (e?.ctrlKey || e?.metaKey || !canPreviewInline(doc.name)) {
      setBusyPath(doc.path)
      const url = await getClaimDocumentUrl(doc.path)
      setBusyPath(null)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setError('Could not open the document. Try again.')
      return
    }
    setPreviewDoc(doc)
  }

  // Signed URL for the modal preview — refetched whenever previewDoc changes.
  // We don't cache across previews because the URL expires in 5 min anyway.
  useEffect(() => {
    if (!previewDoc) { setPreviewUrl(null); return }
    let cancelled = false
    setPreviewLoading(true)
    getClaimDocumentUrl(previewDoc.path).then(url => {
      if (cancelled) return
      setPreviewUrl(url)
      setPreviewLoading(false)
    })
    return () => { cancelled = true }
  }, [previewDoc])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const doc = pendingDelete
    setPendingDelete(null)
    setBusyPath(doc.path)
    const ok = await deleteClaimDocument(doc.path)
    setBusyPath(null)
    if (ok) {
      onDocumentsChange(documents.filter(d => d.path !== doc.path))
      setSelected(prev => {
        if (!prev.has(doc.path)) return prev
        const next = new Set(prev); next.delete(doc.path); return next
      })
    } else setError('Delete failed. Try again.')
  }

  const startRename = (doc: ClaimDocument) => {
    setEditingPath(doc.path)
    setEditValue(doc.name)
  }
  const cancelRename = () => {
    setEditingPath(null)
    setEditValue('')
  }
  const saveRename = () => {
    const trimmed = editValue.trim()
    if (!trimmed || !editingPath) { cancelRename(); return }
    onDocumentsChange(documents.map(d => d.path === editingPath ? { ...d, name: trimmed } : d))
    cancelRename()
  }

  const sorted = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [documents],
  )

  const toggleOne = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }
  const allSelected = sorted.length > 0 && sorted.every(d => selected.has(d.path))
  const someSelected = !allSelected && sorted.some(d => selected.has(d.path))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sorted.map(d => d.path)))
  }

  const handleDownloadOne = async (doc: ClaimDocument) => {
    setError(null)
    setBusyPath(doc.path)
    const r = await downloadOne(doc)
    setBusyPath(null)
    if (!r.ok && r.error) setError(r.error)
  }

  const handleDownloadSelected = async () => {
    const chosen = sorted.filter(d => selected.has(d.path))
    if (chosen.length === 0) return
    setZipping('selected')
    setError(null)
    const r = await downloadZip(chosen, `Claim documents (${chosen.length}).zip`)
    setZipping(null)
    if (r.errors.length > 0) setError(`Some documents failed: ${r.errors.slice(0, 3).join(', ')}${r.errors.length > 3 ? '…' : ''}`)
  }

  const handleDownloadAll = async () => {
    if (sorted.length === 0) return
    setZipping('all')
    setError(null)
    const r = await downloadZip(sorted, 'Claim documents.zip')
    setZipping(null)
    if (r.errors.length > 0) setError(`Some documents failed: ${r.errors.slice(0, 3).join(', ')}${r.errors.length > 3 ? '…' : ''}`)
  }

  const selectedCount = selected.size

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Toolbar — Upload, then Download Selected, Download All. */}
      <div className="flex items-center gap-3">
        <label
          {...getRootProps()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-disabled={uploading}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus ?? 'Uploading…'}</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload</>
          )}
        </label>
        {sorted.length > 0 && (
          <>
            {selectedCount > 0 && (
              <span className="text-sm text-gray-600">{selectedCount} selected</span>
            )}
            <button
              type="button"
              onClick={handleDownloadSelected}
              disabled={selectedCount === 0 || zipping !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {zipping === 'selected' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Zipping…</>
              ) : (
                <><Download className="w-4 h-4" /> Download selected</>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={zipping !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {zipping === 'all' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Zipping…</>
              ) : (
                <><Download className="w-4 h-4" /> Download all ({sorted.length})</>
              )}
            </button>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-10 px-3 py-3">
                {sorted.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label={allSelected ? 'Clear selection' : 'Select all documents'}
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                )}
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Added</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-gray-400">
                  No documents yet. Download or print a report, or click Upload above.
                </td>
              </tr>
            ) : (
              sorted.map((doc) => {
                const isEditing = editingPath === doc.path
                const isChecked = selected.has(doc.path)
                return (
                <tr key={doc.path} className={`border-b border-gray-100 transition-colors ${isChecked ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${doc.name}`}
                      checked={isChecked}
                      onChange={() => toggleOne(doc.path)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          autoFocus
                          className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={saveRename} className="text-emerald-600 hover:text-emerald-700 p-1" title="Save">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancelRename} className="text-gray-400 hover:text-gray-700 p-1" title="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => handleOpen(doc, e)}
                        className="flex items-center gap-2 text-gray-900 hover:text-blue-600 font-medium text-left"
                        title="Click to preview here · Ctrl-click (⌘-click on Mac) to open in a new tab"
                      >
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        {doc.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {USER_TAGGABLE.has(doc.source) ? (
                      <select
                        value={doc.source}
                        onChange={(e) => {
                          const nextSource = e.target.value as ClaimDocument['source']
                          onDocumentsChange(documents.map(d =>
                            d.path === doc.path ? { ...d, source: nextSource } : d
                          ))
                        }}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          doc.source === 'labor-rates'
                            ? 'bg-teal-50 border-teal-200 text-teal-800'
                            : 'bg-gray-100 border-gray-200 text-gray-600'
                        }`}
                        title="Change the type tag on this document"
                      >
                        <option value="upload">Uploaded</option>
                        <option value="labor-rates">Labor Rates</option>
                      </select>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600">
                        {SOURCE_LABELS[doc.source] ?? doc.source}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(doc.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtSize(doc.size)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {busyPath === doc.path ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <>
                          {!isEditing && (
                            <button onClick={() => startRename(doc)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Rename">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDownloadOne(doc)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => setPendingDelete(doc)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this document?"
        message={
          pendingDelete ? (
            <>Remove <b>{pendingDelete.name}</b> from this claim&apos;s documents? This cannot be undone.</>
          ) : null
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* In-app preview modal. PDFs render via <iframe>; images via <img>.
          Anything else routes through the "open new tab" fallback above and
          never reaches this modal. */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="relative w-full max-w-6xl h-[90vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="text-sm font-medium text-gray-900 truncate flex-1" title={previewDoc.name}>
                {previewDoc.name}
              </div>
              <button
                type="button"
                onClick={async () => {
                  const url = await getClaimDocumentUrl(previewDoc.path)
                  if (url) window.open(url, '_blank', 'noopener,noreferrer')
                }}
                title="Open in a new tab"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> New tab
              </button>
              <button
                type="button"
                onClick={() => handleDownloadOne(previewDoc)}
                title="Download"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                title="Close"
                className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-gray-100 overflow-auto">
              {previewLoading || !previewUrl ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : extOf(previewDoc.name) === 'pdf' ? (
                <iframe
                  src={previewUrl}
                  title={previewDoc.name}
                  className="w-full h-full bg-white"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={previewDoc.name}
                    className="max-w-full max-h-full object-contain shadow-md bg-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
