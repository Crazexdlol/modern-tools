-- =========================================================================
-- HamsPortal — Negotiations tab foundations (2026-09-17)
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Reverses cleanly with migration-negotiations-rollback.sql.
--
-- Zero-impact for existing users:
--   * Every table is new. No existing table's columns, policies, or triggers
--     are modified (except profiles which gains one nullable-default-false
--     column, and profiles_role_guard which gains one more field to guard —
--     same additive pattern used for marketing_access).
--   * All new RLS is gated by public.has_negotiations_access(), so nothing
--     is visible to anyone until Henry's flag is flipped on.
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Access flag on profiles (mirrors marketing_access exactly).
alter table public.profiles
  add column if not exists negotiations_access boolean not null default false;

-- 2. Extend profiles_role_guard so non-admins can't self-grant negotiations_access.
--    Includes every existing guarded field (from migration-marketing.sql) plus
--    the new negotiations_access line. Same pattern.
create or replace function public.profiles_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if coalesce((to_jsonb(new)->>'is_super_admin'), '') is distinct from coalesce((to_jsonb(old)->>'is_super_admin'), '') then
      raise exception 'not allowed to change is_super_admin';
    end if;
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.role  is distinct from old.role  then raise exception 'not allowed to change role'; end if;
  if new.email is distinct from old.email then raise exception 'not allowed to change email'; end if;
  if coalesce((to_jsonb(new)->>'can_reassign_claims'),           '') is distinct from coalesce((to_jsonb(old)->>'can_reassign_claims'),           '') then raise exception 'not allowed to change can_reassign_claims';           end if;
  if coalesce((to_jsonb(new)->>'can_edit_claim_info'),           '') is distinct from coalesce((to_jsonb(old)->>'can_edit_claim_info'),           '') then raise exception 'not allowed to change can_edit_claim_info';           end if;
  if coalesce((to_jsonb(new)->>'can_create_claims'),             '') is distinct from coalesce((to_jsonb(old)->>'can_create_claims'),             '') then raise exception 'not allowed to change can_create_claims';             end if;
  if coalesce((to_jsonb(new)->>'auto_status_requests_override'), '') is distinct from coalesce((to_jsonb(old)->>'auto_status_requests_override'), '') then raise exception 'not allowed to change auto_status_requests_override'; end if;
  if coalesce((to_jsonb(new)->>'is_active'),                     '') is distinct from coalesce((to_jsonb(old)->>'is_active'),                     '') then raise exception 'not allowed to change is_active';                     end if;
  if coalesce((to_jsonb(new)->>'show_in_handling_appraiser_list'), '') is distinct from coalesce((to_jsonb(old)->>'show_in_handling_appraiser_list'), '') then raise exception 'not allowed to change show_in_handling_appraiser_list'; end if;
  if coalesce((to_jsonb(new)->>'marketing_access'),              '') is distinct from coalesce((to_jsonb(old)->>'marketing_access'),              '') then raise exception 'not allowed to change marketing_access';              end if;
  if coalesce((to_jsonb(new)->>'negotiations_access'),           '') is distinct from coalesce((to_jsonb(old)->>'negotiations_access'),           '') then raise exception 'not allowed to change negotiations_access';           end if;
  return new;
end;
$$;

-- 3. Reusable predicate: caller has negotiations_access = true.
--    Flag-only — admin role does NOT grant implicit access.
create or replace function public.has_negotiations_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.negotiations_access = true
  );
$$;

grant execute on function public.has_negotiations_access() to authenticated;

-- 4. IMAP-source truth: threads + messages + attachments + sync bookkeeping.
create table if not exists public.email_threads (
  id                        uuid        primary key default gen_random_uuid(),
  first_seen_at             timestamptz not null default now(),
  last_inbound_at           timestamptz null,
  last_outbound_at          timestamptz null,
  subject_normalized        text        not null,
  references_root           text        null,
  status                    text        not null default 'needs_response'
    check (status in ('needs_response', 'responded', 'ignored', 'spam', 'unmatched')),
  classification            text        null
    check (classification is null or classification in ('negotiation', 'informational', 'automated')),
  classification_confidence numeric     null,
  classification_reason     text        null,
  negotiation_case_id       uuid        null
);

create index if not exists email_threads_status_idx           on public.email_threads (status);
create index if not exists email_threads_last_inbound_at_idx  on public.email_threads (last_inbound_at desc nulls last);
create index if not exists email_threads_references_root_idx  on public.email_threads (references_root);

create table if not exists public.email_messages (
  id                    uuid        primary key default gen_random_uuid(),
  thread_id             uuid        not null references public.email_threads(id) on delete cascade,
  uid_validity          bigint      not null,
  uid                   bigint      not null,
  folder                text        not null,
  message_id            text        not null,
  in_reply_to           text        null,
  references_ids        text[]      not null default '{}',
  from_addr             text        not null,
  from_name             text        null,
  to_addrs              jsonb       not null default '[]'::jsonb,
  cc_addrs              jsonb       not null default '[]'::jsonb,
  subject               text        not null,
  sent_at               timestamptz not null,
  text_body             text        null,
  html_body_sanitized   text        null,
  has_attachments       boolean     not null default false,
  raw_size_bytes        bigint      null,
  synced_at             timestamptz not null default now(),
  unique (uid_validity, uid, folder)
);

