// GET /api/marketing/backfill/analyze — analyzes distinct client names on
// acv_history rows, normalizes them, clusters by similarity, and returns a
// review payload the /marketing/backfill UI renders. Admin+flag-required.
//
// Consumer-name detection is intentionally conservative: anything without a
// firm keyword AND matching a "First Last" shape is flagged as consumer/skip.
// Henry can override in the review UI.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/auth/require-admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { scopedClient } from '@/lib/supabase/scoped'

export const runtime = 'nodejs'
export const maxDuration = 60

// Keywords that classify a client's type from its name.
const TYPE_KEYWORDS: Array<{ type: 'attorney' | 'body_shop' | 'insurance_company'; patterns: RegExp[] }> = [
  {
    type: 'attorney',
    patterns: [/\blaw\b/, /\battorneys?\b/, /\bpllc\b/, /\bp\.a\.\b/, /\besq\b/, /\bfirm\b/, /\blegal\b/, /\blawyer/],
  },
  {
    type: 'body_shop',
    patterns: [/\bbody\b/, /\bcollision\b/, /\bauto\s?body\b/, /\bauto\s?repair\b/, /\bmuffler\b/, /\bgarage\b/, /\bshop\b/],
  },
  {
    type: 'insurance_company',
    patterns: [/\binsurance\b/, /\binsur\b/, /\bassurance\b/, /\bmutual\b/, /\bins\.?\s?co\b/, /\bunderwriters?\b/, /\brra\b/, /\bcarrier\b/],
  },
]

const SUFFIX_STRIP = /\b(inc|llc|l\.l\.c\.|ltd|co|corp|corporation|company|plc|pllc|pc|p\.c\.|p\.a\.)\b\.?$/gi

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,'"()&]/g, ' ')
    .replace(SUFFIX_STRIP, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectType(raw: string): 'adjuster' | 'attorney' | 'body_shop' | 'insurance_company' | null {
  const lower = raw.toLowerCase()
  for (const t of TYPE_KEYWORDS) {
    if (t.patterns.some(p => p.test(lower))) return t.type
  }
  return null // ambiguous — surface to Henry
}

// Heuristic: two-word name where each word looks capitalized in the raw
// input, no company keywords, no digits. Everything else defaults to firm.
function looksLikeConsumer(raw: string, detectedType: string | null): boolean {
  if (detectedType) return false
  const words = raw.trim().split(/\s+/).filter(w => w.length > 1)
  if (words.length < 2 || words.length > 3) return false
  if (/[0-9]/.test(raw)) return false
  // Reject anything containing any firm-ish keyword we didn't already catch.
  if (/\b(services?|group|solutions?|associates?|management|agency|adjusters?|holdings?|sedgwick|crawford|gallagher)\b/i.test(raw)) return false
  return words.every(w => /^[A-Z][a-z]+/.test(w))
}

interface AnalyzedCluster {
  key: string
  canonicalName: string
  proposedType: 'adjuster' | 'attorney' | 'body_shop' | 'insurance_company'
  typeConfident: boolean
  variants: Array<{ raw: string; count: number }>
  claimCount: number
  likelyConsumer: boolean
  needsReview: boolean
}

// Trigram similarity (very cheap — same idea as pg_trgm).
function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

export async function GET() {
  const { caller, errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse

  // Access gate: caller must have marketing_access. RLS on clients enforces
  // this too, but check explicitly here since we're using service-role for
  // the acv_history read (to get all claims regardless of assignment).
  const supa = await createServerClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: prof } = await supa.from('profiles').select('marketing_access').eq('id', user.id).maybeSingle()
  if (!prof || prof.marketing_access !== true) {
    return NextResponse.json({ error: 'marketing access required' }, { status: 403 })
  }

  // Scope acv_history reads to the caller's active company — analysis returns
  // clusters for the current company only.
  const rawService = createServiceClient()
  const service = caller!.activeCompanyId
    ? scopedClient(rawService, caller!.activeCompanyId)
    : rawService
  // Pull raw clientName + client_id from every claim. Cheap select.
  const { data, error } = await service
    .from('acv_history')
    .select('id, claim, client_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by normalized name.
  interface Bucket {
    key: string
    variants: Map<string, number> // raw → count
    claimCount: number
    alreadyLinked: number
  }
  const buckets = new Map<string, Bucket>()
  for (const row of (data as Array<{ id: string; claim: { clientName?: string } | null; client_id: string | null }>)) {
    const raw = (row.claim?.clientName ?? '').trim()
    if (!raw) continue
    const key = normalize(raw)
    if (!key) continue
    let b = buckets.get(key)
    if (!b) { b = { key, variants: new Map(), claimCount: 0, alreadyLinked: 0 }; buckets.set(key, b) }
    b.variants.set(raw, (b.variants.get(raw) ?? 0) + 1)
    b.claimCount += 1
    if (row.client_id) b.alreadyLinked += 1
  }

  // Second pass: merge buckets whose normalized keys are highly similar (>0.8).
  const rawBuckets = Array.from(buckets.values()).sort((a, b) => b.claimCount - a.claimCount)
  const merged: Bucket[] = []
  const usedIdx = new Set<number>()
  for (let i = 0; i < rawBuckets.length; i++) {
    if (usedIdx.has(i)) continue
    const b = rawBuckets[i]
    for (let j = i + 1; j < rawBuckets.length; j++) {
      if (usedIdx.has(j)) continue
      if (similarity(b.key, rawBuckets[j].key) >= 0.8) {
        // Merge j into b.
        const other = rawBuckets[j]
        for (const [k, v] of other.variants) b.variants.set(k, (b.variants.get(k) ?? 0) + v)
        b.claimCount += other.claimCount
        b.alreadyLinked += other.alreadyLinked
        usedIdx.add(j)
      }
    }
    merged.push(b)
  }

  // Build the analyzed clusters. Canonical name = most common variant. Type
  // detected from the canonical.
  const clusters: AnalyzedCluster[] = merged.map(b => {
    const variantsSorted = Array.from(b.variants.entries())
      .map(([raw, count]) => ({ raw, count }))
      .sort((a, b) => b.count - a.count)
    const canonicalName = variantsSorted[0]?.raw ?? b.key
    const detected = detectType(canonicalName)
    const consumer = looksLikeConsumer(canonicalName, detected)
    // needsReview: no confident type AND cluster has 2+ variants (a stray singleton is fine)
    const needsReview = detected === null && variantsSorted.length > 1
    return {
      key: b.key,
      canonicalName,
      proposedType: detected ?? 'adjuster',
      typeConfident: detected !== null,
      variants: variantsSorted,
      claimCount: b.claimCount,
      likelyConsumer: consumer,
      needsReview,
    }
  })

  clusters.sort((a, b) => b.claimCount - a.claimCount)

  return NextResponse.json({
    totalClaims: (data ?? []).length,
    withClientName: clusters.reduce((sum, c) => sum + c.claimCount, 0),
    clusters,
  })
}
