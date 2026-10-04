"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import JSZip from 'jszip'
import {
  ArrowDown, ArrowUp, ArrowUpDown,
  Check, Download, ExternalLink, FileText, Image, Loader2, Minus, Pencil, Plus,
  ChevronLeft, ChevronRight, Trash2, Upload, X,
} from 'lucide-react'
import {
  uploadClaimDocument,
  getClaimDocumentUrl,
  deleteClaimDocument,
  type ClaimDocument,
} from '@/lib/supabase/documents'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ── Source labels ─────────────────────────────────────────────────────────────
// 'upload' and 'labor-rates' are legacy values kept for backward-compat
// rendering — new uploads never produce them.
const SOURCE_LABELS: Record<string, string> = {
  'acv-report': 'ACV Report',
  'award': 'Award',
  'closing-notes': 'Closing Notes',
  'summary': 'Summary',
  'dv-report': 'DV Report',
  'estimate': 'Estimate',
  'estimate-review': 'Estimate Review',
  'invoice': 'Invoice',
  'storage': 'Storage Charges',
  'document': 'Document',
  'photo': 'Photo',
  // legacy — treat as 'document' at render time but keep in labels map to avoid fallthrough
  'upload': 'Document',
  'labor-rates': 'Document',
}

// User-taggable source values shown in the Type dropdown (upload-sourced docs only).
const USER_TAGGABLE_OPTIONS: Array<{ value: ClaimDocument['source']; label: string }> = [
  { value: 'document', label: 'Document' },
  { value: 'photo',    label: 'Photo' },
  { value: 'invoice',  label: 'Invoice' },
  { value: 'estimate', label: 'Estimate' },
]

// Sources that came from user uploads (editable type tag).
const USER_UPLOADABLE_SOURCES = new Set<string>(['upload', 'labor-rates', 'document', 'photo', 'invoice', 'estimate'])

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

function isImageExt(name: string): boolean {
  const e = extOf(name)
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff'].includes(e)
}

// Auto-pick source by MIME + filename heuristics.
function autoPickSource(file: File): ClaimDocument['source'] {
  if (file.type.startsWith('image/')) return 'photo'
  if (/\binvoice\b/i.test(file.name)) return 'invoice'
  if (/\bestimate\b/i.test(file.name)) return 'estimate'
  return 'document'
}

// Auto-pick source for a zip entry (no File object, just name + mime).
function autoPickSourceFromMimeName(mime: string, name: string): ClaimDocument['source'] {
  if (mime.startsWith('image/')) return 'photo'
  if (/\binvoice\b/i.test(name)) return 'invoice'
  if (/\bestimate\b/i.test(name)) return 'estimate'
  return 'document'
}

// The in-app preview modal only handles types the browser can render natively.
// Everything else (docx / xlsx / etc.) falls back to opening in a new browser
// tab, which delegates to the OS's default handler for those formats.
function canPreviewInline(name: string): boolean {
  const e = extOf(name)
  return e === 'pdf' || isImageExt(name)
}

// Normalise a legacy source for display purposes only — never written back.
function displaySource(source: string): string {
  if (source === 'upload' || source === 'labor-rates') return 'Document'
  return SOURCE_LABELS[source] ?? source
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
      if ((err as { name?: string })?.name === 'AbortError') return
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}

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

// ── Sort types ────────────────────────────────────────────────────────────────
type SortCol = 'name' | 'type' | 'date'
type SortDir = 'asc' | 'desc'

function SortableTh({
  label,
  col,
  sortBy,
  onClick,
}: {
  label: string
  col: SortCol
  sortBy: { col: SortCol; dir: SortDir }
  onClick: (col: SortCol) => void
}) {
  const active = sortBy.col === col
  const Icon = !active ? ArrowUpDown : sortBy.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className="text-left px-4 py-3">
      <button
        type="button"
        onClick={() => onClick(col)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-blue-700"
      >
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    </th>
  )
}

// ── Thumbnail for photo docs ──────────────────────────────────────────────────
function DocThumbnail({ doc }: { doc: ClaimDocument }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getClaimDocumentUrl(doc.path).then(u => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [doc.path])
  if (!url) return <Image className="w-5 h-5 text-blue-400 shrink-0" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className="w-10 h-10 object-cover rounded border border-gray-200 shrink-0"
    />
  )
}

// ── Photo zoom / pan modal content ───────────────────────────────────────────
// Minimum = 1 (fit-to-container). Zooming out below 1 just makes the photo
// smaller against a sea of black, which Henry explicitly didn't want.
const ZOOM_MIN = 1
const ZOOM_MAX = 10

interface ZoomState {
  scale: number
  tx: number
  ty: number
}

