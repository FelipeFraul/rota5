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

insert into public.official_table_map_places (code, x, y) values
  ('01', 336, 426),
  ('02', 352, 323),
  ('03', 375, 356),
  ('04', 415, 356),
  ('05', 365, 500),
  ('06', 373, 597),
  ('07', 371, 691),
  ('08', 371, 777),
  ('09', 386, 874),
  ('10', 358, 1030),
  ('11', 387, 1038),
  ('12', 434, 1027),
  ('13', 460, 989),
  ('20', 520, 366),
  ('21', 552, 387),
  ('22', 567, 336),
  ('23', 578, 438),
  ('24', 579, 525),
  ('25', 585, 608),
  ('26', 591, 710),
  ('27', 599, 795),
  ('28', 601, 881),
  ('29', 603, 964),
  ('30', 588, 1018),
  ('31', 564, 1015),
  ('32', 540, 1025),
  ('33', 542, 1092),
  ('40', 521, 291),
  ('41', 597, 363),
  ('46', 635, 950),
  ('51', 565, 1166),
  ('52', 542, 1166),
  ('54', 522, 1248),
  ('55', 541, 1311),
  ('56', 571, 1302),
  ('42', 612, 507),
  ('43', 618, 615),
  ('44', 625, 730),
  ('45', 634, 849),
  ('53', 515, 1174)
on conflict (code) do update set
  x = excluded.x,
  y = excluded.y,
  updated_at = now();
