alter table public.admin_users
add column if not exists passphrase_hash text;

comment on column public.admin_users.passphrase_hash
is 'Per-admin passphrase hash. Active admins without this hash cannot authenticate.';
