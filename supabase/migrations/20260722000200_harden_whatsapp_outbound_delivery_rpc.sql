-- Further restrict WhatsApp outbound delivery internals and prevent future
-- objects created by the migration owner in public from inheriting broad
-- anon/authenticated privileges.

revoke all privileges
on table public.whatsapp_outbound_deliveries
from service_role;

grant select, insert, update, delete
on table public.whatsapp_outbound_deliveries
to service_role;

create or replace function public.claim_whatsapp_outbound_delivery(p_delivery_id uuid)
returns setof public.whatsapp_outbound_deliveries
language sql
security invoker
set search_path = ''
as $$
  update public.whatsapp_outbound_deliveries as delivery
  set
    status = 'sending',
    claimed_at = pg_catalog.now(),
    attempt_count = delivery.attempt_count + 1,
    updated_at = pg_catalog.now()
  where delivery.id = p_delivery_id
    and delivery.status in ('pending', 'failed')
  returning delivery.*;
$$;

revoke all privileges
on function public.claim_whatsapp_outbound_delivery(uuid)
from public;

revoke all privileges
on function public.claim_whatsapp_outbound_delivery(uuid)
from anon;

revoke all privileges
on function public.claim_whatsapp_outbound_delivery(uuid)
from authenticated;

grant execute
on function public.claim_whatsapp_outbound_delivery(uuid)
to service_role;

alter default privileges for role postgres in schema public
revoke all privileges on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
revoke all privileges on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
revoke all privileges on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
grant usage, select, update on sequences to service_role;

alter default privileges for role postgres in schema public
grant execute on functions to service_role;
