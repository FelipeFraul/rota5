drop function if exists public.reserve_seats(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  integer
);

alter function public.reserve_seats(
  uuid,
  uuid,
  uuid,
  uuid[],
  text,
  integer,
  text
) set search_path to '';
