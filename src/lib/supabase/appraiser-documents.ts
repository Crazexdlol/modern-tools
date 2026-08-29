import { createClient as createBrowserClient } from './client'

export interface AppraiserDocument {
  id: string
  userId: string
  name: string
  kind: string | null
  storagePath: string
  sizeBytes: number | null
  contentType: string | null
  uploadedBy: string | null
  uploadedAt: string
}

interface AppraiserDocumentRow {
  id: string
  user_id: string
  name: string
  kind: string | null
  storage_path: string
  size_bytes: number | null
  content_type: string | null
  uploaded_by: string | null
  uploaded_at: string
}

function rowToDoc(row: AppraiserDocumentRow): AppraiserDocument {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

export async function fetchUserDocuments(userId: string): Promise<AppraiserDocument[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('appraiser_documents')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
  if (error) {
    console.error('fetchUserDocuments failed:', error)
    return []
  }
  return (data as AppraiserDocumentRow[]).map(rowToDoc)
}