create index if not exists email_messages_thread_idx      on public.email_messages (thread_id, sent_at asc);
create index if not exists email_messages_message_id_idx  on public.email_messages (message_id);
create index if not exists email_messages_from_addr_idx   on public.email_messages (from_addr);

create table if not exists public.email_attachments (
  id              uuid        primary key default gen_random_uuid(),
  message_id      uuid        not null references public.email_messages(id) on delete cascade,
  filename        text        not null,
  mime_type       text        not null,
  size_bytes      bigint      not null,
  storage_path    text        null,
  downloaded_at   timestamptz null,
  extracted_text  text        null
);

create index if not exists email_attachments_message_id_idx on public.email_attachments (message_id);

create table if not exists public.imap_sync_state (
  folder            text        primary key,
  uid_validity      bigint      not null,
  last_uid          bigint      not null,
  last_synced_at    timestamptz not null default now()
);

-- 5. Thread <-> claim linkage (populated by Phase 2 matcher; declared here so
--    Phase 1 schema is complete).
create table if not exists public.negotiation_cases (
  id                uuid        primary key default gen_random_uuid(),
  thread_id         uuid        not null unique references public.email_threads(id) on delete cascade,
  claim_id          text        not null references public.acv_history(id) on delete cascade,
  company_id        uuid        not null references public.companies(id),
  oa_email          text        null,
  oa_name           text        null,
  matched_by        text        not null
    check (matched_by in ('auto:oa_email', 'auto:claim_no', 'auto:vin', 'manual')),
  matched_at        timestamptz not null default now(),
  matched_by_user   uuid        null references public.profiles(id) on delete set null
);

create index if not exists negotiation_cases_claim_id_idx  on public.negotiation_cases (claim_id);
create index if not exists negotiation_cases_oa_email_idx  on public.negotiation_cases (oa_email);
create index if not exists negotiation_cases_company_idx   on public.negotiation_cases (company_id);

-- FK from email_threads.negotiation_case_id (declared without FK earlier so
-- table creation order doesn't matter). Add now that negotiation_cases exists.
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'email_threads'
      and constraint_name = 'email_threads_negotiation_case_id_fkey'
  ) then
    alter table public.email_threads
      add constraint email_threads_negotiation_case_id_fkey
      foreign key (negotiation_case_id) references public.negotiation_cases(id) on delete set null;
  end if;
end $$;

-- 6. Learned OA<->claim history (used by Phase 2 matcher to rank candidates
--    for OAs handling multiple claims).
create table if not exists public.oa_claim_history (
  oa_email          text        not null,
  claim_id          text        not null references public.acv_history(id) on delete cascade,
  last_matched_at   timestamptz not null default now(),
  primary key (oa_email, claim_id)
);

create index if not exists oa_claim_history_email_idx on public.oa_claim_history (oa_email);

