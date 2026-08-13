"use client"

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Trash2, Download, Loader2 } from 'lucide-react'
import {
  uploadClaimDocument,
  getClaimDocumentUrl,
  deleteClaimDocument,
  type ClaimDocument,
} from '@/lib/supabase/documents'

const SOURCE_LABELS: Record<ClaimDocument['source'], string> = {
  'acv-report': 'ACV Report',
  'award': 'Award',
  'closing-notes': 'Closing Notes',
  'summary': 'Summary',
  'dv-report': 'DV Report',
  'estimate': 'Estimate',
  'invoice': 'Invoice',
  'upload': 'Uploaded',
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
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return
    setUploading(true)
    setError(null)
    const added: ClaimDocument[] = []
    for (const file of accepted) {
      const doc = await uploadClaimDocument(claimId, file, file.name, 'upload')
      if (doc) added.push(doc)
      else setError('One or more uploads failed. Check your connection and try again.')
    }
    if (added.length > 0) onDocumentsChange([...documents, ...added])
    setUploading(false)
  }, [claimId, documents, onDocumentsChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleDrop })

  const handleOpen = async (doc: ClaimDocument) => {
    setBusyPath(doc.path)
    const url = await getClaimDocumentUrl(doc.path)
    setBusyPath(null)
    if (url) window.open(url, '_blank')
    else setError('Could not open the document. Try again.')
  }

  const handleDelete = async (doc: ClaimDocument) => {
    if (!confirm(`Delete "${doc.name}" from this claim's documents?`)) return
    setBusyPath(doc.path)
    const ok = await deleteClaimDocument(doc.path)
    setBusyPath(null)
    if (ok) onDocumentsChange(documents.filter(d => d.path !== doc.path))
    else setError('Delete failed. Try again.')
  }

  const sorted = [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        {uploading
          ? <Loader2 className="w-7 h-7 text-blue-500 mx-auto mb-2 animate-spin" />
          : <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />}
        <p className="text-sm text-gray-500">
          {uploading ? 'Uploading...' : isDragActive ? 'Drop files here...' : 'Drop files here, or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Generated report PDFs are saved here automatically when you download or print them.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
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
                <td colSpan={5} className="text-center py-16 text-gray-400">
                  No documents yet. Download or print a report, or drop files above.
                </td>
              </tr>
            ) : (
              sorted.map((doc) => (
                <tr key={doc.path} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => handleOpen(doc)} className="flex items-center gap-2 text-gray-900 hover:text-blue-600 font-medium text-left">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      {doc.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600">
                      {SOURCE_LABELS[doc.source] ?? doc.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(doc.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtSize(doc.size)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {busyPath === doc.path ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <>
                          <button onClick={() => handleOpen(doc)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Open / download">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(doc)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
