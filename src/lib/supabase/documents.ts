import { createClient } from './client'

// Metadata for one file in a claim's Documents tab. The file itself lives in
// the 'claim-documents' storage bucket; this metadata array is stored on the
// claim row (acv_history.documents) and persisted by the workspace auto-save.
export interface ClaimDocument {
  id: string
  name: string
  // What produced it: a generated report, a manual upload, or an auto-classified upload.
  // 'upload' and 'labor-rates' are legacy values kept for backward-compat only —
  // new uploads never produce them; they render as 'document' at display time.
  source: 'acv-report' | 'award' | 'closing-notes' | 'summary' | 'dv-report' | 'estimate' | 'estimate-review' | 'invoice' | 'storage' | 'upload' | 'labor-rates' | 'document' | 'photo'
  path: string
  size: number
  createdAt: string
  // When true, this document is only visible to admin users.
  adminOnly?: boolean
}

const BUCKET = 'claim-documents'

// 25 MB per file — Modern Appraisers docs are typically photo scans and
// small PDFs; anything larger is almost certainly wrong (bulk upload,
// malformed export, adversarial payload).
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

// Everything an admin/appraiser might legitimately attach: PDFs, common
// office docs, images, plus the storage-bucket fallback for MIME-less
// uploads. Extending this is fine, but keep the allowlist tight.
const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
])

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ ()-]+/g, '_').slice(0, 120)
}

// Extension must match the declared MIME family. Blocks renamed-extension
// attacks (e.g. .html served as application/pdf). Only covers extensions
// whose MIME is in ALLOWED_MIME above — everything else is either
// unmapped-but-allowed (skipped) or gets rejected by the MIME check first.
const EXT_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.rtf': ['application/rtf'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'application/vnd.ms-excel'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.heic': ['image/heic', 'image/heif'],
  '.heif': ['image/heic', 'image/heif'],
  '.tif': ['image/tiff'],
  '.tiff': ['image/tiff'],
}

export async function uploadClaimDocument(
  claimId: string,
  file: Blob,
  name: string,
  source: ClaimDocument['source'],
): Promise<ClaimDocument | null> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    console.error(`Upload rejected: ${file.size} bytes exceeds cap`)
    return null
  }
  const mime = (file.type || 'application/octet-stream').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    console.error(`Upload rejected: content-type ${mime} not allowed`)
    return null
  }
  // Extension-vs-MIME cross-check. If the name has no extension, or the
  // extension isn't in our map, skip — the MIME allowlist above already
  // gated this. Only reject when we have a mapped extension and the
  // declared MIME doesn't match — that's the renamed-extension attack.
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : ''
  const expected = EXT_MIME[ext]
  if (expected && !expected.includes(mime)) {
    console.error(`Upload rejected: extension ${ext} doesn't match declared MIME ${mime}`)
    return null
  }
  const supabase = createClient()
  const clean = sanitizeName(name)
  const path = `${claimId}/${Date.now()}-${clean}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (error) {
    console.error('Failed to upload claim document:', error)
    return null
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    source,
    path,
    size: file.size,
    createdAt: new Date().toISOString(),
  }
}

// Opens/downloads a stored document via a short-lived signed URL. When
// `downloadName` is passed, Supabase sets a Content-Disposition header so
// the browser saves the file as that name — otherwise the download name
// falls back to the last segment of the storage path (which prefixes an
// epoch timestamp + the claim id + the sanitized display name, e.g.
// "1731619200000-MA1234-acv (1).pdf") and users end up with ugly filenames.
export async function getClaimDocumentUrl(
  path: string,
  downloadName?: string | null,
): Promise<string | null> {
  const supabase = createClient()
  const opts = downloadName ? { download: downloadName } : undefined
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, opts)
  if (error) {
    console.error('Failed to sign claim document URL:', error)
    return null
  }
  return data.signedUrl
}

// Thumbnail URL for an image in storage. Uses Supabase image transformations
// (available on Pro+) to resize server-side so the browser only downloads a
// ~160px version instead of the full-res multi-MB original. Falls back to
// the un-transformed URL if transforms aren't enabled on the project.
export async function getClaimDocumentThumbUrl(path: string, width = 160): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, {
    transform: { width, resize: 'contain', quality: 70 },
  })
  if (error || !data?.signedUrl) {
    return getClaimDocumentUrl(path)
  }
  return data.signedUrl
}

export async function deleteClaimDocument(path: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) {
    console.error('Failed to delete claim document:', error)
    return false
  }
  return true
}
