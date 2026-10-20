import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { normalizeCompanyKey } from '@/lib/company-match'

// All claim-trigger emails live here. Each exported `notify*` function is
// fire-and-forget from the caller's perspective — they log errors to the
// server console and never throw, so a Resend outage can't take down the
// originating request (assign/submit/message POST).
//
// All recipient lookups are centralized in `loadRecipient()` so the two
// per-recipient gates — active status and the per-user email opt-out — are
// enforced in exactly one place regardless of which trigger fires.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hamsportal.com'
const NO_REPLY_FOOTER =
  '— HamsPortal\nThis mailbox is not monitored. Replies to this email will not be read.'

export interface ClaimSummary {
  id: string
  insuredName: string
  vehicle: string
  maNumber: string
  claimNumber: string
  insuranceCompany: string
  // The ordering party (TPA / client firm) — used for per-client submission
  // routing. Not shown in email bodies (we show Insurance instead), but
  // consumed by getSubmissionAdminForClaim().
  clientName: string
}

export async function fetchClaimSummary(claimId: string): Promise<ClaimSummary | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('acv_history')
    .select('id, claim')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('fetchClaimSummary:', error)
    return null
  }
  const claim = (data.claim ?? {}) as Record<string, unknown>
  const year = typeof claim.year === 'number' && claim.year > 0 ? String(claim.year) : ''
  const make = (claim.make as string | undefined)?.trim() ?? ''
  const model = (claim.model as string | undefined)?.trim() ?? ''
  const vehicle = [year, make, model].filter(Boolean).join(' ').trim()
  return {
    id: data.id as string,
    insuredName: ((claim.insuredName as string | undefined) ?? '').trim(),
    vehicle,
    maNumber: ((claim.maNumber as string | undefined) ?? '').trim(),
    claimNumber: ((claim.claimNumber as string | undefined) ?? '').trim(),
    insuranceCompany: ((claim.insuranceCompany as string | undefined) ?? '').trim(),
    clientName: ((claim.clientName as string | undefined) ?? '').trim(),
  }
}

