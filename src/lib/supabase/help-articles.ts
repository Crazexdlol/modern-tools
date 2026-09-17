// Help articles — curated Q&A pairs shown on /help. Admins edit at
// /admin/settings/help. Any read tolerates 42P01 (table missing) so the
// feature degrades to "AI only" if the migration hasn't been applied.

import { createClient as createBrowserClient } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HelpArticle {
  id: string
  question: string
  answer: string
  tags: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface Row {
  id: string
  question: string
  answer: string
  tags: string[]
  created_by: string | null
  created_at: string
  updated_at: string
  archived: boolean
}

function rowToArticle(r: Row): HelpArticle {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    tags: r.tags ?? [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived,
  }
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '42P01' || (typeof e?.message === 'string' && e.message.includes('does not exist'))
}

export async function fetchHelpArticles(client?: SupabaseClient): Promise<HelpArticle[]> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase
    .from('help_articles')
    .select('*')
    .eq('archived', false)
    .order('updated_at', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    console.error('fetchHelpArticles failed:', error)
    return []
  }
  return (data as Row[]).map(rowToArticle)
}

export async function insertHelpArticle(
  input: { question: string; answer: string; tags: string[] },
  client?: SupabaseClient,
): Promise<HelpArticle | null> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase
    .from('help_articles')
    .insert({ question: input.question, answer: input.answer, tags: input.tags })
    .select('*')
    .maybeSingle()
  if (error) { console.error('insertHelpArticle failed:', error); return null }
  return data ? rowToArticle(data as Row) : null
}

export async function updateHelpArticle(
  id: string,
  patch: { question?: string; answer?: string; tags?: string[] },
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createBrowserClient()
  const { error } = await supabase
    .from('help_articles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('updateHelpArticle failed:', error); return false }
  return true
}

export async function archiveHelpArticle(id: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = client ?? createBrowserClient()
  const { error } = await supabase
    .from('help_articles')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('archiveHelpArticle failed:', error); return false }
  return true
}
