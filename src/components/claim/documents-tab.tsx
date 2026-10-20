"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import JSZip from 'jszip'
import {
  Archive,
  ArrowDown, ArrowUp, ArrowUpDown,
  Check, Combine, Download, ExternalLink, FileText, Image, Loader2, Minus, Pencil, Plus,
  ChevronLeft, ChevronRight, Trash2, Upload, X,
} from 'lucide-react'
import {
  uploadClaimDocument,
  getClaimDocumentUrl,
  getClaimDocumentThumbUrl,
  deleteClaimDocument,
  type ClaimDocument,
} from '@/lib/supabase/documents'
import { combineDocsToPdf, canCombineDoc } from '@/lib/pdf-combine'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { saveFilePickerFirst } from '@/lib/save-pdf'

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

// Builds the zip blob WITHOUT writing it to disk — callers decide where/how
// to save, via saveFilePickerFirst so the OS picker opens on the live click
// gesture rather than after this (long-running) fetch chain stales out the
// user activation. (The old inline-saveBlob version silently failed on Chrome
// when the picker threw NotAllowedError and the anchor fallback no-op'd.
// Henry hit this 2026-10-14 — selected docs, clicked download, got nothing.)
//
// Fetches run in parallel via Promise.all — serial awaits were ~500ms per
// file, so 10 docs took 5 seconds and the empty 0-byte file Chrome creates
// at picker-confirm time was visible to the user long enough for them to
// double-click it before the write completed. Parallel knocks that to
// ~network-bound-single-file time regardless of count.
async function buildZipBlob(docs: ClaimDocument[]): Promise<{ blob: Blob; errors: string[] }> {
  const results = await Promise.all(docs.map(async (doc) => {
    try {
      const url = await getClaimDocumentUrl(doc.path)
      if (!url) return { doc, buf: null as ArrayBuffer | null, failed: true }
      const response = await fetch(url)
      if (!response.ok) return { doc, buf: null, failed: true }
      // Read as ArrayBuffer rather than Blob — JSZip's Blob handling has
      // been the source of corrupt-output bugs when the Blob's internal
      // promise hasn't fully resolved by generateAsync time. ArrayBuffer
      // input is read synchronously and always produces correct bytes.
      const buf = await response.arrayBuffer()
      if (buf.byteLength === 0) return { doc, buf: null, failed: true }
      return { doc, buf, failed: false }
    } catch {
      return { doc, buf: null, failed: true }
    }
  }))

  const zip = new JSZip()
  const seen = new Map<string, number>()
  const errors: string[] = []
  for (const r of results) {
    if (r.failed || !r.buf) { errors.push(r.doc.name); continue }
    const seq = (seen.get(r.doc.name) ?? 0) + 1
    seen.set(r.doc.name, seq)
    const inZipName = seq === 1
      ? r.doc.name
      : (() => {
          const dot = r.doc.name.lastIndexOf('.')
          if (dot < 0) return `${r.doc.name} (${seq})`
          return `${r.doc.name.slice(0, dot)} (${seq})${r.doc.name.slice(dot)}`
        })()
    // binary:true tells JSZip the input is raw bytes (not a UTF-8 string),
    // which is critical for PDFs / images and matches ArrayBuffer semantics.
    zip.file(inZipName, r.buf, { binary: true })
  }
  // STORE (no compression) — PDFs and JPGs are already compressed; DEFLATE
  // bloats CPU time without shrinking the archive, and some ZIP tools on
  // Windows have historically mis-decompressed DEFLATEd entries that round-
  // tripped through a Blob path. STORE is the safest round-trip.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  return { blob, errors }
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
// Uses Supabase image transformations to pull a 160px version — the full-res
// photos are 3-5 MB and dragging 20 of them in for a 40×40 preview is why
// the Documents tab loaded sluggishly.
function DocThumbnail({ doc }: { doc: ClaimDocument }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getClaimDocumentThumbUrl(doc.path, 160).then(u => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [doc.path])
  if (!url) return <Image className="w-5 h-5 text-blue-400 shrink-0" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
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
  maNumber,
  documents,
  onDocumentsChange,
}: {
  claimId: string
  // Used as the ZIP filename when downloading multiple docs: `${maNumber}-folder.zip`.
  // Falls back to the claim id when empty (brand-new claim before MA# assignment).
  maNumber: string
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
  // When false (default) the archived report PDFs are hidden from the main
  // list — only the newest ACV / Award / Summary / etc. shows. Toggle in the
  // header reveals the archived set with a greyed-out visual treatment.
  const [showArchived, setShowArchived] = useState(false)

  const archivedCount = useMemo(
    () => documents.filter(d => d.archived && (!d.adminOnly || isAdmin)).length,
    [documents, isAdmin],
  )

  // Visible docs: non-admins see only !adminOnly docs; archived docs are
  // filtered out unless the toggle is on.
  const visibleDocs = useMemo(
    () => documents.filter(d => (!d.adminOnly || isAdmin) && (showArchived || !d.archived)),
    [documents, isAdmin, showArchived],
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

  // noClick + noKeyboard: the root wraps the entire tab, so we only want
  // drag to trigger it. Click-to-pick stays on the dedicated Upload button
  // (fires `open()` from the hook).
  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: handleDrop,
    noClick: true,
    noKeyboard: true,
  })

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

  // Bulk delete — only path for removing documents now that the per-row
  // trash button is gone. Fires every selected doc at the storage API in
  // parallel; any failures stay in `selected` so the user can retry.
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)
  const [combining, setCombining] = useState(false)

  // Position of each selected doc in selection order. The `selected` Set
  // preserves insertion order (and toggling a path off then on moves it to
  // the end), so iterating it yields the exact order the user clicked —
  // which is also the order Combine will stack pages in. Non-selected docs
  // are absent from the map.
  const selectionOrder = useMemo(() => {
    const m = new Map<string, number>()
    let i = 1
    for (const p of selected) m.set(p, i++)
    return m
  }, [selected])

  // Only PDFs and images can be merged; everything else is excluded from
  // the Combine op (and from the enabled-count on the button label).
  // Iterate `documents` (not `sorted`) so a selected doc that got filtered
  // out of the visible list — e.g. an admin-only doc after toggling off
  // archived view — still counts correctly.
  const combinableSelectedCount = useMemo(() => {
    let n = 0
    for (const d of documents) if (selected.has(d.path) && canCombineDoc(d)) n++
    return n
  }, [documents, selected])

  const handleCombine = async () => {
    if (combining) return
    // Chase the Set in its own iteration order so the output stacks in
    // the exact order the user clicked. Map paths back through the full
    // `documents` list (not `sorted`) so a doc selected before the user
    // changed the sort column still appears.
    const bySelectionOrder: ClaimDocument[] = []
    for (const path of selected) {
      const doc = documents.find(d => d.path === path)
      if (doc && canCombineDoc(doc)) bySelectionOrder.push(doc)
    }
    if (bySelectionOrder.length < 2) return

    setError(null)
    setCombining(true)
    try {
      const { blob, skipped } = await combineDocsToPdf(bySelectionOrder)
      // Filename convention: `{MA#}-Documents.pdf`. Falls back to the raw
      // claim id for brand-new claims that haven't been assigned an MA#
      // yet (the DB trigger assigns MA# on insert).
      const stem = (maNumber || claimId || 'claim').trim()
      const outName = `${stem}-Documents.pdf`
      const asFile = new File([blob], outName, { type: 'application/pdf' })
      const uploaded = await uploadClaimDocument(claimId, asFile, outName, 'document')
      if (!uploaded) {
        setError('Combined PDF created but upload failed. The file may exceed the 25 MB cap — try combining fewer or smaller files.')
        return
      }
      onDocumentsChange([...documents, uploaded])
      // Clear selection after a successful combine so the user has a clean
      // slate for the next action (and the order badges disappear).
      setSelected(new Set())
      if (skipped.length > 0) {
        setError(`Combined ${bySelectionOrder.length - skipped.length} of ${bySelectionOrder.length}. Skipped: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Combine failed')
    } finally {
      setCombining(false)
    }
  }
  const confirmBulkDelete = async () => {
    setPendingBulkDelete(false)
    if (selected.size === 0) return
    setBulkDeleting(true)
    setError(null)
    const paths = Array.from(selected)
    const results = await Promise.all(paths.map(p => deleteClaimDocument(p).then(ok => ({ p, ok }))))
    const succeeded = new Set(results.filter(r => r.ok).map(r => r.p))
    const failed = results.filter(r => !r.ok).map(r => r.p)
    if (succeeded.size > 0) {
      onDocumentsChange(documents.filter(d => !succeeded.has(d.path)))
      setSelected(prev => {
        const next = new Set(prev)
        for (const p of succeeded) next.delete(p)
        return next
      })
    }
    if (failed.length > 0) setError(`${failed.length} delete${failed.length === 1 ? '' : 's'} failed. Try again.`)
    setBulkDeleting(false)
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

  // Zip filename for multi-doc downloads: "{MA#}-folder.zip" so an employee
  // dragging several zips side-by-side knows which claim each one belongs to.
  // Falls back to the raw claim id for brand-new claims that haven't been
  // assigned an MA# yet (the DB trigger assigns MA# on insert).
  const zipFileName = `${(maNumber || claimId || 'claim').trim()}-folder.zip`

  const runZipDownload = async (chosen: ClaimDocument[], busyLabel: 'selected' | 'all') => {
    setError(null)
    let errors: string[] = []
    try {
      await saveFilePickerFirst(
        zipFileName,
        'application/zip',
        'zip',
        async () => {
          setZipping(busyLabel)
          try {
            const r = await buildZipBlob(chosen)
            errors = r.errors
            // Defensive: if NOTHING succeeded, don't hand saveFilePickerFirst
            // an empty zip to write — throw so the writable is never opened.
            // Henry hit this 2026-10-14: picker opened, file was created,
            // but was empty because every fetch had silently failed.
            if (errors.length === chosen.length) {
              throw new Error(`None of the ${chosen.length} documents could be fetched. Check network / sign-in and try again.`)
            }
            return r.blob
          } finally {
            setZipping(null)
          }
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zip download failed')
      return
    }
    if (errors.length > 0) {
      setError(`${errors.length} document${errors.length === 1 ? '' : 's'} missing from zip: ${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '…' : ''}`)
    }
  }

  const handleDownloadSelected = async () => {
    const chosen = sorted.filter(d => selected.has(d.path))
    if (chosen.length === 0) return
    await runZipDownload(chosen, 'selected')
  }

  const handleDownloadAll = async () => {
    if (sorted.length === 0) return
    await runZipDownload(sorted, 'all')
  }

  const selectedCount = selected.size

  return (
    <div {...getRootProps()} className="relative space-y-6">
      <input {...getInputProps()} />
      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-blue-500/10 outline-dashed outline-2 outline-blue-500 outline-offset-[-4px]">
          <div className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-bold shadow-lg">
            <Upload className="w-5 h-5" /> Drop files to upload
          </div>
        </div>
      )}
      {/* Tab title bubble (Closing Notes pattern). */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-black text-lg font-bold tracking-tight">Documents</h2>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm font-medium transition-colors',
                showArchived
                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              )}
              title={showArchived ? 'Hide older superseded reports' : 'Show older superseded reports'}
            >
              <Archive className="w-4 h-4" />
              {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus ?? 'Uploading…'}</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload</>
          )}
        </button>
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
            {/* Combine — merges 2+ selected PDFs/photos into one PDF in
                selection order and files it to this claim. Hidden entirely
                when the selection has nothing combinable; shown disabled
                with a tooltip when only one combinable item is selected. */}
            {combinableSelectedCount > 0 && (
              <button
                type="button"
                onClick={handleCombine}
                disabled={combinableSelectedCount < 2 || combining}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-500 bg-green-500 text-white text-sm font-medium hover:bg-green-400 hover:border-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={
                  combinableSelectedCount < 2
                    ? 'Select 2 or more PDFs / photos to combine them into one PDF'
                    : `Combine ${combinableSelectedCount} selected into one PDF (in selection order)`
                }
              >
                {combining ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Combining…</>
                ) : (
                  <><Combine className="w-4 h-4" /> Combine ({combinableSelectedCount})</>
                )}
              </button>
            )}
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
            {/* Bulk Archive / Unarchive toggle — right of the admin-only
                toggle. Lets an admin manually archive a doc (hide from the
                default list) or restore one. Shows "Archive" when any
                selected doc is active, else "Unarchive". */}
            {selectedCount > 0 && (() => {
              const chosen = sorted.filter(d => selected.has(d.path))
              const anyActive = chosen.some(d => !d.archived)
              const next = anyActive
              return (
                <button
                  type="button"
                  onClick={() => {
                    onDocumentsChange(documents.map(d =>
                      selected.has(d.path) ? { ...d, archived: next } : d
                    ))
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                  title={next ? 'Move selected documents to Archive' : 'Restore selected documents from Archive'}
                >
                  {next ? 'Archive' : 'Unarchive'}
                </button>
              )
            })()}
            {/* Bulk delete — the only path for removing documents.
                Visible only when a selection exists; opens a confirm dialog
                before calling the storage API to avoid accidental purges. */}
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setPendingBulkDelete(true)}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-200 bg-white text-red-600 text-sm font-medium hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={`Delete ${selectedCount} selected`}
              >
                {bulkDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Delete selected ({selectedCount})</>
                )}
              </button>
            )}
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
                  <tr
                    key={doc.path}
                    className={cn(
                      'border-b border-gray-100 transition-colors',
                      isChecked ? 'bg-blue-50/40' : 'hover:bg-gray-50',
                      // Archived rows are muted so the active list visually
                      // dominates when the toggle is on.
                      doc.archived && 'opacity-60 bg-gray-50/60',
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${doc.name}`}
                          checked={isChecked}
                          onChange={() => toggleOne(doc.path)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        {/* Selection-order badge: shows the user's click
                            order (1-based) once 2+ docs are selected, so
                            Combine's input ordering is visible before they
                            press the button. Hidden on single-select to
                            avoid noise during normal download/delete flows. */}
                        {isChecked && selectedCount >= 2 && (
                          <span className="text-[10px] font-semibold text-blue-600 tabular-nums min-w-[14px] text-center">
                            #{selectionOrder.get(doc.path)}
                          </span>
                        )}
                      </div>
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
                        // Anchor with a real href (server redirect to a
                        // short-lived signed URL) so native ctrl/cmd+click
                        // opens the doc in a background tab — window.open
                        // steals focus. On plain click we preventDefault
                        // and open the in-tab preview modal when the file
                        // type supports it. For non-previewable types we
                        // let the anchor's natural _blank behavior fire.
                        <a
                          href={`/api/claims/${claimId}/documents/open?path=${encodeURIComponent(doc.path)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
                              // Browser handles it (background tab / new window).
                              return
                            }
                            if (canPreviewInline(doc.name)) {
                              e.preventDefault()
                              setPreviewDoc(doc)
                            }
                            // Non-previewable + plain click → let the
                            // anchor open naturally in a new tab.
                          }}
                          className="flex items-center gap-2 text-gray-900 hover:text-blue-600 font-medium text-left"
                          title="Click to preview here · Ctrl-click (⌘-click on Mac) to open in a background tab"
                        >
                          {isPhoto ? (
                            <DocThumbnail doc={doc} />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          )}
                          {doc.name}
                        </a>
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
                            {/* Per-row delete removed — use the bulk Delete
                                selected button in the toolbar after checking
                                one or more rows. */}
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

      <ConfirmDialog
        open={pendingBulkDelete}
        title={`Delete ${selectedCount} document${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>Remove <b>{selectedCount}</b> selected document{selectedCount === 1 ? '' : 's'} from this claim? This cannot be undone.</>
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDelete(false)}
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
