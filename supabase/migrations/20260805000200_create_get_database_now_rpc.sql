create or replace function public.get_database_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.now();
$$;

revoke all on function public.get_database_now() from public;
revoke all on function public.get_database_now() from anon;
revoke all on function public.get_database_now() from authenticated;
grant execute on function public.get_database_now() to service_role;
