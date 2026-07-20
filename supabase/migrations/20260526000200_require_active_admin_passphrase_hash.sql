do $$
begin
  if exists (
    select 1
    from public.admin_users
    where status = 'active'
      and (
        passphrase_hash is null
        or length(btrim(passphrase_hash)) = 0
      )
  ) then
    raise exception 'active_admin_users_without_passphrase_hash';
  end if;
end;
$$;

alter table public.admin_users
drop constraint if exists admin_users_active_requires_passphrase_hash;

alter table public.admin_users
add constraint admin_users_active_requires_passphrase_hash
check (
  status <> 'active'
  or (
    passphrase_hash is not null
    and length(btrim(passphrase_hash)) > 0
  )
);

comment on constraint admin_users_active_requires_passphrase_hash on public.admin_users
is 'Active admin users must have an individual passphrase hash. Disabled admins may keep or omit the hash.';
