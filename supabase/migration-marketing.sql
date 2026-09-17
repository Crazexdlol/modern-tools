-- =========================================================================
-- Modern Tools — Marketing / CRM foundations (2026-09-14)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-marketing-rollback.sql.
--
-- What this does (steps 1-2 of the Marketing spec):
--
--  1. profiles.marketing_access (bool, default false) — gates the future
--     /marketing tab + all client_* reads/writes. Only admins can flip it,
--     enforced by extending the existing profiles_role_guard.
--
--  2. clients table + client_contacts + client_marketing_log — the CRM
--     tables. RLS: read/write for admins OR marketing_access users.
--
--  3. acv_history.client_id (nullable uuid FK to clients) — connects a
--     claim to a canonical client. ClaimInfo.clientName jsonb field stays
--     as-is during migration; PDFs and other consumers keep working. Set
--     null on delete so archiving a client doesn't nuke the claim.
--
--  4. pg_trgm extension + trigram GIN indexes on clients.name so the
--     type-ahead client dropdown can run SIMILARITY() fuzzy search
--     efficiently (threshold 0.4 used in the API layer).
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Access flag on profiles.
alter table public.profiles
  add column if not exists marketing_access boolean not null default false;

-- 2. Extend profiles_role_guard so appraisers can't self-grant marketing_access.
--    Same pattern as can_reassign_claims etc — admins CAN flip it via the
--    admin UI, appraisers can't touch it via profiles_update_self.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- is_super_admin: service-role only, regardless of role. Hoisted above admin bypass.
  if auth.role() <> 'service_role' then
    if coalesce((to_jsonb(new)->>'is_super_admin'), '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'), '') then
      raise exception 'not allowed to change is_super_admin';
    end if;
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),      '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),      '') then raise exception 'not allowed to change can_reassign_claims';      end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),      '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),      '') then raise exception 'not allowed to change can_edit_claim_info';      end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),        '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),        '') then raise exception 'not allowed to change can_create_claims';        end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                '') then raise exception 'not allowed to change is_active';                end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  if coalesce((to_jsonb(new)->>'marketing_access'),         '') is distinct from coalesce((to_jsonb(old)->>'marketing_access'),         '') then raise exception 'not allowed to change marketing_access';         end if;
  return new;
end;
$$;

-- 3. Fuzzy-search extension. Idempotent.
create extension if not exists pg_trgm;

-- 4. Reusable predicate: caller has marketing_access = true.
--    Flag-only — admin role does NOT grant implicit access. Admins who
--    should see Marketing must have the flag explicitly set (via the
--    Permissions tab or a service-role script).
create or replace function public.has_marketing_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.marketing_access = true
  );
$$;

