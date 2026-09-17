import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whitelist of tables that MUST be filtered by company_id. Adding a new
 * claim-scoped table to the schema requires adding it here — otherwise
 * scopedClient falls through to raw access (which is caught in tests + lint).
 */
export const CLAIM_SCOPED_TABLES = [
  'acv_history',
  'messages',
  'message_reads',
  'user_claim_views',
  'estimate_history',
  'clients',
  'client_contacts',
  'client_marketing_log',
  'insurance_guidelines',
] as const

export type ClaimScopedTable = typeof CLAIM_SCOPED_TABLES[number]

function stampCompanyId<T extends Record<string, unknown>>(payload: T | T[], companyId: string): T | T[] {
  if (Array.isArray(payload)) {
    return payload.map(row => ({ ...row, company_id: companyId }))
  }
  return { ...payload, company_id: companyId }
}

function wrapChain(chain: unknown, companyId: string): unknown {
  return new Proxy(chain as object, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function') return orig

      if (prop === 'insert') {
        return (payload: Record<string, unknown> | Record<string, unknown>[], ...rest: unknown[]) => {
          const stamped = stampCompanyId(payload, companyId)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          const result = (orig as Function).call(target, stamped, ...rest)
          return wrapChain(result, companyId)
        }
      }

      if (prop === 'select' || prop === 'update' || prop === 'delete') {
        return (...args: unknown[]) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          const next = (orig as Function).apply(target, args)
          if (next && typeof (next as { eq?: unknown }).eq === 'function') {
            return wrapChain((next as { eq: (col: string, val: unknown) => unknown }).eq('company_id', companyId), companyId)
          }
          return wrapChain(next, companyId)
        }
      }

      return (...args: unknown[]) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const next = (orig as Function).apply(target, args)
        return next && typeof next === 'object' ? wrapChain(next, companyId) : next
      }
    },
  })
}

/**
 * Wraps a Supabase client so every query against a CLAIM_SCOPED_TABLES table
 * is auto-filtered by company_id (SELECT/UPDATE/DELETE) or stamps company_id
 * on the payload (INSERT). Non-whitelisted tables fall through unchanged.
 *
 * Body-supplied company_id on INSERT is always overridden with the session's
 * companyId — clients cannot forge a company via request bodies.
 */
export function scopedClient(base: SupabaseClient, companyId: string): SupabaseClient {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain = (target.from as any)(table)
          if ((CLAIM_SCOPED_TABLES as readonly string[]).includes(table)) {
            return wrapChain(chain, companyId) as ReturnType<SupabaseClient['from']>
          }
          return chain
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as SupabaseClient
}
