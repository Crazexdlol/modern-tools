import { createServiceClient } from './service'

// Resolves the configured Rough Numbers inbox owner profile id, or null
// if unset. Service-client only; the /submit route (server-side) calls
// this when branching to the rough-numbers path.
//
// Reads from the site_settings key/value table under key
// `rough_numbers_inbox_owner_id`. If per-company inbox owners become a
// requirement later, switch this to a per-company lookup — current scope
// is single-company so a global key is sufficient.
export async function getRoughNumbersInboxOwner(): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'rough_numbers_inbox_owner_id')
    .maybeSingle()
  const v = data?.value
  if (typeof v === 'string' && v.length > 0) return v
  // Accept both the plain-string shape and an { id: "<uuid>" } shape, in
  // case the admin UI stores it either way.
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id
  }
  return null
}

// Writes the inbox owner id. Called from the admin settings UI via a
// server action. Pass null to clear the setting.
export async function setRoughNumbersInboxOwner(profileId: string | null): Promise<void> {
  const service = createServiceClient()
  // Upsert: insert if missing, update if present. Matches the pattern used
  // by other site_settings keys like completion_notification_admin_id.
  await service
    .from('site_settings')
    .upsert({ key: 'rough_numbers_inbox_owner_id', value: profileId }, { onConflict: 'key' })
}
