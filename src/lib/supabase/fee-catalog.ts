import { createClient as createBrowserClient } from './client'

export interface FeeCatalogEntry {
  id: string
  code: string
  label: string
  unit: 'flat' | 'per_mile'
  sortOrder: number
  archived: boolean
}

interface FeeCatalogRow {
  id: string
  code: string
  label: string
  unit: string
  sort_order: number
  archived: boolean
}

function rowToEntry(row: FeeCatalogRow): FeeCatalogEntry {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    unit: row.unit === 'per_mile' ? 'per_mile' : 'flat',
    sortOrder: row.sort_order,
    archived: row.archived,
  }
}

/** Fetch active fee types (archived=false), sorted by sort_order. */
export async function fetchFeeCatalog(opts: { includeArchived?: boolean } = {}): Promise<FeeCatalogEntry[]> {
  const supabase = createBrowserClient()
  let query = supabase.from('fee_catalog').select('*').order('sort_order', { ascending: true })
  if (!opts.includeArchived) query = query.eq('archived', false)
  const { data, error } = await query
  if (error) {
    console.error('fetchFeeCatalog failed:', error)
    return []
  }
  return (data as FeeCatalogRow[]).map(rowToEntry)
}