// Subject format: "{Prefix — }{Insured} | {Vehicle} | MA# {ma} | CL# {cl}"
// Missing fields collapse gracefully. Prefix distinguishes cancellation /
// submission / message emails in the inbox. ("Vehicle Owner" suffix removed
// 2026-10-10 — it was redundant with "{Insured}" and cluttered the subject.)
export function claimSubject(claim: ClaimSummary, prefix?: string): string {
  const parts = [
    claim.insuredName || null,
    claim.vehicle || null,
    claim.maNumber ? `MA# ${claim.maNumber}` : null,
    claim.claimNumber ? `CL# ${claim.claimNumber}` : null,
  ].filter((p): p is string => !!p)
  const core = parts.join(' | ')
  return prefix ? `${prefix} — ${core}` : core
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

function claimLink(claimId: string): string {
  return `${SITE_URL}/claims/${encodeURIComponent(claimId)}`
}

function detailsBlock(claim: ClaimSummary, includeInsurance = false): string {
  const rows: Array<[string, string]> = [
    ['Owner:', claim.insuredName],
    ['Vehicle:', claim.vehicle],
    ['MA#:', claim.maNumber],
    ['CL#:', claim.claimNumber],
  ]
  if (includeInsurance && claim.insuranceCompany) {
    rows.push(['Insurance:', claim.insuranceCompany])
  }
  return rows
    .filter(([, v]) => !!v)
    .map(([k, v]) => `  ${k.padEnd(10, ' ')} ${v}`)
    .join('\n')
}

interface RecipientProfile {
  email: string
  name: string
  // true unless the user has explicitly opted out via the
  // email_notifications_enabled flag on their profile. Treated as true when
  // the column doesn't exist yet (pre-migration safety).
  enabled: boolean
}

// Loads the profile, enforces is_active + the opt-out flag. Returns null when
// the user shouldn't receive the email (missing, inactive, opted out, or no
// valid email). select('*') tolerates the pre-migration state where
// email_notifications_enabled doesn't exist on the row.
async function loadRecipient(userId: string): Promise<RecipientProfile | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  if (row.is_active === false) return null
  const email = ((row.email as string | null) ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return {
    email,
    name: ((row.name as string | null) ?? '').trim(),
    enabled: row.email_notifications_enabled !== false,
  }
}

async function fire(label: string, to: string, subject: string, text: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email:${label}] RESEND_API_KEY missing, skipping send to ${to}`)
    return
  }
  try {
    const res = await sendEmail({ to, subject, text, html })
    if (!res.ok) console.error(`[email:${label}] send failed to ${to}: ${res.error}`)
  } catch (err) {
    console.error(`[email:${label}] threw while sending to ${to}:`, err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Strip HTML tags + decode entities, preserving paragraph / list / line-break
// structure as plain-text newlines. Used to produce the message-notification
// email body — messages are stored as sanitized HTML (plain style + optional
// highlight marks + line breaks), but email clients should see clean text,
// not escaped tag soup. Also handles legacy pre-sanitize rows that have
// Outlook MsoNormal / inline-styled spans baked in.
function htmlToPlainText(s: string): string {
  if (!s) return ''
  return s
    // Block elements → newlines
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode the common HTML entities a composer / pasted content can leave behind.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse runs of blank lines; trim stray whitespace.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Builds the clickable "Open claim #MA" link row. Falls back to a generic
// label when MA# is blank so there's always something to click.
function openClaimLinkHtml(claim: ClaimSummary): string {
  const url = claimLink(claim.id)
  const label = claim.maNumber ? `#${claim.maNumber}` : 'Open claim'
  return `<p style="margin:16px 0 0 0;">Open claim: <a href="${url}" style="color:#2563eb; text-decoration:underline; font-weight:600;">${escapeHtml(label)}</a></p>`
}

function openClaimLinkText(claim: ClaimSummary): string {
  const url = claimLink(claim.id)
  if (claim.maNumber) return `Open claim #${claim.maNumber}: ${url}`
  return `Open the claim: ${url}`
}

function detailsHtml(claim: ClaimSummary, includeInsurance = false): string {
  const rows: Array<[string, string]> = [
    ['Owner', claim.insuredName],
    ['Vehicle', claim.vehicle],
    ['MA#', claim.maNumber],
    ['CL#', claim.claimNumber],
  ]
  if (includeInsurance && claim.insuranceCompany) rows.push(['Insurance', claim.insuranceCompany])
  const inner = rows
    .filter(([, v]) => !!v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0; color:#6b7280; font-weight:600; white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:2px 0; color:#111827;">${escapeHtml(v)}</td></tr>`,
    )
    .join('')
  return `<table cellpadding="0" cellspacing="0" style="margin:12px 0; font-family:'Times New Roman', Times, serif; font-size:14px;">${inner}</table>`
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0; padding:16px; font-family:'Times New Roman', Times, serif; font-size:14px; color:#111827; background:#ffffff;">${bodyHtml}<hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;"/><p style="margin:0; font-size:12px; color:#9ca3af;">— HamsPortal<br/>This mailbox is not monitored. Replies to this email will not be read.</p></body></html>`
}

