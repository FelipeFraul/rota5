-- Keep WhatsApp outbound delivery execution state private to backend code.
-- The application uses only the service-role Supabase client for this table/RPC.

alter table public.whatsapp_outbound_deliveries
enable row level security;

revoke all privileges
on table public.whatsapp_outbound_deliveries
from public;

revoke all privileges
on table public.whatsapp_outbound_deliveries
from anon;

revoke all privileges
on table public.whatsapp_outbound_deliveries
from authenticated;

grant select, insert, update, delete
on table public.whatsapp_outbound_deliveries
to service_role;

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