function ImageViewer({ url, name }: { url: string; name: string }) {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, tx: 0, ty: 0 })
  const [animating, setAnimating] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const animStartRef = useRef<number | null>(null)

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const adjustZoom = (factor: number) => {
    setZoom(prev => {
      const next = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX)
      return { ...prev, scale: next }
    })
    setAnimating(false)
  }

  const handleDblClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (animating) {
      // Cancel ongoing animation
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
      setAnimating(false)
      setZoom({ scale: 1, tx: 0, ty: 0 })
      return
    }
    // Start zoom animation from click point, transform origin = click point relative to image
    const rect = e.currentTarget.getBoundingClientRect()
    const ox = e.clientX - rect.left - rect.width / 2
    const oy = e.clientY - rect.top - rect.height / 2
    const startScale = zoom.scale
    const targetScale = 3
    animStartRef.current = null
    setAnimating(true)

    const step = (ts: number) => {
      if (animStartRef.current === null) animStartRef.current = ts
      const elapsed = ts - animStartRef.current
      const duration = 2000
      const t = Math.min(elapsed / duration, 1)
      // ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const s = startScale + (targetScale - startScale) * eased
      const clamped = clamp(s, ZOOM_MIN, ZOOM_MAX)
      setZoom({ scale: clamped, tx: -ox * (clamped - 1), ty: -oy * (clamped - 1) })
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step)
      } else {
        setAnimating(false)
      }
    }
    animFrameRef.current = requestAnimationFrame(step)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (zoom.scale <= 1) return
    e.preventDefault()
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: zoom.tx, ty: zoom.ty }
    setDragging(true)
  }
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !dragStart.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setZoom(prev => ({ ...prev, tx: dragStart.current!.tx + dx, ty: dragStart.current!.ty + dy }))
  }
  const handleMouseUp = () => {
    setDragging(false)
    dragStart.current = null
  }

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  return (
    <div
      className="w-full h-full flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 select-none"
           style={{ cursor: zoom.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          draggable={false}
          onDoubleClick={handleDblClick}
          onMouseDown={handleMouseDown}
          style={{
            transform: `scale(${zoom.scale}) translate(${zoom.tx / zoom.scale}px, ${zoom.ty / zoom.scale}px)`,
            transition: animating ? 'none' : 'transform 0.15s ease',
            transformOrigin: 'center center',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            userSelect: 'none',
          }}
        />
      </div>
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 bg-gray-800 border-t border-gray-700">
        <button
          type="button"
          onClick={() => adjustZoom(0.8)}
          className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400 min-w-[48px] text-center tabular-nums">
          {Math.round(zoom.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => adjustZoom(1.25)}
          className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        {zoom.scale !== 1 && (
          <button
            type="button"
            onClick={() => setZoom({ scale: 1, tx: 0, ty: 0 })}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            Reset
          </button>
        )}
        <span className="text-[10px] text-gray-500 ml-2">Double-click to zoom · Drag to pan</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function DocumentsTab({
  claimId,
  documents,
  onDocumentsChange,
}: {
  claimId: string
  documents: ClaimDocument[]
  onDocumentsChange: (next: ClaimDocument[]) => void
}) {
  const { profile } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'

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
  // Tracks whether the backdrop-close mousedown originated on the backdrop
  // itself. See the modal's onMouseDown/onMouseUp handlers below.
  const backdropDownRef = useRef(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sortBy, setSortBy] = useState<{ col: SortCol; dir: SortDir }>({ col: 'date', dir: 'desc' })

  // Visible docs: non-admins see only !adminOnly docs.
  const visibleDocs = useMemo(
    () => documents.filter(d => !d.adminOnly || isAdmin),
    [documents, isAdmin],
  )

  const sorted = useMemo(() => {
    const list = [...visibleDocs]
    list.sort((a, b) => {
      let cmp = 0
      if (sortBy.col === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortBy.col === 'type') {
        cmp = displaySource(a.source).localeCompare(displaySource(b.source))
      } else {
        cmp = a.createdAt.localeCompare(b.createdAt)
      }
      return sortBy.dir === 'asc' ? cmp : -cmp
    })
    return list
  }, [visibleDocs, sortBy])

  const toggleSort = (col: SortCol) => {
    setSortBy(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'date' ? 'desc' : 'asc' }
    )
  }

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
            if (!mime) continue
            setUploadStatus(`Extracting ${file.name} (${done}/${entries.length}): ${filename}`)
            const blob = await entry.async('blob')
            const asFile = new File([blob], filename, { type: mime })
            const src = autoPickSourceFromMimeName(mime, filename)
            const doc = await uploadClaimDocument(claimId, asFile, filename, src)
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
      const src = autoPickSource(file)
      const doc = await uploadClaimDocument(claimId, file, file.name, src)
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

  // Navigate to adjacent doc in the sorted list.
  const previewIdx = previewDoc ? sorted.findIndex(d => d.path === previewDoc.path) : -1
  const previewableSorted = sorted.filter(d => canPreviewInline(d.name))
  const previewInlineIdx = previewDoc ? previewableSorted.findIndex(d => d.path === previewDoc.path) : -1
  const goPreviewPrev = () => {
    if (previewInlineIdx > 0) setPreviewDoc(previewableSorted[previewInlineIdx - 1])
  }
  const goPreviewNext = () => {
    if (previewInlineIdx < previewableSorted.length - 1) setPreviewDoc(previewableSorted[previewInlineIdx + 1])
  }

  // Keyboard handlers for modal.
  useEffect(() => {
    if (!previewDoc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewDoc(null)
      if (e.key === 'ArrowLeft') goPreviewPrev()
      if (e.key === 'ArrowRight') goPreviewNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc, previewInlineIdx, previewableSorted])

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

      {/* Toolbar */}
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
            {/* Bulk Admin Only toggle — right of Download all. Admin-only,
                only when a selection exists. Flips every selected doc's
                adminOnly flag based on whether any selected doc is public. */}
            {isAdmin && selectedCount > 0 && (() => {
              const chosen = sorted.filter(d => selected.has(d.path))
              const anyPublic = chosen.some(d => !d.adminOnly)
              const next = anyPublic
              return (
                <button
                  type="button"
                  onClick={() => {
                    onDocumentsChange(documents.map(d =>
                      selected.has(d.path) ? { ...d, adminOnly: next } : d
                    ))
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-800 bg-blue-800 text-white text-sm font-medium hover:bg-blue-900 hover:border-blue-900 transition-colors"
                  title={next ? 'Mark selected documents admin-only' : 'Make selected documents visible to everyone'}
                >
                  {next ? 'Mark admin only' : 'Make public'}
                </button>
              )
            })()}
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
              <SortableTh label="Document" col="name" sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Type"     col="type" sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Added"    col="date" sortBy={sortBy} onClick={toggleSort} />
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-16 text-gray-400">
                  No documents yet. Download or print a report, or click Upload above.
                </td>
              </tr>
            ) : (
              sorted.map((doc) => {
                const isEditing = editingPath === doc.path
                const isChecked = selected.has(doc.path)
                const isPhoto = doc.source === 'photo' || isImageExt(doc.name)
                const isUserTaggable = USER_UPLOADABLE_SOURCES.has(doc.source)
                // Normalise legacy sources to 'document' for the dropdown value.
                const editableSource: ClaimDocument['source'] =
                  (doc.source === 'upload' || doc.source === 'labor-rates') ? 'document' : doc.source

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
                          {isPhoto ? (
                            <DocThumbnail doc={doc} />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          )}
                          {doc.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isUserTaggable ? (
                          <select
                            value={editableSource}
                            onChange={(e) => {
                              const nextSource = e.target.value as ClaimDocument['source']
                              onDocumentsChange(documents.map(d =>
                                d.path === doc.path ? { ...d, source: nextSource } : d
                              ))
                            }}
                            className="text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-100 text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                            title="Change the type tag on this document"
                          >
                            {USER_TAGGABLE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600">
                            {displaySource(doc.source)}
                          </span>
                        )}
                        {/* Admin-only indicator — shown on rows marked
                            admin-only. Toggle via the bulk selection toolbar
                            above, not per-row. */}
                        {doc.adminOnly && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                            Admin only
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(doc.createdAt)}</td>
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
                )
              })
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

      {/* In-app preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          // Only close when the user BOTH mousedown'd AND mouseup'd on the
          // backdrop itself. Prevents accidental closes when a pan-drag inside
          // the image happens to end over the backdrop. e.currentTarget =
          // the backdrop; e.target = where the mouseup landed.
          onMouseDown={(e) => {
            backdropDownRef.current = e.target === e.currentTarget
          }}
          onMouseUp={(e) => {
            if (backdropDownRef.current && e.target === e.currentTarget) {
              setPreviewDoc(null)
            }
            backdropDownRef.current = false
          }}
        >
          {/* Previous button */}
          {previewInlineIdx > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPreviewPrev() }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white text-gray-900 shadow-xl hover:bg-gray-100 hover:scale-105 transition-all flex items-center justify-center"
              title="Previous document (← arrow key)"
              aria-label="Previous document"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}
          {/* Next button */}
          {previewInlineIdx < previewableSorted.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPreviewNext() }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white text-gray-900 shadow-xl hover:bg-gray-100 hover:scale-105 transition-all flex items-center justify-center"
              title="Next document (→ arrow key)"
              aria-label="Next document"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          )}

          <div
            className="relative w-full max-w-6xl h-[90vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden mx-12"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="text-sm font-medium text-gray-900 truncate flex-1" title={previewDoc.name}>
                {previewDoc.name}
              </div>
              {previewableSorted.length > 1 && (
                <span className="text-xs text-gray-400">
                  {previewInlineIdx + 1} / {previewableSorted.length}
                </span>
              )}
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
                title="Close (Esc)"
                className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-hidden">
              {previewLoading || !previewUrl ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : extOf(previewDoc.name) === 'pdf' ? (
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={previewDoc.name}
                  className="w-full h-full bg-white"
                />
              ) : (
                <ImageViewer url={previewUrl} name={previewDoc.name} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
