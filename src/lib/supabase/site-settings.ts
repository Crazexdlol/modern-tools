import { createClient as createBrowserClient } from './client'

export type SiteSettingsKey = 'allow_regular_create_claims'

export async function fetchSiteSetting<T>(key: SiteSettingsKey): Promise<T | null> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    console.error('fetchSiteSetting failed:', error)
    return null
  }
  return data ? (data.value as T) : null
}
