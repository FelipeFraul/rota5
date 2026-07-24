alter table public.courtesy_section_limits enable row level security;

revoke all on table public.courtesy_section_limits from anon;
revoke all on table public.courtesy_section_limits from authenticated;