export async function notifyAppraiserAssigned(params: {
  claimId: string
  appraiserId: string
}): Promise<void> {
  const recipient = await loadRecipient(params.appraiserId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const subject = claimSubject(claim)
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    'A new claim has been assigned to you in HamsPortal.',
    '',
    detailsBlock(claim, true),
    '',
    openClaimLinkText(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>A new claim has been assigned to you in HamsPortal.</p>` +
      detailsHtml(claim, true) +
      openClaimLinkHtml(claim),
  )
  await fire('assigned', recipient.email, subject, text, html)
}

export async function notifyAppraiserRemoved(params: {
  claimId: string
  appraiserId: string
}): Promise<void> {
  const recipient = await loadRecipient(params.appraiserId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const subject = claimSubject(claim, 'Claim cancelled')
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    'This claim has been removed from your queue. No further action is needed on your end.',
    '',
    detailsBlock(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>This claim has been removed from your queue. No further action is needed on your end.</p>` +
      detailsHtml(claim),
  )
  await fire('removed', recipient.email, subject, text, html)
}

export async function notifyAdminClaimSubmitted(params: {
  claimId: string
  adminId: string
  submitterName: string
}): Promise<void> {
  const recipient = await loadRecipient(params.adminId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const subject = claimSubject(claim, `Claim submitted by ${params.submitterName}`)
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    `${params.submitterName} has submitted a claim for review.`,
    '',
    detailsBlock(claim),
    '',
    openClaimLinkText(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>${escapeHtml(params.submitterName)} has submitted a claim for review.</p>` +
      detailsHtml(claim) +
      openClaimLinkHtml(claim),
  )
  await fire('submitted', recipient.email, subject, text, html)
}

// Fires when a claim advances INTO Billing/Delivery or Payment — notifies
// the single designated routing admin (per-client override → stage default).
// Separate from notifyStageEntry (which emails the broader watcher list on
// every stage entry); this is a one-to-one "you own this now" email.
export async function notifyAdminStageAdvance(params: {
  claimId: string
  adminId: string
  actorName: string
  stage: 'billing_delivery' | 'payment'
}): Promise<void> {
  const recipient = await loadRecipient(params.adminId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const stageLabel = params.stage === 'billing_delivery' ? 'Billing/Delivery' : 'Payment'
  const subject = claimSubject(claim, `Advanced to ${stageLabel} by ${params.actorName}`)
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    `${params.actorName} has advanced this claim to the ${stageLabel} stage.`,
    '',
    detailsBlock(claim),
    '',
    openClaimLinkText(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>${escapeHtml(params.actorName)} has advanced this claim to the <b>${escapeHtml(stageLabel)}</b> stage.</p>` +
      detailsHtml(claim) +
      openClaimLinkHtml(claim),
  )
  await fire(`advance:${params.stage}`, recipient.email, subject, text, html)
}

// Fires on the FIRST Submit of a rough-numbers claim — the one that parks
// the claim with the inbox owner (not a QC submit). Separate from
// notifyAdminClaimSubmitted so the body copy can be clear about what the
// recipient needs to do: coordinate the client response, not QC review.
export async function notifyRoughNumbersHandoff(params: {
  claimId: string
  inboxOwnerId: string
  submitterName: string
}): Promise<void> {
  const recipient = await loadRecipient(params.inboxOwnerId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const subject = claimSubject(claim, `Rough-numbers claim handed to you — ${params.submitterName}`)
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    `${params.submitterName} has submitted a claim with rough numbers for client review.`,
    `It's parked with you to coordinate the client response.`,
    '',
    detailsBlock(claim),
    '',
    openClaimLinkText(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>${escapeHtml(params.submitterName)} has submitted a claim with rough numbers for client review. It's parked with you to coordinate the client response.</p>` +
      detailsHtml(claim) +
      openClaimLinkHtml(claim),
  )
  await fire('submitted', recipient.email, subject, text, html)
}

export async function notifyClaimMessage(params: {
  claimId: string
  recipientId: string
  senderName: string
  messageBody: string
}): Promise<void> {
  const recipient = await loadRecipient(params.recipientId)
  if (!recipient || !recipient.enabled) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const subject = claimSubject(claim, 'New message')
  const divider = '-'.repeat(60)
  // Messages in the DB are HTML (plain style + <br> / <mark>). Legacy rows
  // can also contain pasted Outlook/Gmail soup. Convert to clean plain text
  // for the email body — recipients see readable paragraphs, not <p>/<span>
  // / MsoNormal gibberish.
  const bodyPlain = htmlToPlainText(params.messageBody)
  const text = [
    `Hi ${firstName(recipient.name)},`,
    '',
    `${params.senderName} sent a new message on this claim:`,
    '',
    divider,
    bodyPlain,
    divider,
    '',
    openClaimLinkText(claim),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')
  // HTML version: re-escape the plain-text body so angle brackets the sender
  // typed render as text, and use white-space: pre-wrap to preserve the
  // newlines without recreating any formatting the sender didn't ask for.
  const bodyHtmlBlock = `<blockquote style="margin:12px 0; padding:12px 16px; border-left:3px solid #e5e7eb; background:#f9fafb; white-space:pre-wrap; font-family:'Times New Roman', Times, serif; font-size:14px; color:#111827;">${escapeHtml(bodyPlain)}</blockquote>`
  const html = wrapHtml(
    `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
      `<p>${escapeHtml(params.senderName)} sent a new message on this claim:</p>` +
      bodyHtmlBlock +
      detailsHtml(claim) +
      openClaimLinkHtml(claim),
  )
  await fire('message', recipient.email, subject, text, html)
}

// Reads the admin configured in site_settings (via the Notifications admin
// page) who should receive "claim submitted" notifications. Returns null
// when no admin has been picked yet — the submit route skips sending.
export async function getCompletionNotificationAdminId(): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'completion_notification_admin_id')
    .maybeSingle()
  const v = data?.value as unknown
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

// Resolves per-client admin override first, falls back to the global default.
// clientName is matched via normalizeCompanyKey so free-text variants like
// "Claim Solution", "CLAIMSOLUTION", and "ClaimSolution Inc." all land on
// the same bucket. Returns null if neither resolves.
export async function getSubmissionAdminForClaim(clientName: string | null): Promise<string | null> {
  return resolveAdminFromMapOrDefault(clientName, 'completion_admin_by_client', 'completion_notification_admin_id')
}

// -------- Per-stage primary routing (Billing/Delivery, Payment) --------
//
// Separate from the Stage-entry watcher list below: these resolve a SINGLE
// designated admin per client for the Billing/Delivery and Payment stages,
// matching the pattern already used for QC submissions above. Watcher list
// still fires in parallel for CC-style notifications.

async function readSettingString(key: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.from('site_settings').select('value').eq('key', key).maybeSingle()
  const v = data?.value as unknown
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

async function readSettingClientMap(key: string): Promise<Record<string, unknown>> {
  const service = createServiceClient()
  const { data } = await service.from('site_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value ?? {}) as Record<string, unknown>
}

async function resolveAdminFromMapOrDefault(
  clientName: string | null,
  mapKey: string,
  defaultKey: string,
): Promise<string | null> {
  // Match the override map via normalizeCompanyKey so free-text variants
  // (whitespace, case, "Inc./LLC" suffix) all land on the same bucket.
  // We scan every stored key so old entries saved pre-normalization
  // (plain lowercased with spaces) still match without a data migration.
  const target = normalizeCompanyKey(clientName)
  if (target) {
    const map = await readSettingClientMap(mapKey)
    // Try exact-match on the normalized key first (new format), then fall
    // back to scanning + normalizing each stored key (handles legacy keys
    // like "claim solution" that were saved before the normalizer landed).
    const direct = map[target]
    if (typeof direct === 'string' && direct.length > 0) return direct
    for (const [key, value] of Object.entries(map)) {
      if (typeof value !== 'string' || value.length === 0) continue
      if (normalizeCompanyKey(key) === target) return value
    }
  }
  return readSettingString(defaultKey)
}

export async function getBillingAdminForClaim(clientName: string | null): Promise<string | null> {
  return resolveAdminFromMapOrDefault(clientName, 'billing_admin_by_client', 'billing_notification_admin_id')
}

export async function getPaymentAdminForClaim(clientName: string | null): Promise<string | null> {
  return resolveAdminFromMapOrDefault(clientName, 'payment_admin_by_client', 'payment_notification_admin_id')
}

// -------- Stage-entry watchers --------

export type DashboardStage = 'main' | 'qc' | 'billing_delivery' | 'payment'

const STAGE_LABELS: Record<DashboardStage, string> = {
  main: 'New Assignments',
  qc: 'QC',
  billing_delivery: 'Billing/Delivery',
  payment: 'Payment',
}

async function getStageWatchers(stage: DashboardStage): Promise<string[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'stage_entry_watchers')
    .maybeSingle()
  const map = (data?.value ?? {}) as Record<string, unknown>
  const ids = map[stage]
  if (!Array.isArray(ids)) return []
  return ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

// Fires one email per configured watcher when a claim enters the given
// dashboard stage. Deduplicates against the actor so the person triggering
// the transition doesn't email themselves. Each notification respects the
// recipient's per-user opt-out via loadRecipient() inside the inner helper.
export async function notifyStageEntry(params: {
  claimId: string
  stage: DashboardStage
  actorId?: string | null
}): Promise<void> {
  const watchers = await getStageWatchers(params.stage)
  if (watchers.length === 0) return
  const targets = watchers.filter((id) => id !== params.actorId)
  if (targets.length === 0) return
  const claim = await fetchClaimSummary(params.claimId)
  if (!claim) return
  const stageLabel = STAGE_LABELS[params.stage]
  const subject = claimSubject(claim, `Entered ${stageLabel}`)

  await Promise.all(
    targets.map(async (userId) => {
      const recipient = await loadRecipient(userId)
      if (!recipient || !recipient.enabled) return
      const text = [
        `Hi ${firstName(recipient.name)},`,
        '',
        `This claim just entered the ${stageLabel} dashboard.`,
        '',
        detailsBlock(claim),
        '',
        openClaimLinkText(claim),
        '',
        NO_REPLY_FOOTER,
      ].join('\n')
      const html = wrapHtml(
        `<p>Hi ${escapeHtml(firstName(recipient.name))},</p>` +
          `<p>This claim just entered the <b>${escapeHtml(stageLabel)}</b> dashboard.</p>` +
          detailsHtml(claim) +
          openClaimLinkHtml(claim),
      )
      await fire(`stage:${params.stage}`, recipient.email, subject, text, html)
    }),
  )
}

// -------- Daily digest --------

interface DigestClaim {
  id: string
  maNumber: string
  insuredName: string
  vehicle: string
  clientName: string
}

export interface DailyDigest {
  dateLabel: string
  opened: DigestClaim[]
  delivered: DigestClaim[]
}

// Pulls claims opened + claims that entered the Delivery stage during the
// window [startIso, endIso). Uses the service client to bypass RLS.
export async function buildDailyDigest(startIso: string, endIso: string, dateLabel: string): Promise<DailyDigest> {
  const service = createServiceClient()

  // Opened = created in-window.
  const { data: openedRows } = await service
    .from('acv_history')
    .select('id, claim, created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true })

  // Delivered = entered Payment stage in-window (i.e. finished the combined
  // Billing/Delivery step and advanced out to Payment). Via the cycle-time
  // ledger so this works regardless of whether a claim is still in Payment
  // or has already closed.
  const { data: stageRows } = await service
    .from('claim_stage_events')
    .select('claim_id, entered_at')
    .eq('stage', 'payment')
    .gte('entered_at', startIso)
    .lt('entered_at', endIso)

  const deliveredIds = Array.from(new Set(((stageRows ?? []) as Array<{ claim_id: string }>).map((r) => r.claim_id)))
  let deliveredClaimRows: Array<{ id: string; claim: Record<string, unknown> }> = []
  if (deliveredIds.length > 0) {
    const { data } = await service
      .from('acv_history')
      .select('id, claim')
      .in('id', deliveredIds)
    deliveredClaimRows = (data ?? []) as Array<{ id: string; claim: Record<string, unknown> }>
  }

  const toDigestClaim = (row: { id: string; claim: Record<string, unknown> }): DigestClaim => {
    const c = (row.claim ?? {}) as Record<string, unknown>
    const year = typeof c.year === 'number' && c.year > 0 ? String(c.year) : ''
    const make = (c.make as string | undefined)?.trim() ?? ''
    const model = (c.model as string | undefined)?.trim() ?? ''
    return {
      id: row.id,
      maNumber: ((c.maNumber as string | undefined) ?? '').trim(),
      insuredName: ((c.insuredName as string | undefined) ?? '').trim(),
      vehicle: [year, make, model].filter(Boolean).join(' ').trim(),
      clientName: ((c.clientName as string | undefined) ?? '').trim(),
    }
  }

  return {
    dateLabel,
    opened: ((openedRows ?? []) as Array<{ id: string; claim: Record<string, unknown> }>).map(toDigestClaim),
    delivered: deliveredClaimRows.map(toDigestClaim),
  }
}

export async function getDailyDigestRecipients(): Promise<string[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'daily_digest_recipients')
    .maybeSingle()
  const v = data?.value
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of v) {
    if (typeof entry !== 'string') continue
    const email = entry.trim().toLowerCase()
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export async function sendDailyDigest(digest: DailyDigest, recipients: string[]): Promise<void> {
  if (recipients.length === 0) return
  const subject = `HamsPortal daily digest — ${digest.dateLabel}`
  const openedCount = digest.opened.length
  const deliveredCount = digest.delivered.length

  const textRows = (list: DigestClaim[]): string =>
    list.length === 0
      ? '  (none)'
      : list
          .map((c) => {
            const bits = [c.maNumber && `MA# ${c.maNumber}`, c.insuredName, c.vehicle, c.clientName].filter(Boolean)
            return `  • ${bits.join(' — ')}`
          })
          .join('\n')

  const text = [
    `HamsPortal daily digest for ${digest.dateLabel}`,
    '',
    `OPENED TODAY (${openedCount}):`,
    textRows(digest.opened),
    '',
    `DELIVERED TODAY (${deliveredCount}):`,
    textRows(digest.delivered),
    '',
    NO_REPLY_FOOTER,
  ].join('\n')

  const htmlRows = (list: DigestClaim[]): string => {
    if (list.length === 0) return '<p style="margin:4px 0; color:#9ca3af; font-style:italic;">(none)</p>'
    const items = list
      .map((c) => {
        const url = claimLink(c.id)
        const label = c.maNumber ? `#${c.maNumber}` : 'Open claim'
        const bits = [c.insuredName, c.vehicle, c.clientName].filter(Boolean).map(escapeHtml).join(' — ')
        return `<li style="margin:4px 0;"><a href="${url}" style="color:#2563eb; text-decoration:underline; font-weight:600;">${escapeHtml(label)}</a>${bits ? ` — ${bits}` : ''}</li>`
      })
      .join('')
    return `<ul style="margin:4px 0 0 20px; padding:0;">${items}</ul>`
  }

  const html = wrapHtml(
    `<p style="margin:0 0 8px 0;"><b>HamsPortal daily digest</b> — ${escapeHtml(digest.dateLabel)}</p>` +
      `<p style="margin:12px 0 4px 0; font-weight:700;">Opened today (${openedCount})</p>` +
      htmlRows(digest.opened) +
      `<p style="margin:16px 0 4px 0; font-weight:700;">Delivered today (${deliveredCount})</p>` +
      htmlRows(digest.delivered),
  )

  await Promise.all(
    recipients.map((email) => fire('daily-digest', email, subject, text, html)),
  )
}
