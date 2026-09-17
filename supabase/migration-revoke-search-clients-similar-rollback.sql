-- Rollback: restore direct execute grants (do NOT run in production).
grant execute on function public.search_clients_similar(text, int) to anon;
grant execute on function public.search_clients_similar(text, int) to authenticated;