-- 7. Valuation ledger (Phase 3).
create table if not exists public.valuation_ledgers (
  claim_id      text        primary key references public.acv_history(id) on delete cascade,
  company_id    uuid        not null references public.companies(id),
  data          jsonb       not null default '{}'::jsonb,
  user_edits    jsonb       not null default '{}'::jsonb,
  built_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 8. MarketCheck pull cache (Phase 4).
create table if not exists public.marketcheck_pulls (
  id            uuid        primary key default gen_random_uuid(),
  claim_id      text        not null references public.acv_history(id) on delete cascade,
  query_hash    text        not null,
  listings      jsonb       not null,
  pulled_at     timestamptz not null default now(),
  unique (claim_id, query_hash)
);

-- 9. Draft versions (Phase 4).
create table if not exists public.negotiation_drafts (
  id              uuid        primary key default gen_random_uuid(),
  case_id         uuid        not null references public.negotiation_cases(id) on delete cascade,
  version         int         not null,
  instructions    text        null,
  output          jsonb       not null,
  model           text        not null,
  created_at      timestamptz not null default now(),
  unique (case_id, version)
);

-- 10. Stances config (Phase 4). One row per profile.
create table if not exists public.negotiation_config (
  profile_id    uuid        primary key references public.profiles(id) on delete cascade,
  data          jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- 11. RLS: enable + policies. Every table is Henry-only via the flag.
--     Claim-scoped tables additionally respect multi-company boundaries.

alter table public.email_threads       enable row level security;
alter table public.email_messages      enable row level security;
alter table public.email_attachments   enable row level security;
alter table public.imap_sync_state     enable row level security;
alter table public.negotiation_cases   enable row level security;
alter table public.oa_claim_history    enable row level security;
alter table public.valuation_ledgers   enable row level security;
alter table public.marketcheck_pulls   enable row level security;
alter table public.negotiation_drafts  enable row level security;
alter table public.negotiation_config  enable row level security;

-- Flag-only tables (no claim/company scope needed — these are Henry-personal state).
drop policy if exists et_all on public.email_threads;
create policy et_all on public.email_threads for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists em_all on public.email_messages;
create policy em_all on public.email_messages for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists ea_all on public.email_attachments;
create policy ea_all on public.email_attachments for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists iss_all on public.imap_sync_state;
create policy iss_all on public.imap_sync_state for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists och_all on public.oa_claim_history;
create policy och_all on public.oa_claim_history for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists nconfig_all on public.negotiation_config;
create policy nconfig_all on public.negotiation_config for all to authenticated
  using (public.has_negotiations_access() and profile_id = auth.uid())
  with check (public.has_negotiations_access() and profile_id = auth.uid());

-- Claim-scoped tables: additionally respect the multi-company boundary so a
-- future non-Henry admin (if ever granted the flag) can only see cases inside
-- their active company. Belt-and-suspenders.
drop policy if exists nc_all on public.negotiation_cases;
create policy nc_all on public.negotiation_cases for all to authenticated
  using (
    public.has_negotiations_access()
    and public.active_company_id() = company_id
    and public.has_company_access(company_id)
  )
  with check (
    public.has_negotiations_access()
    and public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists vl_all on public.valuation_ledgers;
create policy vl_all on public.valuation_ledgers for all to authenticated
  using (
    public.has_negotiations_access()
    and public.active_company_id() = company_id
    and public.has_company_access(company_id)
  )
  with check (
    public.has_negotiations_access()
    and public.active_company_id() = company_id
    and public.has_company_access(company_id)
  );

drop policy if exists mcp_all on public.marketcheck_pulls;
create policy mcp_all on public.marketcheck_pulls for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

drop policy if exists nd_all on public.negotiation_drafts;
create policy nd_all on public.negotiation_drafts for all to authenticated
  using (public.has_negotiations_access())
  with check (public.has_negotiations_access());

-- 12. Storage bucket for lazily-downloaded attachments.
insert into storage.buckets (id, name, public)
  values ('negotiation-attachments', 'negotiation-attachments', false)
  on conflict (id) do nothing;

-- Storage policies: authenticated + has_negotiations_access.
drop policy if exists "negotiation attachments read"   on storage.objects;
create policy "negotiation attachments read"
  on storage.objects for select to authenticated
  using (bucket_id = 'negotiation-attachments' and public.has_negotiations_access());

drop policy if exists "negotiation attachments write"  on storage.objects;
create policy "negotiation attachments write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'negotiation-attachments' and public.has_negotiations_access());

drop policy if exists "negotiation attachments update" on storage.objects;
create policy "negotiation attachments update"
  on storage.objects for update to authenticated
  using (bucket_id = 'negotiation-attachments' and public.has_negotiations_access())
  with check (bucket_id = 'negotiation-attachments' and public.has_negotiations_access());

drop policy if exists "negotiation attachments delete" on storage.objects;
create policy "negotiation attachments delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'negotiation-attachments' and public.has_negotiations_access());

-- 13. Verification (informational — expect 1s across the board).
select 'profiles.negotiations_access col'      as label, count(*)::int as value from information_schema.columns where table_schema='public' and column_name='negotiations_access' and table_name='profiles'
union all
select 'has_negotiations_access fn',                     count(*)::int          from pg_proc where proname='has_negotiations_access'
union all
select 'email_threads table',                            count(*)::int          from information_schema.tables where table_schema='public' and table_name='email_threads'
union all
select 'email_messages table',                           count(*)::int          from information_schema.tables where table_schema='public' and table_name='email_messages'
union all
select 'email_attachments table',                        count(*)::int          from information_schema.tables where table_schema='public' and table_name='email_attachments'
union all
select 'imap_sync_state table',                          count(*)::int          from information_schema.tables where table_schema='public' and table_name='imap_sync_state'
union all
select 'negotiation_cases table',                        count(*)::int          from information_schema.tables where table_schema='public' and table_name='negotiation_cases'
union all
select 'oa_claim_history table',                         count(*)::int          from information_schema.tables where table_schema='public' and table_name='oa_claim_history'
union all
select 'valuation_ledgers table',                        count(*)::int          from information_schema.tables where table_schema='public' and table_name='valuation_ledgers'
union all
select 'marketcheck_pulls table',                        count(*)::int          from information_schema.tables where table_schema='public' and table_name='marketcheck_pulls'
union all
select 'negotiation_drafts table',                       count(*)::int          from information_schema.tables where table_schema='public' and table_name='negotiation_drafts'
union all
select 'negotiation_config table',                       count(*)::int          from information_schema.tables where table_schema='public' and table_name='negotiation_config'
union all
select 'negotiation-attachments bucket',                 count(*)::int          from storage.buckets where id='negotiation-attachments';

-- Expected: 1 for every row.

-- 14. After running this migration, flip Henry's flag once:
--   update public.profiles set negotiations_access = true
--   where email = 'YOUR_EMAIL_HERE';  -- (or use id = 'HENRY_UUID')
