import { createClient } from '@supabase/supabase-js';
const url = 'https://ettcryqxvwmqidwczrzd.supabase.co';
const key = process.env.COMPS_DB_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

// Simulate what mirrorMarketcheckListings does on a tiny payload.
const stamp = Date.now();
const testListings = [
  {
    vdpUrl: `https://www.testdealer-${stamp}.com/vehicle/abc123`,
    vin: 'TESTMIRRORVIN0001',
    year: 2020, make: 'Toyota', model: 'Camry', trim: 'LE',
    miles: 45000, price: 18500,
    dealerName: 'Test Dealer A', dealerPhone: '555-0100',
    dealerCity: 'Orlando', dealerState: 'FL',
    photoUrl: 'https://example.com/pic.jpg',
    transmission: 'Automatic', drivetrain: 'FWD', fuelType: 'Gasoline', engine: '2.5L I4',
  },
];

const nowIso = new Date().toISOString();
const today = nowIso.slice(0, 10);
const slug = (u) => new URL(u).hostname.replace(/^www\./, '').replace(/\./g, '_').toLowerCase();

const row = {
  listing_url: testListings[0].vdpUrl,
  source: slug(testListings[0].vdpUrl),
  data_provider: 'scrape',
  vin: testListings[0].vin,
  year: testListings[0].year, make: testListings[0].make, model: testListings[0].model, trim: testListings[0].trim,
  mileage: testListings[0].miles, price: testListings[0].price,
  city: testListings[0].dealerCity, state: testListings[0].dealerState,
  dealer_name: testListings[0].dealerName, dealer_phone: testListings[0].dealerPhone,
  photo_url: testListings[0].photoUrl,
  transmission: testListings[0].transmission, drivetrain: testListings[0].drivetrain,
  fuel: testListings[0].fuelType, engine_summary: testListings[0].engine,
  is_dealer: true, is_active: true,
  date_first_scraped: nowIso, date_last_seen: nowIso, miss_count: 0,
};

console.log('--- Round 1: initial insert ---');
const { data: r1, error: e1 } = await sb.from('listings').upsert(row, { onConflict: 'listing_url' }).select('id, source, data_provider, provider_listing_id, price').single();
console.log(e1 ? `ERROR: ${e1.message}` : `OK → ${JSON.stringify(r1)}`);

if (r1) {
  const { error: eph1 } = await sb.from('price_history').insert({ listing_id: r1.id, price: row.price, date_scraped: today });
  console.log('  initial price_history insert:', eph1 ? `ERROR ${eph1.message}` : 'OK');
}

console.log('\n--- Round 2: same URL, PRICE DROPPED to 17900 ---');
const row2 = { ...row, price: 17900, date_last_seen: new Date().toISOString() };
delete row2.date_first_scraped; // preserve on re-upsert
const { data: r2, error: e2 } = await sb.from('listings').upsert(row2, { onConflict: 'listing_url' }).select('id, price, date_first_scraped, date_last_seen').single();
console.log(e2 ? `ERROR: ${e2.message}` : `OK → id=${r2.id}, price=${r2.price}, first=${r2.date_first_scraped}, last=${r2.date_last_seen}`);

if (r2) {
  const { error: eph2 } = await sb.from('price_history').insert({ listing_id: r2.id, price: row2.price, date_scraped: today });
  console.log('  price_history insert (change):', eph2 ? `ERROR ${eph2.message}` : 'OK');
}

console.log('\n--- Verify unique_vehicles rollup ---');
const { data: uv } = await sb.from('unique_vehicles').select('*').eq('vin', row.vin).limit(5);
console.log(uv?.length ? JSON.stringify(uv[0], null, 2) : '(empty — view may lag or VIN not indexed)');

console.log('\n--- Verify price_history for this listing ---');
if (r1) {
  const { data: ph } = await sb.from('price_history').select('*').eq('listing_id', r1.id).order('id', { ascending: true });
  console.log(`${ph?.length ?? 0} price_history rows:`);
  for (const h of ph ?? []) console.log(' ', JSON.stringify(h));
}

console.log('\n--- Cleanup ---');
if (r1) {
  await sb.from('price_history').delete().eq('listing_id', r1.id);
  await sb.from('listings').delete().eq('id', r1.id);
  console.log('  deleted test rows');
}
