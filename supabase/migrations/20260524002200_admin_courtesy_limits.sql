drop index if exists public.courtesies_event_customer_issued_unique_idx;

alter table public.admin_users
add column if not exists courtesy_send_limit integer not null default 0,
add column if not exists courtesy_receive_limit integer not null default 0;

alter table public.admin_users
drop constraint if exists admin_users_courtesy_send_limit_check;

alter table public.admin_users
add constraint admin_users_courtesy_send_limit_check
check (courtesy_send_limit >= 0);

alter table public.admin_users
drop constraint if exists admin_users_courtesy_receive_limit_check;

alter table public.admin_users
add constraint admin_users_courtesy_receive_limit_check
check (courtesy_receive_limit >= 0);

comment on column public.admin_users.courtesy_send_limit
is 'Maximum active courtesies this admin can issue. Zero means unlimited.';

comment on column public.admin_users.courtesy_receive_limit
is 'Maximum active courtesies this admin phone can receive. Zero means unlimited.';
