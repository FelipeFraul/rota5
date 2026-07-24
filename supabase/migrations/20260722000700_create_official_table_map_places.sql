create table if not exists public.official_table_map_places (
  code text primary key,
  x integer not null check (x >= 0 and x <= 1086),
  y integer not null check (y >= 0 and y <= 1448),
  updated_at timestamptz not null default now()
);

alter table public.official_table_map_places enable row level security;

revoke all on table public.official_table_map_places from public;
revoke all on table public.official_table_map_places from anon;
revoke all on table public.official_table_map_places from authenticated;

insert into public.official_table_map_places (code, x, y) values
  ('01', 377, 450),
  ('02', 394, 341),
  ('03', 420, 376),
  ('04', 465, 376),
  ('05', 409, 528),
  ('06', 418, 630),
  ('07', 416, 730),
  ('08', 416, 820),
  ('09', 433, 923),
  ('10', 401, 1087),
  ('11', 434, 1096),
  ('12', 486, 1084),
  ('13', 515, 1044),
  ('20', 583, 386),
  ('21', 619, 409),
  ('22', 635, 355),
  ('23', 648, 462),
  ('24', 649, 554),
  ('25', 656, 642),
  ('26', 662, 749),
  ('27', 671, 839),
  ('28', 674, 930),
  ('29', 676, 1018),
  ('30', 659, 1075),
  ('31', 632, 1072),
  ('32', 605, 1082),
  ('33', 607, 1153),
  ('40', 584, 307),
  ('41', 669, 383),
  ('46', 711, 1003),
  ('51', 633, 1231),
  ('52', 607, 1231),
  ('54', 585, 1317),
  ('55', 606, 1384),
  ('56', 640, 1374),
  ('42', 686, 535),
  ('43', 692, 649),
  ('44', 700, 771),
  ('45', 710, 896),
  ('53', 577, 1239)
on conflict (code) do update set
  x = excluded.x,
  y = excluded.y,
  updated_at = now();
