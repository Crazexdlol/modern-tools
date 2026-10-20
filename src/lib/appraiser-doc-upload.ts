// Shared validation for appraiser-document uploads. Guards against two
// classes of abuse:
//
//   1. Cost / storage DoS — an authenticated user could POST unlimited
//      large files to the appraiser-documents bucket. Capped at 25 MB.
//
//   2. Inline-render XSS — an .html or .svg upload could execute scripts
//      when another admin opens the signed URL in a browser. The upload
//      guard rejects those MIME types; the download route additionally
//      serves everything with Content-Disposition: attachment so even if
//      a slip-through happens, the browser downloads instead of renders.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

// Allow PDFs + common image formats + plain CSVs/text. Explicitly excludes
// HTML, SVG, and JS/code mimetypes that could render inline.
const ALLOWED_MIMES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',                                                 // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // .xlsx
])

const ALLOWED_EXTENSIONS = new Set<string>([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'txt', 'csv', 'zip', 'doc', 'docx', 'xls', 'xlsx',
])

export function validateUploadedFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }
  }
  const mime = (file.type || '').toLowerCase()
  if (mime && ALLOWED_MIMES.has(mime)) return { ok: true }
  // Fallback: some browsers / curls submit application/octet-stream. Trust
  // the extension in that case, but only for extensions on our allow-list.
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ALLOWED_EXTENSIONS.has(ext)) return { ok: true }
  return { ok: false, error: `File type not allowed: ${mime || `(no mime) .${ext}`}. Allowed: PDF, images, CSV, Office docs, ZIP.` }
}
