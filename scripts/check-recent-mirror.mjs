import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://ettcryqxvwmqidwczrzd.supabase.co', process.env.COMPS_DB_SERVICE_KEY, { auth: { persistSession: false } });

const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();

// Look specifically for Auto.dev rows: they're the ones where prior_accident is NOT null (MC always leaves it null)
const { data: adRows } = await sb
  .from('listings')
  .select('id, source, year, make, model, vin, price, zip, date_listed, prior_accident, prior_owner_count')
  .gte('date_last_seen', since)
  .not('prior_accident', 'is', null)
  .order('id', { ascending: false })
  .limit(10);

console.log(`\n--- Auto.dev rows (prior_accident NOT null) in last 3 min: ${adRows?.length ?? 0} ---`);
for (const r of adRows ?? []) {
  console.log(`  [${r.id}] ${r.year} ${r.make} ${r.model} ${r.vin?.slice(-6) ?? '-'} $${r.price ?? '-'}`);
  console.log(`       zip=${r.zip ?? '-'} date_listed=${r.date_listed ?? '-'} prior_accident=${r.prior_accident} prior_owner_count=${r.prior_owner_count ?? '-'}`);
  console.log(`       src=${r.source}`);
}

// Count fill rates by implicit source (MC = prior_accident null, AD = prior_accident not null)
const { data: all } = await sb
  .from('listings')
  .select('zip, date_listed, prior_accident, prior_owner_count')
  .gte('date_last_seen', since)
  .limit(1000);

const total = all?.length ?? 0;
const likelyAd = (all ?? []).filter(r => r.prior_accident !== null);
const likelyMc = (all ?? []).filter(r => r.prior_accident === null);
console.log(`\n--- Fill rates (across ${total} fresh rows) ---`);
console.log(`  By implicit source: ~${likelyMc.length} MC + ~${likelyAd.length} AD`);
console.log(`  zip populated:                ${(all ?? []).filter(r => r.zip).length}/${total}`);
console.log(`  date_listed populated:        ${(all ?? []).filter(r => r.date_listed).length}/${total}`);
console.log(`  prior_accident populated:     ${(all ?? []).filter(r => r.prior_accident !== null).length}/${total}  (expect = AD count)`);
console.log(`  prior_owner_count populated:  ${(all ?? []).filter(r => r.prior_owner_count !== null).length}/${total}`);