-- 5. clients table.
create table if not exists public.clients (
  id                     uuid        primary key default gen_random_uuid(),
  name                   text        not null,
  type                   text        not null check (type in ('adjuster', 'body_shop', 'attorney', 'insurance_company')),
  address_line           text        null,
  city                   text        null,
  state                  text        null,
  zip                    text        null,
  lat                    double precision null,
  lng                    double precision null,
  phone                  text        null,
  email                  text        null,
  website                text        null,
  notes                  text        null,
  last_marketed_at       date        null,
  remarket_interval_days integer     null,
  reminder_sent_at       timestamptz null,
  archived_at            timestamptz null,
  created_by             uuid        null references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- next_remarket_at as a generated column so the reminder job can filter on it directly.
-- date + integer IS immutable (adds N days); date + interval is NOT immutable
-- (interval arithmetic depends on session TZ), so we use pure integer addition.
alter table public.clients
  add column if not exists next_remarket_at date
  generated always as (
    case
      when last_marketed_at is not null and remarket_interval_days is not null
        then last_marketed_at + remarket_interval_days
      else null
    end
  ) stored;

-- Case-insensitive unique name (allows re-use of archived names — only active clients enforce uniqueness).
create unique index if not exists clients_name_active_uniq
  on public.clients (lower(name))
  where archived_at is null;

-- Trigram GIN for the type-ahead search.
create index if not exists clients_name_trgm_idx
  on public.clients using gin (name gin_trgm_ops);

-- updated_at auto-bump.
create or replace function public.clients_bump_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clients_updated_at_trigger on public.clients;
create trigger clients_updated_at_trigger
  before update on public.clients
  for each row execute function public.clients_bump_updated_at();

-- 6. client_contacts.
create table if not exists public.client_contacts (
  id         uuid        primary key default gen_random_uuid(),
  client_id  uuid        not null references public.clients(id) on delete cascade,
  name       text        not null,
  title      text        null,
  phone      text        null,
  email      text        null,
  is_primary boolean     not null default false,
  notes      text        null,
  created_at timestamptz not null default now()
);

create index if not exists client_contacts_client_id_idx on public.client_contacts (client_id);

-- One primary per client (partial unique index).
create unique index if not exists client_contacts_primary_uniq
  on public.client_contacts (client_id)
  where is_primary = true;

-- 7. client_marketing_log.
create table if not exists public.client_marketing_log (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references public.clients(id) on delete cascade,
  marketed_at  date        not null default (now() at time zone 'utc')::date,
  method       text        not null check (method in ('visit', 'call', 'email', 'mail', 'other')),
  notes        text        null,
  logged_by    uuid        null references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists client_marketing_log_client_id_idx
  on public.client_marketing_log (client_id, marketed_at desc);

-- 8. acv_history.client_id FK.
alter table public.acv_history
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

create index if not exists acv_history_client_id_idx on public.acv_history (client_id);

-- 9. RLS: enable + policies.
alter table public.clients               enable row level security;
alter table public.client_contacts       enable row level security;
alter table public.client_marketing_log  enable row level security;

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients
  for select using (public.has_marketing_access());

drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients
  for all using (public.has_marketing_access()) with check (public.has_marketing_access());

drop policy if exists client_contacts_read on public.client_contacts;
create policy client_contacts_read on public.client_contacts
  for select using (public.has_marketing_access());

drop policy if exists client_contacts_write on public.client_contacts;
create policy client_contacts_write on public.client_contacts
  for all using (public.has_marketing_access()) with check (public.has_marketing_access());

drop policy if exists client_marketing_log_read on public.client_marketing_log;
create policy client_marketing_log_read on public.client_marketing_log
  for select using (public.has_marketing_access());

drop policy if exists client_marketing_log_write on public.client_marketing_log;
create policy client_marketing_log_write on public.client_marketing_log
  for all using (public.has_marketing_access()) with check (public.has_marketing_access());

-- 10. Fuzzy search RPC. Returns rows ordered by trigram similarity to `q`.
--     Threshold 0.3 keeps borderline matches for the "did you mean" list;
--     the API layer applies the 0.4 duplicate-guard threshold.
create or replace function public.search_clients_similar(q text, limit_n int default 8)
returns table (
  id                     uuid,
  name                   text,
  type                   text,
  city                   text,
  state                  text,
  archived_at            timestamptz,
  similarity             real
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.type, c.city, c.state, c.archived_at, similarity(c.name, q) as sim
  from public.clients c
  where c.archived_at is null
    and similarity(c.name, q) > 0.3
  order by similarity(c.name, q) desc, c.name asc
  limit greatest(1, limit_n);
$$;

-- The RPC runs security definer so it can filter by trigram — but callers
-- still need RLS-legal access on public.clients. Enforce via an explicit
-- has_marketing_access() check inside a wrapper.
create or replace function public.search_clients_similar_guarded(q text, limit_n int default 8)
returns table (
  id          uuid,
  name        text,
  type        text,
  city        text,
  state       text,
  archived_at timestamptz,
  similarity  real
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_marketing_access() then
    raise exception 'not allowed';
  end if;
  return query select * from public.search_clients_similar(q, limit_n);
end;
$$;

-- 11. Verification (informational).
select 'clients table'              as label, count(*)::int as value from information_schema.tables where table_schema='public' and table_name='clients'
union all
select 'client_contacts table',                count(*)::int          from information_schema.tables where table_schema='public' and table_name='client_contacts'
union all
select 'client_marketing_log table',           count(*)::int          from information_schema.tables where table_schema='public' and table_name='client_marketing_log'
union all
select 'profiles.marketing_access col',        count(*)::int          from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='marketing_access'
union all
select 'acv_history.client_id col',            count(*)::int          from information_schema.columns where table_schema='public' and table_name='acv_history' and column_name='client_id'
union all
select 'pg_trgm ext',                          count(*)::int          from pg_extension where extname='pg_trgm';

-- Expected: 1, 1, 1, 1, 1, 1.
