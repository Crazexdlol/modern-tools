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
  // Claim types this OA handles. Same semantic as profiles.claim_types.
  // Empty = handles everything. When an admin assigns this OA to a claim
  // whose claim.claimTypes includes a type NOT in this list, the server-side
  // write path unions it in (see /api/opposing-appraisers/[id]/add-claim-types).
  claimTypes: string[]
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
  claim_types?: string[] | null
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
    claimTypes: Array.isArray(r.claim_types) ? r.claim_types : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Union new claim types into the OA's claim_types. Called when an OA is
// assigned to a claim whose types aren't yet listed on the OA profile. No-op
// if the OA already handles all the types. Fire-and-forget — a 403 or missing
// column shouldn't block the actual claim write.
export async function unionOpposingAppraiserClaimTypes(
  oaId: string,
  claimTypes: string[],
): Promise<void> {
  if (!oaId || !claimTypes || claimTypes.length === 0) return
  try {
    await fetch(`/api/opposing-appraisers/${encodeURIComponent(oaId)}/add-claim-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimTypes }),
    })
  } catch {
    // Silent: this is a UX nicety, not a correctness-critical write.
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

// All active OAs for the claim-side picker. Open to any authenticated user —
// hits the search endpoint with `all=1` so the picker can do instant local
// name-match without a round-trip per keystroke.
export async function listAllOpposingAppraisers(): Promise<OpposingAppraiser[]> {
  try {
    const res = await fetch('/api/opposing-appraisers/search?all=1')
    if (!res.ok) return []
    const json = await res.json()
    return ((json.opposingAppraisers ?? []) as OARow[]).map(rowToOA)
  } catch {
    return []
  }
}
