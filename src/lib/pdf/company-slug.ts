import { createServiceClient } from '@/lib/supabase/service'

const cache = new Map<string, string>()

/**
 * Returns the company's slug for the given company_id. Cached per-lambda.
 * Falls back to 'modern-appraisers' when the companies table doesn't exist
 * yet (pre-Phase-1 migration) or the id doesn't resolve — this keeps report
 * generation working during transitional windows.
 */
export async function getCompanySlug(companyId: string | null | undefined): Promise<string> {
  if (!companyId) return 'modern-appraisers'
  const hit = cache.get(companyId)
  if (hit) return hit
  const svc = createServiceClient()
  const { data, error } = await svc.from('companies').select('slug').eq('id', companyId).maybeSingle()
  if (error || !data) return 'modern-appraisers'
  const slug = (data as { slug: string }).slug
  cache.set(companyId, slug)
  return slug
}
