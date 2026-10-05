// One-shot: pull a single listing from each API, dump the keys we care about.
import 'dotenv/config';

async function peekMarketcheck() {
  const key = process.env.MARKETCHECK_API_KEY;
  const url = `https://mc-api.marketcheck.com/v2/search/car/active?api_key=${key}&year=2020&make=Toyota&model=Camry&zip=33101&radius=50&rows=1`;
  const res = await fetch(url);
  const data = await res.json();
  const l = data.listings?.[0];
  if (!l) return console.log('MC: no listings returned');
  console.log('=== MARKETCHECK — top-level keys ===');
  console.log(Object.keys(l).sort().join(', '));
  console.log('\n=== MARKETCHECK — fields of interest ===');
  console.log('first_seen_at:', l.first_seen_at, '(type:', typeof l.first_seen_at, ')');
  console.log('last_seen_at:', l.last_seen_at);
  console.log('scraped_at:', l.scraped_at);
  console.log('scraped_at_date:', l.scraped_at_date);
  console.log('seller_type:', l.seller_type);
  console.log('inventory_type:', l.inventory_type);
  console.log('dealer.zip:', l.dealer?.zip);
  console.log('dealer keys:', l.dealer ? Object.keys(l.dealer).sort().join(', ') : '(no dealer)');
  console.log('carfax_1_owner:', l.carfax_1_owner);
  console.log('carfax_clean_title:', l.carfax_clean_title);
  console.log('carfax keys:', Object.keys(l).filter(k => k.startsWith('carfax')).join(', '));
  console.log('vehicle_history_report:', JSON.stringify(l.vehicle_history_report));
}

async function peekAutodev() {
  const key = process.env.AUTODEV_API_KEY;
  const url = 'https://api.auto.dev/listings?vehicle.year=2020&vehicle.make=Toyota&vehicle.model=Camry&zip=33101&limit=1';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json();
  const l = data.data?.[0];
  if (!l) return console.log('AD: no listings returned');
  console.log('\n\n=== AUTO.DEV — top-level keys ===');
  console.log(Object.keys(l).sort().join(', '));
  console.log('vehicle keys:', l.vehicle ? Object.keys(l.vehicle).sort().join(', ') : '-');
  console.log('retailListing keys:', l.retailListing ? Object.keys(l.retailListing).sort().join(', ') : '-');
  console.log('\n=== AUTO.DEV — fields of interest ===');
  console.log('retailListing.zip:', l.retailListing?.zip);
  console.log('retailListing.firstSeen:', l.retailListing?.firstSeen);
  console.log('retailListing.listedAt:', l.retailListing?.listedAt);
  console.log('retailListing.dateListed:', l.retailListing?.dateListed);
  console.log('history:', JSON.stringify(l.history));
  console.log('carfax:', JSON.stringify(l.carfax));
  console.log('ownerCount:', l.ownerCount, l.retailListing?.ownerCount);
  console.log('accidentCount:', l.accidentCount, l.retailListing?.accidentCount);
}

await peekMarketcheck();
await peekAutodev();
