import type { SupabaseClient } from '@supabase/supabase-js'

// Strip leading noise prefixes from a subject before identifier extraction.
// Handles stacked tags like "[SPAM] Re: [SPAM] Fwd: ...". Keeps the inner
// subject intact (no destructive edits to the actual topic).
export function stripSubjectNoise(subject: string): string {
  if (!subject) return ''
  let out = subject
  let prev = ''
  const prefix = /^\s*(?:\[(?:spam|external|ext|secure)\]|fwd|fw|re)\s*:?\s*/i
  while (out !== prev) {
    prev = out
    out = out.replace(prefix, '')
  }
  return out.trim()
}

export type Classification = 'negotiation' | 'informational' | 'automated'

export interface ClassificationResult {
  classification: Classification
  confidence: number   // 0..1
  reason: string       // human-readable, stored for debugging
}

// Sender-pattern heuristics that reliably indicate automated mail. Kept
// deliberately narrow to avoid dropping legit adjuster mail sent from a
// mailing-list-looking address.
const AUTOMATED_SENDER_PATTERNS = [
  /(^|[.+_-])no[-._]?reply(@|[.+_-])/i,
  /(^|[.+_-])do[-._]?not[-._]?reply(@|[.+_-])/i,
  /(^|[.+_-])notification(s)?(@|[.+_-])/i,
  /(^|[.+_-])mailer[-._]?daemon(@|[.+_-])/i,
  /(^|[.+_-])postmaster(@|[.+_-])/i,
  /(^|[.+_-])bounce(s)?(@|[.+_-])/i,
  /(^|[.+_-])alerts?(@|[.+_-])/i,
  /(^|[.+_-])updates?(@|[.+_-])/i,
  /(^|[.+_-])newsletter(@|[.+_-])/i,
]

// Body patterns that indicate marketing / automated mail.
const AUTOMATED_BODY_PATTERNS = [
  /unsubscribe[\s.,!]/i,
  /view (this|the) email in your browser/i,
  /you (are|have been) subscribed/i,
  /this is an automated (message|notification|email)/i,
  /view online/i,
]

// Extract things that look like claim numbers or VINs from a body or subject.
// Case-insensitive; captured strings are trimmed and uppercased.
export interface ExtractedIdentifiers {
  claimNumbers: string[]
  vins: string[]
}

