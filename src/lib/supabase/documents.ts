import { createClient } from './client'

// Metadata for one file in a claim's Documents tab. The file itself lives in
// the 'claim-documents' storage bucket; this metadata array is stored on the
// claim row (acv_history.documents) and persisted by the workspace auto-save.
export interface ClaimDocument {
  id: string
  name: string
  // What produced it: a generated report or a manual upload.
  source: 'acv-report' | 'award' | 'closing-notes' | 'summary' | 'dv-report' | 'estimate' | 'estimate-review' | 'invoice' | 'upload'
  path: string
  size: number
  createdAt: string
}

const BUCKET = 'claim-documents'

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ ()-]+/g, '_').slice(0, 120)
}

export async function uploadClaimDocument(
  claimId: string,
  file: Blob,
  name: string,
  source: ClaimDocument['source'],
): Promise<ClaimDocument | null> {
  const supabase = createClient()
  const clean = sanitizeName(name)
  const path = `${claimId}/${Date.now()}-${clean}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
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

// Opens/downloads a stored document via a short-lived signed URL.
export async function getClaimDocumentUrl(path: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) {
    console.error('Failed to sign claim document URL:', error)
    return null
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
