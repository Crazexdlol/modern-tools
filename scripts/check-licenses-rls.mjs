import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await supabase.rpc('exec_sql', {
  sql: `select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='appraiser_licenses' order by policyname`,
});

if (error) {
  const r = await fetch(
    'https://ektglhdstobaipdqssjx.supabase.co/rest/v1/rpc/exec_sql',
    {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: `select policyname, cmd, qual::text from pg_policies where schemaname='public' and tablename='appraiser_licenses' order by policyname`,
      }),
    },
  );
  console.log('rpc fallback status:', r.status, await r.text());
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
