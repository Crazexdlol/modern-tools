// State sales tax rules — one row per US state indicating which components
// are taxable in that state per the "Sales Tax Application by State" data.
// Auto-applied to every Estimate Review to flag over-taxed components.

import { createClient as createBrowserClient } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TaxRule = 'none' | 'all' | 'parts_materials' | 'parts_only' | 'parts_materials_refinish'

export const TAX_RULE_LABELS: Record<TaxRule, string> = {
  none:                     'No sales tax',
  all:                      'Labor, parts, materials, sublet all taxable',
  parts_materials:          'Parts & materials only',
  parts_only:               'Parts only',
  parts_materials_refinish: 'Parts, materials, refinish labor only',
}

export interface StateTaxRule {
  state: string
  rule: TaxRule
  notes: string | null
  updatedAt: string
}

interface Row {
  state: string
  rule: TaxRule
  notes: string | null
  updated_at: string
}

function rowToRule(r: Row): StateTaxRule {
  return { state: r.state, rule: r.rule, notes: r.notes, updatedAt: r.updated_at }
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '42P01' || (typeof e?.message === 'string' && e.message.includes('does not exist'))
}

export async function fetchStateTaxRules(client?: SupabaseClient): Promise<StateTaxRule[]> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase
    .from('state_tax_rules')
    .select('*')
    .order('state', { ascending: true })
  if (error) {
    if (isMissingTable(error)) return []
    console.error('fetchStateTaxRules failed:', error)
    return []
  }
  return (data as Row[]).map(rowToRule)
}

export async function fetchStateTaxRule(
  state: string,
  client?: SupabaseClient,
): Promise<StateTaxRule | null> {
  if (!state) return null
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase
    .from('state_tax_rules')
    .select('*')
    .eq('state', state.toUpperCase())
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    console.error('fetchStateTaxRule failed:', error)
    return null
  }
  return data ? rowToRule(data as Row) : null
}

export async function upsertStateTaxRule(
  state: string,
  rule: TaxRule,
  notes: string | null,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createBrowserClient()
  const { error } = await supabase
    .from('state_tax_rules')
    .upsert({ state: state.toUpperCase(), rule, notes, updated_at: new Date().toISOString() }, { onConflict: 'state' })
  if (error) { console.error('upsertStateTaxRule failed:', error); return false }
  return true
}

// Determine whether a category is taxable in this state per the rule.
// Categories mirror how the estimate review prompt extracts them.
export type TaxableCategory = 'parts' | 'materials' | 'refinish_labor' | 'body_labor' | 'mechanical_labor' | 'frame_labor' | 'structural_labor' | 'other_labor' | 'sublet'

export function isTaxableUnderRule(category: TaxableCategory, rule: TaxRule): boolean {
  if (rule === 'none') return false
  if (rule === 'all') return true
  if (rule === 'parts_only') return category === 'parts'
  if (rule === 'parts_materials') return category === 'parts' || category === 'materials'
  if (rule === 'parts_materials_refinish') return category === 'parts' || category === 'materials' || category === 'refinish_labor'
  return false
}
