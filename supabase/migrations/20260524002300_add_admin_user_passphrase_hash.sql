alter table public.admin_users
add column if not exists passphrase_hash text;

comment on column public.admin_users.passphrase_hash
is 'Optional per-admin passphrase hash. When null, legacy global ADMIN_AUTH_SECRET_HASH can still authenticate the admin.';
