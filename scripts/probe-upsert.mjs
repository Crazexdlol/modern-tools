import { createClient } from '@supabase/supabase-js';
const url = 'https://ettcryqxvwmqidwczrzd.supabase.co';
const key = process.env.COMPS_DB_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const testUrl = 'https://modern-tools-mirror-test.invalid/' + Date.now();
const row = {
  listing_url: testUrl,
  source: 'mirror_test',
  data_provider: 'scrape',
  vin: 'TESTVIN1234567890',
  year: 2020,
  make: 'TestMake',
  model: 'TestModel',
  price: 10000,
  mileage: 50000,
  date_first_scraped: new Date().toISOString(),
  date_last_seen: new Date().toISOString(),
  is_active: true,
  miss_count: 0,
};

console.log('Attempt 1: insert');
const { data: ins, error: e1 } = await sb.from('listings').insert(row).select('id, listing_url').single();
console.log('  →', e1 ? `ERROR: ${e1.code} ${e1.message}` : `OK id=${ins.id}`);

console.log('Attempt 2: upsert same URL with onConflict=listing_url');
const row2 = { ...row, price: 11000 };
const { data: up, error: e2 } = await sb
  .from('listings')
  .upsert(row2, { onConflict: 'listing_url' })
  .select('id, listing_url, price')
  .single();
console.log('  →', e2 ? `ERROR: ${e2.code} ${e2.message}` : `OK id=${up.id} price=${up.price}`);

console.log('\nCleanup: deleting test row');
const { error: eDel } = await sb.from('listings').delete().eq('listing_url', testUrl);
console.log('  →', eDel ? `ERROR: ${eDel.message}` : 'OK');
