alter table public.tickets
  add column if not exists buyer_qr_delivered_at timestamptz;

create index if not exists tickets_buyer_qr_delivered_at_idx
on public.tickets(buyer_qr_delivered_at)
where buyer_qr_delivered_at is not null;

create index if not exists tickets_participant_delivered_at_idx
on public.tickets(participant_delivered_at)
where participant_delivered_at is not null;

create or replace function public.mark_buyer_ticket_qr_delivered(
  p_ticket_id uuid,
  p_delivered_at timestamptz
)
returns table (
  ticket_id uuid,
  buyer_qr_delivered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ticket_id is null then
    raise exception 'ticket_id_required';
  end if;

  if p_delivered_at is null then
    raise exception 'delivered_at_required';
  end if;

  return query
  update public.tickets as ticket
  set buyer_qr_delivered_at = least(
    coalesce(ticket.buyer_qr_delivered_at, p_delivered_at),
    p_delivered_at
  )
  where ticket.id = p_ticket_id
    and ticket.status = 'issued'
  returning ticket.id, ticket.buyer_qr_delivered_at;
end;
$$;

revoke all on function public.mark_buyer_ticket_qr_delivered(uuid, timestamptz) from public;
revoke all on function public.mark_buyer_ticket_qr_delivered(uuid, timestamptz) from anon;
revoke all on function public.mark_buyer_ticket_qr_delivered(uuid, timestamptz) from authenticated;
grant execute on function public.mark_buyer_ticket_qr_delivered(uuid, timestamptz) to service_role;

with first_buyer_qr_delivery as (
  select
    (delivery.business_context->>'ticket_id')::uuid as ticket_id,
    min(delivery.sent_at) as first_sent_at
  from public.whatsapp_outbound_deliveries as delivery
  where delivery.reason = 'paid_ticket_qr_delivery'
    and delivery.status = 'sent'
    and delivery.sent_at is not null
    and delivery.business_context ? 'ticket_id'
    and delivery.business_context->>'ticket_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by (delivery.business_context->>'ticket_id')::uuid
)
update public.tickets as ticket
set buyer_qr_delivered_at = first_buyer_qr_delivery.first_sent_at
from first_buyer_qr_delivery
where ticket.id = first_buyer_qr_delivery.ticket_id
  and ticket.status = 'issued'
  and (
    ticket.buyer_qr_delivered_at is null
    or first_buyer_qr_delivery.first_sent_at < ticket.buyer_qr_delivered_at
  );
