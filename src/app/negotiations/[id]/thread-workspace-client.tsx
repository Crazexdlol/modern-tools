"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import DOMPurify from 'isomorphic-dompurify'
import type { ThreadDetailResponse } from '@/app/api/negotiations/threads/[id]/route'
import {
  ArrowLeft, ExternalLink, Copy, Paperclip, Sparkles, Check,
  ChevronDown, ChevronUp, Car, AlertCircle, Loader2, Lightbulb, TrendingUp, Sword, Shield, Send, FileText, Download,
} from 'lucide-react'

export function ThreadWorkspaceClient({ threadId }: { threadId: string }) {
  const [data, setData] = useState<ThreadDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [showRegenPanel, setShowRegenPanel] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/negotiations/threads/${threadId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ThreadDetailResponse
      setData(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => { load() }, [load])

  const generateDraft = useCallback(async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/negotiations/threads/${threadId}/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instructions: instructions.trim() || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      await load()
      setInstructions('')
      setShowRegenPanel(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [threadId, instructions, load])

  const copyDraft = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txt = (data?.latestDraft?.output as any)?.draft_email
    if (typeof txt === 'string') {
      navigator.clipboard.writeText(txt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [data])

  const markResponded = useCallback(async () => {
    await fetch(`/api/negotiations/threads/${threadId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'responded' }),
    })
    await load()
  }, [threadId, load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading thread…
      </div>
    )
  }
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Error: {error}</div>
  if (!data) return <div className="text-sm text-gray-500">Not found.</div>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = (data.latestDraft?.output ?? null) as any

  return (
    <div>
      {/* Header — back / subject / status / mark responded */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/negotiations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft className="w-4 h-4" /> Inbox
        </Link>
        <div className="text-gray-300">/</div>
        <h1 className="text-lg font-semibold text-gray-900 flex-1 truncate">{data.thread.subject}</h1>
        <StatusChip status={data.thread.status} />
        {data.thread.status !== 'responded' && (
          <button
            onClick={markResponded}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-gray-700 font-medium transition"
          >
            <Check className="w-3 h-3 inline mr-1" /> Mark responded
          </button>
        )}
      </div>

      {/* Compact claim context strip */}
      <ClaimStrip claim={data.claim} threadId={threadId} onLinked={load} />

      {/* Main 2-column layout */}
      <div className="grid grid-cols-12 gap-5 mt-5">
        {/* Left — message thread */}
        <div className="col-span-7">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <span>Conversation</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 normal-case font-normal">{data.messages.length} message{data.messages.length === 1 ? '' : 's'}</span>
          </div>
          <MessagesThread messages={data.messages} />
        </div>

        {/* Right — sticky draft panel */}
        <div className="col-span-5">
          <div className="sticky top-6">
            {!draft && (
              <EmptyDraftCta
                claim={data.claim}
                hasVoiceProfile={data.hasVoiceProfile}
                generating={generating}
                onGenerate={generateDraft}
                instructions={instructions}
                onInstructions={setInstructions}
              />
            )}
            {draft && (
              <DraftPanel
                draft={draft}
                version={data.latestDraft?.version ?? 1}
                createdAt={data.latestDraft?.createdAt ?? null}
                hasVoiceProfile={data.hasVoiceProfile}
                copied={copied}
                onCopy={copyDraft}
                generating={generating}
                onRegenerate={generateDraft}
                showRegenPanel={showRegenPanel}
                setShowRegenPanel={setShowRegenPanel}
                instructions={instructions}
                onInstructions={setInstructions}
              />
            )}
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Claim context strip ---------------- */

function ClaimStrip({ claim, threadId, onLinked }: { claim: ThreadDetailResponse['claim']; threadId: string; onLinked: () => void }) {
  if (!claim) {
    return <UnmatchedStrip threadId={threadId} onLinked={onLinked} />
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (claim.claim ?? {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (claim.result ?? {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notes = ((claim.reports as any)?.notesData ?? {}) as any

  const money = (n: unknown) => {
    const num = Number(n)
    return Number.isFinite(num) && num > 0
      ? `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : null
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-stretch">
        <div className="px-4 py-3 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center gap-3 border-r border-gray-200">
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-gray-200">
            <Car className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-gray-500">Linked claim</div>
            <div className="text-sm font-semibold text-gray-900">{claim.maNumber ?? claim.id}</div>
          </div>
        </div>
        <div className="flex-1 px-4 py-3 flex items-center gap-5 flex-wrap min-w-0">
          <ContextItem label="Vehicle" value={claim.vehicle ?? '—'} />
          <ContextItem label="Client" value={c.clientName ?? c.insuredName ?? '—'} />
          <ContextItem label="Adjuster" value={c.adjuster ?? '—'} sub={c.adjusterEmail ?? undefined} />
          <ContextItem label="Our ACV" value={money(r.acv) ?? '—'} tone="green" />
          <ContextItem label="OA Value" value={money(notes.appraiserValueNum) ?? '—'} tone="red" />
          {notes.agreementAmountNum > 0 && (
            <ContextItem label="Award" value={money(notes.agreementAmountNum) ?? '—'} tone="blue" />
          )}
        </div>
        <a
          href={`/claims/${claim.id}`}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-3 border-l border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium text-gray-700 transition"
        >
          Open claim <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

function ContextItem({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'blue' }) {
  const valueCls =
    tone === 'green' ? 'text-emerald-700' :
    tone === 'red'   ? 'text-red-700'     :
    tone === 'blue'  ? 'text-blue-700'    :
                       'text-gray-900'
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold tabular-nums truncate ${valueCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  )
}

function UnmatchedStrip({ threadId, onLinked }: { threadId: string; onLinked: () => void }) {
  const [q, setQ] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([])
  const [linking, setLinking] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/negotiations/search-claims?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
      const json = await res.json()
      setResults(json.results ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const link = async (claimId: string) => {
    setLinking(claimId); setErr(null)
    try {
      const res = await fetch(`/api/negotiations/threads/${threadId}/match`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claimId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onLinked()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-amber-200 shrink-0">
          <AlertCircle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-amber-900">Not linked to a claim yet</div>
          <div className="text-xs text-amber-800 mt-0.5 mb-3">
            The AI draft can&apos;t cite real ACV or comps until you link a claim. Search below.
          </div>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search MA#, VIN, claimant name…"
            className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
          />
          {err && <div className="text-xs text-red-700 mt-2">{err}</div>}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-amber-200/50 max-h-56 overflow-y-auto bg-white border border-amber-200 rounded-lg">
              {results.map(r => (
                <li key={r.id} className="p-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{r.maNumber ?? r.id} · <span className="text-gray-500 uppercase">{r.status}</span></div>
                    <div className="text-[11px] text-gray-600 truncate">{r.vehicle ?? '—'} · {r.claimantName ?? r.insuredName ?? '—'}</div>
                  </div>
                  <button
                    onClick={() => link(r.id)}
                    disabled={linking !== null}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    {linking === r.id ? 'Linking…' : 'Link'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Messages as chat bubbles ---------------- */

function MessagesThread({ messages }: { messages: ThreadDetailResponse['messages'] }) {
  // Newest first — one chronological stream, no left/right split by sender.
  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [messages],
  )
  // Latest (top) auto-expanded; everything else collapsed by default.
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sorted.length > 0 ? [sorted[0].id] : []))
  const toggle = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpanded(next)
  }
  return (
    <div className="space-y-2">
      {sorted.map(m => {
        const open = expanded.has(m.id)
        return <MessageCard key={m.id} message={m} expanded={open} onToggle={() => toggle(m.id)} />
      })}
    </div>
  )
}

function MessageCard({ message, expanded, onToggle }: { message: ThreadDetailResponse['messages'][number]; expanded: boolean; onToggle: () => void }) {
  const sender = message.fromName || message.fromAddr.split('@')[0]
  const time = new Date(message.sentAt)
  const timeLabel = time.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const snippet = (message.textBody ?? '').replace(/\s+/g, ' ').trim()

  // Card is white for both. Direction is signaled by (a) a colored left
  // border and (b) a pill label — NOT by alignment. That keeps the thread
  // chronological and the text always readable on a light background.
  const accentBorderCls = message.isOutbound ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-slate-300'
  const directionPillCls = message.isOutbound
    ? 'bg-blue-100 text-blue-800'
    : 'bg-slate-100 text-slate-700'
  const directionLabel = message.isOutbound ? 'You sent' : 'Received'

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${accentBorderCls} overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold uppercase tracking-wider ${directionPillCls}`}>
            {directionLabel}
          </span>
          <span className="text-sm font-semibold text-gray-900 truncate">{sender}</span>
          <span className="text-xs text-gray-400 truncate">&lt;{message.fromAddr}&gt;</span>
          {message.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <Paperclip className="w-3 h-3" /> {message.attachments.length}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-500 shrink-0">{timeLabel}</span>
        </div>
        {!expanded && (
          <div className="text-xs text-gray-600 line-clamp-2">
            {snippet.slice(0, 400)}
          </div>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 text-gray-800">
          {message.htmlBody
            ? (
              <div
                className="text-sm max-w-none prose prose-sm prose-gray mt-3"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.htmlBody) }}
              />
            )
            : <pre className="whitespace-pre-wrap text-sm font-sans text-gray-800 mt-3">{message.textBody}</pre>
          }
          {message.attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 text-gray-500">Attachments</div>
              <ul className="flex flex-wrap gap-1.5">
                {message.attachments.map(a => (
                  <li key={a.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                    <Paperclip className="w-3 h-3 text-gray-400" />
                    <span>{a.filename}</span>
                    <span className="text-gray-400">· {Math.round(a.sizeBytes / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- Empty draft CTA ---------------- */

function EmptyDraftCta({ claim, hasVoiceProfile, generating, onGenerate, instructions, onInstructions }: {
  claim: ThreadDetailResponse['claim']
  hasVoiceProfile: boolean
  generating: boolean
  onGenerate: () => void
  instructions: string
  onInstructions: (v: string) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-purple-50 via-white to-blue-50 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Draft a response</div>
            <div className="text-xs text-gray-500">
              {hasVoiceProfile ? 'Uses your trained voice profile.' : (
                <>No voice profile trained yet — <Link href="/negotiations/voice" className="text-purple-700 hover:underline">train it first</Link> for a much better draft.</>
              )}
            </div>
          </div>
        </div>

        {!claim && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3 text-xs text-amber-900">
            <div className="font-semibold mb-0.5">Link a claim first</div>
            The AI can&apos;t cite ACV / comps / adjuster info without a linked claim.
          </div>
        )}

        <label className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          Optional instructions
        </label>
        <textarea
          value={instructions}
          onChange={e => onInstructions(e.target.value)}
          placeholder="e.g. push back hard on the mileage adjustment, concede on tax if they agree by Friday…"
          className="w-full h-20 text-sm p-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
        />

        <button
          onClick={onGenerate}
          disabled={generating || !claim}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-600 text-white text-sm font-semibold shadow-sm hover:bg-purple-700 disabled:opacity-50 transition"
        >
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating draft…</>
            : <><Sparkles className="w-4 h-4" /> Generate draft</>}
        </button>
        <div className="text-[10px] text-gray-500 text-center mt-2">
          30–90 seconds. Reads the thread, claim data{hasVoiceProfile ? ', and your voice profile' : ''}.
        </div>
      </div>
    </div>
  )
}

/* ---------------- Draft panel ---------------- */

function DraftPanel({ draft, version, createdAt, hasVoiceProfile, copied, onCopy, generating, onRegenerate, showRegenPanel, setShowRegenPanel, instructions, onInstructions }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: any
  version: number
  createdAt: string | null
  hasVoiceProfile: boolean
  copied: boolean
  onCopy: () => void
  generating: boolean
  onRegenerate: () => void
  showRegenPanel: boolean
  setShowRegenPanel: (v: boolean) => void
  instructions: string
  onInstructions: (v: string) => void
}) {
  const confidence = draft.confidence as 'low' | 'medium' | 'high' | undefined
  const missing: string[] = Array.isArray(draft.missing_info) ? draft.missing_info : []

  const [tab, setTab] = useState<'email' | 'analysis'>('email')

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            Draft response
            {confidence && <ConfidenceBadge value={confidence} />}
          </div>
          <div className="text-[11px] text-gray-500">
            v{version}{createdAt && ` · ${new Date(createdAt).toLocaleString()}`}
            {!hasVoiceProfile && <> · <Link href="/negotiations/voice" className="text-purple-700 hover:underline">train voice for better drafts</Link></>}
          </div>
        </div>
      </div>

      {/* Negotiation state banner — surfaces the AI's read of what's going
          on so Henry can catch misreads (e.g. "acceptance" mis-classified as
          "stalling") without opening the Analysis tab. */}
      {draft.negotiation_state && (
        <NegotiationStateBanner state={draft.negotiation_state} reasoning={draft.state_reasoning} />
      )}

      {/* Award auto-generated when state = oa_accepted_our_offer. Filed into
          the claim's Documents tab too — this button is the immediate one-click. */}
      {draft.award_document_path && (
        <AwardDownloadBanner path={draft.award_document_path} name={draft.award_document_name ?? 'award.pdf'} amount={draft.agreed_amount ?? null} />
      )}

      {/* Tabs: Email · Analysis */}
      <div className="flex px-4 pt-3 gap-1 border-b border-gray-100">
        <TabButton active={tab === 'email'}    onClick={() => setTab('email')}    icon={<Send className="w-3 h-3" />}>Email</TabButton>
        <TabButton active={tab === 'analysis'} onClick={() => setTab('analysis')} icon={<Lightbulb className="w-3 h-3" />}>Analysis</TabButton>
      </div>

      {tab === 'email' && (
        <div className="p-4">
          <textarea
            readOnly
            value={draft.draft_email ?? ''}
            className="w-full h-80 text-sm p-3 font-mono border border-gray-200 rounded-lg bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition"
            >
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy to clipboard</>}
            </button>
            <button
              onClick={() => setShowRegenPanel(!showRegenPanel)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition"
            >
              Regenerate {showRegenPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <div className="p-4 space-y-3">
          <AnalysisSection icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-600" />} title="Vehicle value" body={draft.vehicle_value} />
          <AnalysisSection icon={<Lightbulb className="w-3.5 h-3.5 text-purple-600" />} title="Recommended tactic" body={draft.tactic} accent="purple" />
          <AnalysisSection icon={<Sword className="w-3.5 h-3.5 text-red-600" />} title="OA report breakdown" body={draft.oa_report_breakdown} />
          <AnalysisSection icon={<Shield className="w-3.5 h-3.5 text-blue-600" />} title="Defense of our comps" body={draft.our_comps_defense} />
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-800">Missing info</div>
              </div>
              <ul className="text-xs text-amber-900 space-y-1">
                {missing.map((m, i) => <li key={i} className="flex gap-1.5"><span>·</span><span>{m}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Regenerate panel — slides open under either tab */}
      {showRegenPanel && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50">
          <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1 mt-3">
            What should change?
          </label>
          <textarea
            value={instructions}
            onChange={e => onInstructions(e.target.value)}
            placeholder="e.g. more concise, push harder on mileage, offer to split the tax difference"
            className="w-full h-16 text-xs p-2 border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
          />
          <button
            onClick={onRegenerate}
            disabled={generating}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
          >
            {generating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating…</>
              : <><Sparkles className="w-3.5 h-3.5" /> Regenerate</>}
          </button>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition ${
        active ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      {icon}{children}
    </button>
  )
}

function AnalysisSection({ icon, title, body, accent }: { icon: React.ReactNode; title: string; body: unknown; accent?: 'purple' }) {
  const bodyText = useMemo(() => {
    if (!body) return null
    return typeof body === 'string' ? body : JSON.stringify(body, null, 2)
  }, [body])
  if (!bodyText) return null
  const bg = accent === 'purple' ? 'bg-purple-50/50 border-purple-200' : 'bg-gray-50 border-gray-200'
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-700">{title}</div>
      </div>
      <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyText}</div>
    </div>
  )
}

function AwardDownloadBanner({ path, name, amount }: { path: string; name: string; amount: number | null }) {
  const [downloading, setDownloading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const download = useCallback(async () => {
    setDownloading(true); setErr(null)
    try {
      const res = await fetch('/api/negotiations/download-award', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, name }),
      })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? `HTTP ${res.status}`)
      window.open(json.url, '_blank', 'noopener')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }, [path, name])
  const money = amount ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : null
  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm border border-emerald-200 shrink-0">
          <FileText className="w-4 h-4 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-900">Award ready to download</div>
          <div className="text-[11px] text-emerald-800 truncate">
            Filed into the claim&apos;s Documents{money ? ` · ${money}` : ''}
          </div>
        </div>
        <button
          onClick={download}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download
        </button>
      </div>
      {err && <div className="text-xs text-red-700 mt-2">{err}</div>}
    </div>
  )
}

function NegotiationStateBanner({ state, reasoning }: { state: string; reasoning?: string }) {
  const map: Record<string, { label: string; cls: string; hint: string }> = {
    oa_accepted_our_offer: { label: 'OA accepted our offer',        cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', hint: 'Send award to finalize' },
    oa_counter_offered:    { label: 'OA counter-offered',            cls: 'bg-amber-50   border-amber-200   text-amber-900',   hint: 'Engage on the counter' },
    oa_argued_no_number:   { label: 'OA arguing — no counter yet',   cls: 'bg-orange-50  border-orange-200  text-orange-900',  hint: 'Demand a number' },
    oa_stalling:           { label: 'OA stalling',                   cls: 'bg-slate-50   border-slate-200   text-slate-900',   hint: 'Firm nudge with deadline' },
    awaiting_oa_report:    { label: 'Waiting on OA report',          cls: 'bg-slate-50   border-slate-200   text-slate-900',   hint: 'Chase the report' },
    opening_move:          { label: 'Opening move',                  cls: 'bg-blue-50    border-blue-200    text-blue-900',    hint: 'State our position' },
    other:                 { label: 'Uncategorized',                 cls: 'bg-slate-50   border-slate-200   text-slate-900',   hint: '' },
  }
  const s = map[state] ?? map.other
  return (
    <div className={`px-4 py-2.5 border-b text-[11px] ${s.cls}`}>
      <div className="flex items-center gap-2">
        <span className="uppercase tracking-wider font-bold">{s.label}</span>
        {s.hint && <span className="opacity-70">· {s.hint}</span>}
      </div>
      {reasoning && <div className="mt-1 opacity-80 leading-relaxed">{reasoning}</div>}
    </div>
  )
}

function ConfidenceBadge({ value }: { value: 'low' | 'medium' | 'high' }) {
  const map = {
    high:   { label: 'high confidence',   cls: 'bg-emerald-100 text-emerald-700' },
    medium: { label: 'medium confidence', cls: 'bg-amber-100   text-amber-700' },
    low:    { label: 'low confidence',    cls: 'bg-red-100     text-red-700' },
  } as const
  const s = map[value]
  return <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    needs_response: 'bg-red-100 text-red-800',
    responded:      'bg-emerald-100 text-emerald-800',
    unmatched:      'bg-amber-100 text-amber-800',
    spam:           'bg-slate-100 text-slate-500',
    ignored:        'bg-slate-100 text-slate-500',
  }
  const label: Record<string, string> = {
    needs_response: 'Needs reply',
    responded:      'Responded',
    unmatched:      'Unmatched',
    spam:           'Spam',
    ignored:        'Ignored',
  }
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${map[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {label[status] ?? status}
    </span>
  )
}
