create table if not exists public.official_table_map_places (
  code text primary key,
  x integer not null check (x >= 0 and x <= 969),
  y integer not null check (y >= 0 and y <= 1371),
  updated_at timestamptz not null default now()
);

alter table public.official_table_map_places enable row level security;

revoke all on table public.official_table_map_places from public;
revoke all on table public.official_table_map_places from anon;
revoke all on table public.official_table_map_places from authenticated;
