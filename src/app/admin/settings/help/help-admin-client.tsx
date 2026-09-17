"use client"

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2, Pencil, Plus, X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import {
  archiveHelpArticle,
  fetchHelpArticles,
  insertHelpArticle,
  updateHelpArticle,
  type HelpArticle,
} from '@/lib/supabase/help-articles'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

export function HelpAdminClient() {
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationHint, setMigrationHint] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [draftQ, setDraftQ] = useState('')
  const [draftA, setDraftA] = useState('')
  const [draftTags, setDraftTags] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserClient()
    const probe = await supabase.from('help_articles').select('id').limit(1)
    if (probe.error && (probe.error.code === '42P01' || probe.error.message.includes('does not exist'))) {
      setMigrationHint(true)
      setArticles([])
    } else {
      setMigrationHint(false)
      setArticles(await fetchHelpArticles(supabase))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const resetDraft = () => {
    setDraftQ('')
    setDraftA('')
    setDraftTags('')
  }

  const startEdit = (a: HelpArticle) => {
    setEditingId(a.id)
    setShowNew(false)
    setDraftQ(a.question)
    setDraftA(a.answer)
    setDraftTags(a.tags.join(', '))
  }

  const startNew = () => {
    setShowNew(true)
    setEditingId(null)
    resetDraft()
  }

  const cancel = () => {
    setEditingId(null)
    setShowNew(false)
    resetDraft()
  }

  const parseTags = (raw: string): string[] => {
    return raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  }

  const save = async () => {
    if (!draftQ.trim() || !draftA.trim()) return
    setBusy(true)
    const tags = parseTags(draftTags)
    if (editingId) {
      await updateHelpArticle(editingId, { question: draftQ.trim(), answer: draftA.trim(), tags })
    } else {
      await insertHelpArticle({ question: draftQ.trim(), answer: draftA.trim(), tags })
    }
    setBusy(false)
    cancel()
    await load()
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    await archiveHelpArticle(pendingDeleteId)
    setPendingDeleteId(null)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  const showEditor = showNew || editingId !== null

  return (
    <div className="space-y-6">
      {migrationHint && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <div className="font-semibold mb-1">Migration required</div>
          <div>
            The <code>help_articles</code> table doesn&apos;t exist yet. Run{' '}
            <code>supabase/migration-help-articles.sql</code> in the Supabase SQL Editor
            to enable this feature. The <code>/help</code> page will still work
            (AI-only) until then.
          </div>
        </div>
      )}

      {!showEditor && (
        <div className="flex justify-end">
          <Button
            onClick={startNew}
            disabled={migrationHint}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
          >
            <Plus className="w-4 h-4" /> New article
          </Button>
        </div>
      )}

      {showEditor && (
        <div className="bg-white border border-blue-200 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">
              {editingId ? 'Edit article' : 'New article'}
            </h2>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Question</label>
            <input
              className="mt-1 w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="How do I reassign a claim?"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Answer</label>
            <textarea
              className="mt-1 w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm h-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Inside the claim, use the reassign dropdown next to the assignee name. Admins can reassign anyone; non-admins need the can_reassign_claims grant."
              value={draftA}
              onChange={(e) => setDraftA(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Tags (comma-separated)</label>
            <input
              className="mt-1 w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="assignment, permissions"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={save}
              disabled={!draftQ.trim() || !draftA.trim() || busy}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Save changes' : 'Add article'}
            </Button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Question</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Updated</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center px-4 py-10 text-gray-400 text-sm">
                  {migrationHint ? 'Run the migration to start adding articles.' : 'No articles yet. Add one above.'}
                </td>
              </tr>
            ) : (
              articles.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{a.question}</div>
                    <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{a.answer}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {a.tags.length === 0 ? <span className="text-gray-400 text-xs">—</span> : a.tags.map((t) => (
                        <span key={t} className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(a.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(a)} className="text-gray-400 hover:text-blue-600" aria-label="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setPendingDeleteId(a.id)} className="text-gray-300 hover:text-red-500" aria-label="Archive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Archive this article?"
        message="It will no longer appear in /help search or be used as AI context. You can un-archive via SQL if needed."
        confirmLabel="Archive"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}
