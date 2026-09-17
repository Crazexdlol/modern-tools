-- Security fix: the un-guarded search_clients_similar() RPC is security-definer
-- and callable via PostgREST by any authenticated user, which exposes every
-- non-archived client's name/city/state. The intended entry point is the
-- _guarded wrapper which enforces has_marketing_access().
--
-- Revoke direct execute from anon + authenticated so callers must go through
-- the guarded wrapper (which is what all app code already does — this only
-- closes the direct-RPC bypass).

revoke execute on function public.search_clients_similar(text, int) from anon;
revoke execute on function public.search_clients_similar(text, int) from authenticated;

-- Verification: expect 0 (no grants to anon/authenticated).
select count(*)
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'search_clients_similar'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'EXECUTE';
