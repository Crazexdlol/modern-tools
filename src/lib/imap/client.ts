import { ImapFlow, type ImapFlowOptions, type ListResponse } from 'imapflow'

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
}

export type ImapConfigResult =
  | { ok: true; config: ImapConfig }
  | { ok: false; missing: string[] }

// Reads IMAP config from env. Missing vars are reported, not thrown, so the
// tab UI can render a "Not connected" banner instead of a 500.
export function getImapConfig(): ImapConfigResult {
  const host = process.env.BLUEHOST_IMAP_HOST
  const portStr = process.env.BLUEHOST_IMAP_PORT
  const user = process.env.BLUEHOST_IMAP_USER
  const pass = process.env.BLUEHOST_IMAP_PASSWORD

  const missing: string[] = []
  if (!host) missing.push('BLUEHOST_IMAP_HOST')
  if (!portStr) missing.push('BLUEHOST_IMAP_PORT')
  if (!user) missing.push('BLUEHOST_IMAP_USER')
  if (!pass) missing.push('BLUEHOST_IMAP_PASSWORD')
  if (missing.length > 0) return { ok: false, missing }

  const port = Number(portStr)
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, missing: ['BLUEHOST_IMAP_PORT (not a positive number)'] }
  }
  return { ok: true, config: { host: host!, port, user: user!, pass: pass! } }
}

export interface MailboxRefs {
  inbox: string      // 'INBOX'
  sent: string       // 'Sent' | 'INBOX.Sent' | 'Sent Items' — detected via LIST/SPECIAL-USE
}

// Runs the provided async function with a connected, authenticated ImapFlow
// client. Always logs out cleanly, even on error. Read-only intent enforced
// at the call site via mailboxOpen(name, { readOnly: true }).
export async function withImapClient<T>(fn: (client: ImapFlow, mailboxes: MailboxRefs) => Promise<T>): Promise<T> {
  const cfg = getImapConfig()
  if (!cfg.ok) {
    throw new ImapConfigMissingError(cfg.missing)
  }
  const opts: ImapFlowOptions = {
    host: cfg.config.host,
    port: cfg.config.port,
    secure: true,
    auth: { user: cfg.config.user, pass: cfg.config.pass },
    // Only surface warn/error to Vercel logs. debug/info would spam every
    // FETCH response and add measurable latency at scale.
    logger: {
      debug: () => {},
      info:  () => {},
      warn:  (obj) => console.warn('[imap:warn]', JSON.stringify(obj)),
      error: (obj) => console.error('[imap:error]', JSON.stringify(obj)),
    },
    // Fail fast if the Bluehost mail server is unreachable rather than hanging
    // the serverless function until Vercel's 300s wall.
    socketTimeout: 60_000,
    greetingTimeout: 15_000,
    // Bluehost sometimes closes long-idle sessions between LIST and SELECT;
    // disable ID + IDLE which can trigger premature closures on some servers.
    disableAutoIdle: true,
  }
  const client = new ImapFlow(opts)
  let closed = false
  client.on('close', () => {
    closed = true
    console.log('[imap:event] socket closed')
  })
  client.on('error', (err) => {
    console.error('[imap:event] error', err instanceof Error ? err.message : String(err))
  })
  try {
    await client.connect()
    console.log('[imap] connected')
    const mailboxes = await detectMailboxes(client)
    console.log('[imap] mailboxes detected', mailboxes)
    return await fn(client, mailboxes)
  } finally {
    if (!closed) {
      try { await client.logout() } catch { /* ignore */ }
    }
  }
}

// Uses SPECIAL-USE where possible (RFC 6154) to identify the Sent folder,
// falls back to well-known names.
async function detectMailboxes(client: ImapFlow): Promise<MailboxRefs> {
  const list = (await client.list()) as ListResponse[]
  const inbox = 'INBOX'
  let sent: string | null = null

  for (const box of list) {
    if (box.specialUse === '\\Sent') { sent = box.path; break }
  }
  if (!sent) {
    const candidates = ['Sent', 'INBOX.Sent', 'Sent Items', 'INBOX.Sent Items', 'Sent Messages', 'INBOX.Sent Messages']
    for (const name of candidates) {
      if (list.some(b => b.path === name)) { sent = name; break }
    }
  }
  // Never crash if Sent isn't found — treat as absent, "responded" detection
  // simply becomes impossible for that account until the folder is created.
  return { inbox, sent: sent ?? '' }
}

export class ImapConfigMissingError extends Error {
  constructor(public missing: string[]) {
    super(`IMAP config missing env vars: ${missing.join(', ')}`)
    this.name = 'ImapConfigMissingError'
  }
}
