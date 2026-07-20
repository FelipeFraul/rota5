alter table public.events
add column if not exists created_by_admin_user_id uuid references public.admin_users(id),
add column if not exists created_by_admin_phone text;

alter table public.events
drop constraint if exists events_created_by_admin_phone_digits_check;

alter table public.events
add constraint events_created_by_admin_phone_digits_check
check (
  created_by_admin_phone is null
  or created_by_admin_phone ~ '^[0-9]+$'
);

create index if not exists events_created_by_admin_user_id_idx
on public.events(created_by_admin_user_id);

create index if not exists events_created_by_admin_phone_idx
on public.events(created_by_admin_phone);

comment on column public.events.created_by_admin_user_id
is 'Admin user that created/owns the event for producer-facing "my events" views.';

comment on column public.events.created_by_admin_phone
is 'Normalized WhatsApp phone that created/owns the event for audit and producer-facing filtering.';
