import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://ettcryqxvwmqidwczrzd.supabase.co', process.env.COMPS_DB_SERVICE_KEY, { auth: { persistSession: false } });

const { count: total } = await sb.from('dealers').select('*', { count: 'exact', head: true });
console.log(`Total dealers: ${total}`);

// Fetch all dealers in chunks of 1000
async function fetchAll(table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 60000; offset += pageSize) {
    const { data, error } = await sb.from(table).select(select).range(offset, offset + pageSize - 1);
    if (error) { console.error('fetch err:', error.message); break; }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

const all = await fetchAll('dealers', 'status, platform, state, franchise, last_crawled_at, last_vin_count, cadence_hours, blocked_until');
console.log(`Fetched ${all.length} dealer rows`);

// Status distribution
const byStatus = new Map();
for (const d of all) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
console.log('\n--- Status distribution ---');
for (const [s, c] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${c}`);

// Platform distribution
const byPlat = new Map();
for (const d of all) byPlat.set(d.platform ?? '(null)', (byPlat.get(d.platform ?? '(null)') ?? 0) + 1);
console.log('\n--- Platform distribution (top 15) ---');
for (const [p, c] of [...byPlat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${p}: ${c}`);

// State distribution
const byState = new Map();
for (const d of all) byState.set(d.state ?? '(null)', (byState.get(d.state ?? '(null)') ?? 0) + 1);
console.log('\n--- State distribution (top 15) ---');
for (const [s, c] of [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${s}: ${c}`);

// Franchise distribution
const byFran = new Map();
for (const d of all) byFran.set(String(d.franchise), (byFran.get(String(d.franchise)) ?? 0) + 1);
console.log('\n--- Franchise distribution ---');
for (const [f, c] of byFran.entries()) console.log(`  franchise=${f}: ${c}`);

// Crawl activity
const crawledEver = all.filter(d => d.last_crawled_at).length;
const now = Date.now();
const crawled24h = all.filter(d => d.last_crawled_at && (now - new Date(d.last_crawled_at).getTime()) < 24 * 3600000).length;
const crawled7d = all.filter(d => d.last_crawled_at && (now - new Date(d.last_crawled_at).getTime()) < 7 * 24 * 3600000).length;
const crawled30d = all.filter(d => d.last_crawled_at && (now - new Date(d.last_crawled_at).getTime()) < 30 * 24 * 3600000).length;
console.log('\n--- Crawl activity ---');
console.log(`  Ever crawled:     ${crawledEver}`);
console.log(`  Last 24h:         ${crawled24h}`);
console.log(`  Last 7d:          ${crawled7d}`);
console.log(`  Last 30d:         ${crawled30d}`);

// Inventory stats
const totalInv = all.reduce((s, d) => s + (d.last_vin_count ?? 0), 0);
const withInventory = all.filter(d => (d.last_vin_count ?? 0) > 0).length;
console.log(`\n--- Inventory ---`);
console.log(`  Dealers with any last_vin_count: ${withInventory}`);
console.log(`  Sum of last_vin_count across all: ${totalInv}`);

// Blocked right now
const blockedNow = all.filter(d => d.blocked_until && new Date(d.blocked_until).getTime() > now).length;
console.log(`  Dealers currently blocked (blocked_until in future): ${blockedNow}`);

// Also: scraper_runs activity
const { data: recentRuns } = await sb.from('scraper_runs').select('started_at, status, listings_found, listings_new').order('started_at', { ascending: false }).limit(5);
console.log('\n--- Most recent scraper_runs ---');
for (const r of recentRuns ?? []) console.log(`  ${r.started_at} status=${r.status} found=${r.listings_found} new=${r.listings_new}`);

const { count: runsTotal } = await sb.from('scraper_runs').select('*', { count: 'exact', head: true });
console.log(`\nTotal scraper_runs rows ever: ${runsTotal}`);
