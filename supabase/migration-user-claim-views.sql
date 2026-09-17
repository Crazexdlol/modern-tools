-- Per-user per-claim "last opened" timestamp.
-- Used by the appraiser dashboard to show a gray highlight on claims that
-- have been (re)assigned to the current user but not yet opened.
-- Detection rule: assigned_to = auth.uid() AND (no row OR assigned_at > opened_at).

create table if not exists public.user_claim_views (
  user_id   uuid        not null references auth.users(id)     on delete cascade,
  claim_id  text        not null references public.acv_history(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (user_id, claim_id)
);

alter table public.user_claim_views enable row level security;

drop policy if exists user_claim_views_select on public.user_claim_views;
create policy user_claim_views_select on public.user_claim_views
  for select using (user_id = auth.uid());

drop policy if exists user_claim_views_insert on public.user_claim_views;
create policy user_claim_views_insert on public.user_claim_views
  for insert with check (user_id = auth.uid());

drop policy if exists user_claim_views_update on public.user_claim_views;
create policy user_claim_views_update on public.user_claim_views
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Verification: expect 1, 1, 3 (table exists, RLS on, three policies).
select count(*) from information_schema.tables where table_schema='public' and table_name='user_claim_views';
select relrowsecurity::int from pg_class where oid = 'public.user_claim_views'::regclass;
select count(*) from pg_policies where schemaname='public' and tablename='user_claim_views';
