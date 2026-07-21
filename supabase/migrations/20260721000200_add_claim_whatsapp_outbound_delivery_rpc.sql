create or replace function public.claim_whatsapp_outbound_delivery(p_delivery_id uuid)
returns setof public.whatsapp_outbound_deliveries
language sql
security definer
set search_path = public
as $$
  update public.whatsapp_outbound_deliveries
  set
    status = 'sending',
    claimed_at = now(),
    attempt_count = attempt_count + 1,
    updated_at = now()
  where id = p_delivery_id
    and status in ('pending', 'failed')
  returning *;
$$;
