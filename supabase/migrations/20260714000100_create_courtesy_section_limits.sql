create table if not exists public.courtesy_section_limits (
  event_id uuid not null references public.events(id) on delete cascade,
  section_id uuid not null references public.venue_sections(id) on delete cascade,
  label text not null default 'Cortesia',
  max_courtesies integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, section_id),
  constraint courtesy_section_limits_label_not_empty_check check (btrim(label) <> ''),
  constraint courtesy_section_limits_max_courtesies_check check (max_courtesies >= 0),
  constraint courtesy_section_limits_status_check check (status in ('active', 'inactive'))
);

create index if not exists courtesy_section_limits_event_id_idx
on public.courtesy_section_limits(event_id);

create index if not exists courtesy_section_limits_section_id_idx
on public.courtesy_section_limits(section_id);

drop trigger if exists courtesy_section_limits_set_updated_at
on public.courtesy_section_limits;

create trigger courtesy_section_limits_set_updated_at
before update on public.courtesy_section_limits
for each row execute function public.set_updated_at();

comment on table public.courtesy_section_limits
is 'Courtesy ticket caps by event section. Each row controls how many free QR Code tickets can be issued for a sector.';
