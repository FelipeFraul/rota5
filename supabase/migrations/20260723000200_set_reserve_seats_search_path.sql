do $$
begin
  if pg_catalog.to_regprocedure('public.reserve_seats(uuid,uuid,uuid,uuid[],text,integer)') is not null then
    execute $sql$alter function public.reserve_seats(uuid,uuid,uuid,uuid[],text,integer) set search_path to ''$sql$;
  end if;
end
$$;

alter function public.reserve_seats(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  integer,
  text
) set search_path to '';
