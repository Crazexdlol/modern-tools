import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'

export interface NormalizedAddress {
  addr: string
  name: string | null
}

export interface ParsedMessage {
  messageId: string
  inReplyTo: string | null
  references: string[]
  from: NormalizedAddress
  to: NormalizedAddress[]
  cc: NormalizedAddress[]
  subject: string
  sentAt: Date
  textBody: string | null
  htmlBodySanitized: string | null
  attachments: ParsedAttachmentMeta[]
  rawSizeBytes: number
}

export interface ParsedAttachmentMeta {
  filename: string
  mimeType: string
  sizeBytes: number
}

// Strips Re:/Fwd:/etc prefixes, collapses whitespace, and lowercases the
// subject for threading-fallback matching when References/In-Reply-To are
// absent (some mailers strip them).
export function normalizeSubject(subject: string): string {
  let s = (subject || '').trim()
  // Repeatedly peel prefixes like "Re:", "Fwd:", "FW:", "Re[2]:"
  for (let i = 0; i < 20; i++) {
    const before = s
    s = s.replace(/^(?:re|fw|fwd|aw|antw|sv|res)\s*(?:\[\d+\])?\s*:\s*/i, '')
    if (s === before) break
  }
  return s.replace(/\s+/g, ' ').toLowerCase().trim()
}

// HTML sanitization happens client-side (isomorphic-dompurify pulls in jsdom
// which is unstable at Vercel serverless cold-start). We store the raw HTML
// alongside a text body; the client sanitizes before render, same pattern as
// SummaryFields.tsx / SummaryPrintDoc.tsx.
export function passthroughHtml(html: string): string {
  return html || ''
}

function normalizeOne(a: { address?: string; name?: string } | undefined): NormalizedAddress | null {
  if (!a?.address) return null
  return { addr: a.address.toLowerCase().trim(), name: a.name?.trim() || null }
}

function normalizeGroup(g: AddressObject | AddressObject[] | undefined): NormalizedAddress[] {
  if (!g) return []
  const arr = Array.isArray(g) ? g : [g]
  const out: NormalizedAddress[] = []
  for (const grp of arr) {
    for (const v of grp.value || []) {
      const n = normalizeOne(v)
      if (n) out.push(n)
    }
  }
  return out
}

// Wraps mailparser's simpleParser and coerces everything into the shape we
// store. Callers that only need metadata should still expect attachments to
// be listed (metadata-only — we deliberately do NOT persist attachment
// content here; that's a separate lazy-download API in Phase 3).
export async function parseMessageSource(source: Buffer | string, rawSize: number): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(source, {
    skipImageLinks: true,
    skipTextToHtml: true,
    skipHtmlToText: false,
  })

  const from = normalizeGroup(parsed.from)[0] ?? { addr: 'unknown@unknown', name: null }
  const to = normalizeGroup(parsed.to)
  const cc = normalizeGroup(parsed.cc)

  const references: string[] = []
  const refsRaw = parsed.references
  if (Array.isArray(refsRaw)) references.push(...refsRaw)
  else if (typeof refsRaw === 'string' && refsRaw.trim()) references.push(refsRaw.trim())

  const attachments: ParsedAttachmentMeta[] = (parsed.attachments || []).map(a => ({
    filename: a.filename || 'attachment',
    mimeType: a.contentType || 'application/octet-stream',
    sizeBytes: a.size ?? 0,
  }))

  return {
    messageId: parsed.messageId || `<no-message-id-${Date.now()}-${Math.random().toString(36).slice(2)}>`,
    inReplyTo: parsed.inReplyTo || null,
    references,
    from,
    to,
    cc,
    subject: parsed.subject || '(no subject)',
    sentAt: parsed.date ?? new Date(),
    textBody: parsed.text ?? null,
    htmlBodySanitized: parsed.html ? passthroughHtml(parsed.html) : null,
    attachments,
    rawSizeBytes: rawSize,
  }
}
