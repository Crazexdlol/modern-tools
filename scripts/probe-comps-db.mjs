import { createClient } from '@supabase/supabase-js';

const url = 'https://ettcryqxvwmqidwczrzd.supabase.co';
const key = process.env.COMPS_DB_SERVICE_KEY;
if (!key) throw new Error('COMPS_DB_SERVICE_KEY not set');

const sb = createClient(url, key, { auth: { persistSession: false } });

// First: list ALL tables in public schema via the Supabase REST API's root endpoint
console.log('--- Listing all tables via REST root ---');
const resp = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const json = await resp.json();
if (json.definitions) {
  const tables = Object.keys(json.definitions);
  console.log(`Found ${tables.length} tables in public schema:`);
  for (const t of tables) console.log('  -', t);
  console.log('\n--- Columns per table ---');
  for (const t of tables) {
    const def = json.definitions[t];
    const cols = Object.keys(def.properties || {});
    console.log(`\n${t}:`);
    for (const c of cols) {
      const prop = def.properties[c];
      console.log(`  ${c}: ${prop.format || prop.type}${def.required?.includes(c) ? ' NOT NULL' : ''}`);
    }
  }
} else {
  console.log('No definitions in response. Full response:');
  console.log(JSON.stringify(json, null, 2).slice(0, 2000));
}
