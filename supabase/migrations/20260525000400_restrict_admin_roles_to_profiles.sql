-- Admin profiles are Diretor/Gerente/Operador in the product.
-- Internal values stay stable as root/admin/operator.
do $$
begin
  if exists (
    select 1
    from public.admin_users
    where role in ('gate', 'support')
  ) then
    raise exception 'legacy_admin_roles_must_be_migrated_before_constraint_update';
  end if;
end;
$$;

alter table public.admin_users
drop constraint if exists admin_users_role_check;

alter table public.admin_users
add constraint admin_users_role_check
check (role in ('root', 'admin', 'operator'));

comment on column public.admin_users.role
is 'Internal admin profile: root=Diretor, admin=Gerente, operator=Operador. External gate validators are stored in gate_accesses, not admin_users.';
