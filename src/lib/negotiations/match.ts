import type { SupabaseClient } from '@supabase/supabase-js'
import { extractIdentifiers } from './classify'

export interface ClaimCandidate {
  claimId: string
  maNumber: string | null
  vehicle: string | null
  companyId: string | null
  isClosed: boolean
  score: number
  reasons: string[]
}

export interface MatchResult {
  matchedClaimId: string | null
  matchedBy: 'auto:claim_no' | 'auto:vin' | 'auto:oa_email' | null
  candidates: ClaimCandidate[]
}

interface MatchInput {
  fromAddr: string
  subject: string
  textBody: string | null
  htmlBody: string | null
}

// Given a message's identifying signal, find the best-match claim (if any)
// plus a ranked candidate list. Deterministic — Phase 4 will layer a Claude
// disambiguator on top of this for the fuzzy cases.
export async function findMatchForMessage(
  supabase: SupabaseClient,
  msg: MatchInput,
): Promise<MatchResult> {
  const from = (msg.fromAddr || '').toLowerCase()
  const body = (msg.textBody || '') + '\n' + stripHtml(msg.htmlBody || '')
  const ids = extractIdentifiers(`${msg.subject || ''}\n${body}`)

  const candidateMap = new Map<string, ClaimCandidate>()

  const addCandidate = (row: ClaimRow, reason: string, score: number) => {
    const existing = candidateMap.get(row.id)
    if (existing) {
      existing.score += score
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
    } else {
      candidateMap.set(row.id, {
        claimId: row.id,
        maNumber: row.ma_number,
        vehicle: row.vehicle,
        companyId: row.company_id,
        isClosed: row.status === 'closed',
        score,
        reasons: [reason],
      })
    }
  }

  // 1. Match by MA# / claim number in the message (top-level ma_number column).
  if (ids.claimNumbers.length > 0) {
    const { data } = await supabase
      .from('acv_history')
      .select('id, ma_number, vehicle, company_id, claim, status')
      .in('ma_number', ids.claimNumbers)
    for (const row of data || []) addCandidate(row as ClaimRow, `MA# hit ${row.ma_number}`, 100)

    // Also check claim.claimNumber (insurance carrier's claim #). Strict first.
    const strictHits = new Set<string>()
    for (const num of ids.claimNumbers) {
      const { data: byInsClaim } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, company_id, claim, status')
        .filter('claim->>claimNumber', 'eq', num)
        .limit(5)
      for (const row of byInsClaim || []) {
        addCandidate(row as ClaimRow, `insurance claim# hit ${num}`, 80)
        strictHits.add(row.id as string)
      }
    }

    // Fuzzy fallback — ONLY runs when the strict step found zero rows. If
    // strict already hit a claim, the top-score + 30pt-gap decisive check
    // handles ambiguity correctly without the fuzzy pass. Skipping this when
    // strict matched is the single biggest win in processor throughput —
    // every orphan was triggering a 500-row acv_history scan per thread.
    if (ids.claimNumbers.length > 0 && strictHits.size === 0) {
      const { data: openClaims } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, company_id, claim, status')
        .eq('status', 'open')
        .not('claim->>claimNumber', 'is', null)
        .limit(500)
      if ((openClaims?.length ?? 0) >= 500) {
        console.warn('[negotiations/match] fuzzy fallback hit 500-row cap, skipping scan')
      } else {
        for (const row of openClaims || []) {
          const claimObj = (row as ClaimRow).claim as Record<string, unknown> | undefined
          const stored = typeof claimObj?.claimNumber === 'string' ? claimObj.claimNumber as string : ''
          if (!stored) continue
          const hit = ids.claimNumbers.find(num => fuzzyClaimMatch(stored, num))
          if (hit) {
            addCandidate(row as ClaimRow, `insurance claim# fuzzy hit ${hit} ~ ${stored}`, 80)
          }
        }
      }
    }
  }

  // 2. Match by VIN (top-level vin column).
  if (ids.vins.length > 0) {
    const { data } = await supabase
      .from('acv_history')
      .select('id, ma_number, vehicle, company_id, vin, claim, status')
      .in('vin', ids.vins)
    for (const row of data || []) addCandidate(row as ClaimRow, `VIN hit ${(row as ClaimRow).vin ?? ''}`, 90)
  }

  // 3. Match by sender email → oa_claim_history (learned).
  if (from) {
    const { data: history } = await supabase
      .from('oa_claim_history')
      .select('claim_id, last_matched_at')
      .eq('oa_email', from)
      .order('last_matched_at', { ascending: false })
      .limit(20)
    if (history && history.length > 0) {
      const claimIds = history.map(h => h.claim_id)
      const { data: claims } = await supabase
        .from('acv_history')
        .select('id, ma_number, vehicle, company_id, claim, status')
        .in('id', claimIds)
      const openClaims = (claims || []).filter(c => c.status !== 'closed')
      // Higher score for more-recent matches (bumps ranking of active work).
      openClaims.forEach((row, i) => {
        addCandidate(row as ClaimRow, `sender is known OA on this claim`, 40 - Math.min(i * 5, 30))
      })
    }
  }

  // 4. Match by sender email → adjuster email on an OPEN claim.
  if (from) {
    const { data: openWithAdjuster } = await supabase
      .from('acv_history')
      .select('id, ma_number, vehicle, company_id, claim, status')
      .eq('status', 'open')
      .filter('claim->>adjusterEmail', 'eq', from)
      .limit(10)
    for (const row of openWithAdjuster || []) addCandidate(row as ClaimRow, `sender is claim adjuster`, 50)
  }

  // Sort by score desc. Ties are broken by preferring OPEN claims over closed
  // ones — a brand-new negotiation email almost never belongs to a closed
  // claim, and when there's a duplicate acv_history row with the same MA# /
  // claim# the open one is the active work.
  const ranked = Array.from(candidateMap.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1
    return 0
  })
  const top = ranked[0] ?? null

  // Auto-match conditions (any one of):
  //  (a) top score >= 80 AND beats runner-up by >= 30 points, OR
  //  (b) top score >= 80 AND top is OPEN while every tied-or-close runner-up
  //      is CLOSED. The classic open-vs-closed-duplicate case: both score 180,
  //      we take the open one.
  const runnerUp = ranked[1]
  let decisive = false
  if (top && top.score >= 80) {
    if (!runnerUp || top.score - runnerUp.score >= 30) {
      decisive = true
    } else if (!top.isClosed && runnerUp.isClosed) {
      decisive = true
    }
  }

  let matchedBy: MatchResult['matchedBy'] = null
  if (decisive && top) {
    // Pick the label of the highest-signal reason.
    if (top.reasons.some(r => r.startsWith('MA# hit'))) matchedBy = 'auto:claim_no'
    else if (top.reasons.some(r => r.startsWith('insurance claim# hit') || r.startsWith('insurance claim# fuzzy hit'))) matchedBy = 'auto:claim_no'
    else if (top.reasons.some(r => r.startsWith('VIN hit'))) matchedBy = 'auto:vin'
    else matchedBy = 'auto:oa_email'
  }

  return {
    matchedClaimId: decisive && top ? top.claimId : null,
    matchedBy,
    candidates: ranked.slice(0, 10),
  }
}

interface ClaimRow {
  id: string
  ma_number: string | null
  vehicle: string | null
  company_id: string | null
  vin?: string | null
  status?: string
  claim?: Record<string, unknown>
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<[^>]+>/g, ' ')
             .replace(/&nbsp;/gi, ' ')
             .replace(/\s+/g, ' ')
             .trim()
}

// Normalize a claim number by stripping all non-alphanumerics and uppercasing.
// "CA0021715171-02" → "CA002171517102"
export function normalizeClaimNumber(s: string | null | undefined): string {
  if (!s) return ''
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Match if normalized values are equal, OR one is a prefix/suffix of the other
// with at least 6 chars of overlap (shorter side must be ≥ 6 chars).
export function fuzzyClaimMatch(a: string, b: string): boolean {
  const na = normalizeClaimNumber(a)
  const nb = normalizeClaimNumber(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (shorter.length < 6) return false
  return longer.startsWith(shorter) || longer.endsWith(shorter)
}
