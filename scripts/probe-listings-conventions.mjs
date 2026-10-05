import { createClient } from '@supabase/supabase-js';
const url = 'https://ettcryqxvwmqidwczrzd.supabase.co';
const key = process.env.COMPS_DB_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const { count } = await sb.from('listings').select('*', { count: 'exact', head: true });
console.log('listings row count:', count);

const { data: sources } = await sb.from('listings').select('source').limit(500);
const { data: providers } = await sb.from('listings').select('data_provider').limit(500);
const { data: sample } = await sb.from('listings').select('listing_url, source, data_provider, provider_listing_id').limit(10);

console.log('\nDistinct source values:', [...new Set((sources ?? []).map(r => r.source))]);
console.log('Distinct data_provider values:', [...new Set((providers ?? []).map(r => r.data_provider))]);
console.log('\nSample rows:');
for (const r of sample ?? []) console.log(' ', JSON.stringify(r));

// Also check if listing_url has a unique constraint by trying to look at indexes via information_schema is not accessible without RPC.
// Instead try an insert collision test later. For now just report row count.

const { count: ph } = await sb.from('price_history').select('*', { count: 'exact', head: true });
console.log('\nprice_history row count:', ph);
