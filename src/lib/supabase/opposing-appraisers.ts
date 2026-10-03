// Client-safe — no server-only imports.

export interface OpposingAppraiser {
  id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
  notes: string | null
  archivedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface OARow {
  id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
  notes: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToOA(r: OARow): OpposingAppraiser {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    archivedAt: r.archived_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Fuzzy search — hits the claim-side picker endpoint. Open to any authenticated user.
export async function searchOpposingAppraisers(
  query: string,
  limit = 10,
): Promise<OpposingAppraiser[]> {
  if (!query.trim() || query.trim().length < 2) return []
  try {
    const res = await fetch(
      `/api/opposing-appraisers/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`,
    )
    if (!res.ok) return []
    const json = await res.json()
    return ((json.opposingAppraisers ?? []) as OARow[]).map(rowToOA)
  } catch {
    return []
  }
}

// Full list — admin only (hits the admin endpoint).
export async function fetchAllOpposingAppraisers(): Promise<OpposingAppraiser[]> {
  try {
    const res = await fetch('/api/admin/opposing-appraisers')
    if (!res.ok) return []
    const json = await res.json()
    return ((json.opposingAppraisers ?? []) as OARow[]).map(rowToOA)
  } catch {
    return []
  }
}