const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/gi
// Modern Appraisers uses `MA\d+`, Eagleview uses 6-digit numeric.
// Allow any of #, :, ., space, dash (one or more) between the MA prefix and digits.
const MA_REGEX = /\bMA[\s\-#:.]*\d{3,8}\b/gi
// Carrier claim-# shorthand ("CL# 4683005"). Capture only the digits.
const CL_REGEX = /\bCL[\s\-#:.]*(\d{4,15})\b/gi
const EV_REGEX = /\b(?:2[2-9]\d{4}|3\d{5})\b/g  // 220000-399999 range
const LABELED_ID_REGEX = /(?:claim\s*(?:#|no\.?|number|id)?|file\s*(?:#|no\.?|number))\s*:?\s*([A-Z0-9][A-Z0-9\-]{4,20})/gi

export function extractIdentifiers(text: string): ExtractedIdentifiers {
  const src = stripSubjectNoise(text || '')
  const claimNumbers = new Set<string>()
  const vins = new Set<string>()

  for (const m of src.matchAll(VIN_REGEX)) {
    const vin = m[0].toUpperCase()
    // Weed out obvious false positives (17 chars of same letter, etc).
    if (!/^(.)\1{16}$/.test(vin)) vins.add(vin)
  }

  for (const m of src.matchAll(MA_REGEX)) {
    // Strip "MA" prefix + separators (#, -, :, ., whitespace). Keep digits only.
    const digits = m[0].replace(/^MA/i, '').replace(/[\s\-#:.]/g, '')
    if (digits.length >= 3) claimNumbers.add(digits)
  }
  for (const m of src.matchAll(CL_REGEX)) {
    // CL# captures the digits in group 1.
    claimNumbers.add((m[1] || '').toUpperCase())
  }
  for (const m of src.matchAll(EV_REGEX)) {
    claimNumbers.add(m[0])
  }
  for (const m of src.matchAll(LABELED_ID_REGEX)) {
    const raw = (m[1] || '').toUpperCase()
    if (raw.length >= 5) claimNumbers.add(raw)
  }

  return {
    claimNumbers: Array.from(claimNumbers),
    vins: Array.from(vins),
  }
}

interface ClassifyInput {
  fromAddr: string
  subject: string
  textBody: string | null
  htmlBody: string | null
}

export async function classifyMessage(
  supabase: SupabaseClient,
  msg: ClassifyInput,
): Promise<ClassificationResult> {
  const from = (msg.fromAddr || '').toLowerCase()
  const subject = msg.subject || ''
  const body = (msg.textBody || '') + '\n' + stripHtml(msg.htmlBody || '')

  // Rule 0: muted sender / domain (persistent allowlist Henry curates via UI).
  // Pre-migration safe: if the table doesn't exist, this check is a no-op.
  if (from) {
    const atIdx = from.indexOf('@')
    const domain = atIdx > 0 ? from.slice(atIdx + 1) : ''
    const mutedQuery = supabase
      .from('negotiation_muted_senders')
      .select('id, email, domain')
      .or(domain ? `email.eq.${from},domain.eq.${domain}` : `email.eq.${from}`)
      .limit(1)
    const { data: mutedRows, error: mutedErr } = await mutedQuery.maybeSingle()
    if (!mutedErr && mutedRows) {
      const reason = mutedRows.email ? 'muted sender' : 'muted domain'
      return { classification: 'automated', confidence: 1.0, reason }
    }
    // 42P01 = table doesn't exist. Silent fallback = no mute applied.
    // Any other error: log and continue (don't fail classification).
    if (mutedErr && mutedErr.code && mutedErr.code !== '42P01') {
      console.warn('[negotiations/classify] mute lookup error', mutedErr.message)
    }
  }

  // Rule 1: automated sender pattern.
  for (const p of AUTOMATED_SENDER_PATTERNS) {
    if (p.test(from)) {
      return { classification: 'automated', confidence: 0.95, reason: `sender pattern ${p.source}` }
    }
  }

  // Rule 2: body screams marketing / automated.
  const bodyMatches = AUTOMATED_BODY_PATTERNS.filter(p => p.test(body)).length
  if (bodyMatches >= 2) {
    return { classification: 'automated', confidence: 0.85, reason: `body has ${bodyMatches} automated markers` }
  }
  if (bodyMatches === 1 && !hasNegotiationSignal(subject, body)) {
    return { classification: 'automated', confidence: 0.7, reason: 'body has 1 automated marker, no negotiation signal' }
  }

  // Rule 3: negotiation signal in subject or body.
  const ids = extractIdentifiers(`${subject}\n${body}`)
  if (ids.claimNumbers.length > 0 || ids.vins.length > 0) {
    return {
      classification: 'negotiation',
      confidence: 0.9,
      reason: `identifiers: ${ids.claimNumbers.length} claim#, ${ids.vins.length} VIN`,
    }
  }

  // Rule 4: sender is a known OA/adjuster (in oa_claim_history).
  if (from) {
    const { data: known } = await supabase
      .from('oa_claim_history')
      .select('oa_email')
      .eq('oa_email', from)
      .limit(1)
      .maybeSingle()
    if (known) {
      return { classification: 'negotiation', confidence: 0.75, reason: 'sender is known OA' }
    }
    // Also check if sender matches an adjuster email on any active claim.
    const { data: adjusterMatch } = await supabase
      .from('acv_history')
      .select('id')
      .eq('status', 'open')
      .filter('claim->>adjusterEmail', 'eq', from)
      .limit(1)
      .maybeSingle()
    if (adjusterMatch) {
      return { classification: 'negotiation', confidence: 0.75, reason: 'sender is claim adjuster' }
    }
  }

  return { classification: 'informational', confidence: 0.4, reason: 'no explicit signal' }
}

function hasNegotiationSignal(subject: string, body: string): boolean {
  const t = `${subject}\n${body}`.toLowerCase()
  return /\b(counter(offer)?|acv|actual\s*cash\s*value|total\s*loss|diminished\s*value|appraisal|award|umpire|settle(ment)?|reimbursement|claim)\b/.test(t)
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
