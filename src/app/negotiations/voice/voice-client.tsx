"use client"

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { VoiceProfile } from '@/lib/negotiations/voice'
import { Sparkles, RefreshCw, ArrowLeft, Mail, Download, Loader2, Check } from 'lucide-react'

interface CorpusStats {
  sentCount: number
  oldestSentAt: string | null
  newestSentAt: string | null
}

interface BackfillReport {
  syncedAt: string
  daysBack: number
  newMessages: number
  scannedMessages: number
  errors: string[]
  configMissing?: string[]
}

const RANGES = [
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
  { days: 730, label: '2 years' },
  { days: 1825, label: '5 years' },
]

export function VoiceProfileClient() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [trainError, setTrainError] = useState<string | null>(null)

  const [corpus, setCorpus] = useState<CorpusStats | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillReport, setBackfillReport] = useState<BackfillReport | null>(null)
  const [backfillError, setBackfillError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState(365)

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/negotiations/voice', { cache: 'no-store' })
      const json = await res.json() as { profile: VoiceProfile | null }
      setProfile(json.profile)
    } finally { setLoading(false) }
  }, [])

  const loadCorpus = useCallback(async () => {
    try {
      const res = await fetch('/api/negotiations/voice/backfill', { cache: 'no-store' })
      const json = await res.json() as CorpusStats
      setCorpus(json)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    loadProfile()
    loadCorpus()
  }, [loadProfile, loadCorpus])

  const train = useCallback(async () => {
    setTraining(true); setTrainError(null)
    try {
      const res = await fetch('/api/negotiations/voice', { method: 'POST' })
      const json = await res.json() as { ok: boolean; profile?: VoiceProfile; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Failed to train')
      setProfile(json.profile ?? null)
    } catch (e) {
      setTrainError((e as Error).message)
    } finally { setTraining(false) }
  }, [])

  const backfill = useCallback(async (daysBack: number) => {
    setBackfilling(true); setBackfillError(null); setBackfillReport(null)
    try {
      const res = await fetch('/api/negotiations/voice/backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ daysBack }),
      })
      const json = await res.json() as { ok: boolean } & BackfillReport & { error?: string }
      if (!json.ok && !json.newMessages) throw new Error(json.error ?? json.errors?.join(' · ') ?? 'Backfill failed')
      setBackfillReport(json)
      await loadCorpus()
    } catch (e) {
      setBackfillError((e as Error).message)
    } finally { setBackfilling(false) }
  }, [loadCorpus])

  const corpusRange = corpus && corpus.oldestSentAt && corpus.newestSentAt
    ? `${new Date(corpus.oldestSentAt).toLocaleDateString()} → ${new Date(corpus.newestSentAt).toLocaleDateString()}`
    : '—'

  return (
    <div>
      <div className="mb-4">
        <Link href="/negotiations" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>
      </div>

      {/* Corpus card — how much sent history the trainer can see */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-semibold text-gray-900">Sent-email corpus</div>
              <div className="text-xs text-gray-400">what the trainer reads</div>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              <span className="font-semibold text-gray-900 tabular-nums">{corpus?.sentCount?.toLocaleString() ?? '…'}</span> emails from you in HamsPortal · {corpusRange}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              The trainer uses your most recent 200 sent emails. Pull more history if you want the profile to reflect a wider style / more negotiation tactics.
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={() => setSelectedDays(r.days)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                    selectedDays === r.days
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  Last {r.label}
                </button>
              ))}
              <button
                onClick={() => backfill(selectedDays)}
                disabled={backfilling}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {backfilling
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pulling…</>
                  : <><Download className="w-3.5 h-3.5" /> Pull sent history</>}
              </button>
            </div>

            {backfillReport && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                Added {backfillReport.newMessages.toLocaleString()} new sent emails (scanned {backfillReport.scannedMessages.toLocaleString()}). Retrain to use them.
              </div>
            )}
            {backfillError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {backfillError}
              </div>
            )}
            {backfillReport?.configMissing && backfillReport.configMissing.length > 0 && (
              <div className="mt-2 text-xs text-amber-800">
                Mailbox env vars missing: {backfillReport.configMissing.join(', ')}.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Train card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {profile ? 'Voice profile trained' : 'No voice profile yet'}
            </div>
            {profile ? (
              <div className="text-xs text-gray-500 mt-0.5">
                Built {new Date(profile.builtAt).toLocaleString()} from {profile.builtFrom.messageCount} sent emails
                {profile.builtFrom.newest && ` (${new Date(profile.builtFrom.oldest ?? profile.builtFrom.newest).toLocaleDateString()} → ${new Date(profile.builtFrom.newest).toLocaleDateString()})`}.
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-0.5">Train once to give the AI your voice + tactics.</div>
            )}
          </div>
          <button
            onClick={train}
            disabled={training || (corpus?.sentCount ?? 0) === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold shadow-sm hover:bg-purple-700 disabled:opacity-60"
          >
            {training
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Training…</>
              : <><Sparkles className="w-4 h-4" /> {profile ? 'Retrain' : 'Train profile'}</>}
          </button>
        </div>
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {trainError && <div className="text-sm text-red-700">{trainError}</div>}
      </div>

      {profile && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Tone">{profile.tone_summary}</Card>
          <Card title="Concessions">{profile.concessions_style}</Card>
          <ListCard title="Opening patterns" items={profile.opening_patterns} />
          <ListCard title="Closing patterns" items={profile.closing_patterns} />
          <ListCard title="Negotiation moves" items={profile.negotiation_moves} />
          <ListCard title="Escalation" items={profile.escalation_patterns} />
          <ListCard title="Common phrases" items={profile.common_phrases} />
          <ListCard title="Style DOs" items={profile.style_dos} />
          <ListCard title="Style DON'Ts" items={profile.style_donts} />
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">{title}</div>
      <div className="text-sm text-gray-800 whitespace-pre-wrap">{children}</div>
    </div>
  )
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">{title}</div>
      {items.length === 0 ? <div className="text-xs text-gray-400">—</div> : (
        <ul className="text-sm text-gray-800 space-y-1">
          {items.map((s, i) => <li key={i} className="border-l-2 border-gray-200 pl-2">{s}</li>)}
        </ul>
      )}
    </div>
  )
}
