alter table public.tickets
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists participant_delivery_status text,
  add column if not exists participant_delivered_at timestamptz;

alter table public.tickets
  drop constraint if exists tickets_participant_delivery_status_check;

alter table public.tickets
  add constraint tickets_participant_delivery_status_check
  check (
    participant_delivery_status is null
    or participant_delivery_status in (
      'awaiting_participant_request',
      'delivered'
    )
  );

create index if not exists tickets_recipient_phone_idx
on public.tickets(recipient_phone)
where recipient_phone is not null;

create or replace function public.assign_participant_contacts_to_order_tickets(
  p_order_id uuid,
  p_contacts jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_expected_count integer;
  v_ticket_count integer := 0;
  v_index integer := 0;
  v_contact jsonb;
  v_contact_name text;
  v_contact_phone text;
  v_ticket record;
  v_idempotent boolean := true;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' then
    raise exception 'contacts_array_required';
  end if;

  v_expected_count := jsonb_array_length(p_contacts);

  if v_expected_count <= 0 then
    raise exception 'contacts_required';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_paid';
  end if;

  if not exists (
    select 1
    from public.payments p
    where p.order_id = p_order_id
      and p.status = 'approved'
  ) then
    raise exception 'approved_payment_not_found';
  end if;

  select count(*)::integer
  into v_ticket_count
  from public.tickets t
  where t.order_id = p_order_id
    and t.status = 'issued';

  if v_ticket_count = 0 then
    raise exception 'tickets_not_found';
  end if;

  if v_ticket_count <> v_expected_count then
    raise exception 'ticket_contact_count_mismatch';
  end if;

  for v_ticket in
    select
      t.id,
      t.recipient_name,
      t.recipient_phone,
      t.participant_delivery_status,
      t.participant_delivered_at
    from public.tickets t
    where t.order_id = p_order_id
      and t.status = 'issued'
    order by t.ticket_code asc
    for update
  loop
    v_contact := p_contacts -> v_index;
    v_contact_name := nullif(btrim(v_contact ->> 'displayName'), '');
    v_contact_phone := nullif(btrim(v_contact ->> 'phone'), '');

    if v_contact_phone is null then
      raise exception 'contact_phone_required';
    end if;

    if (
      v_ticket.recipient_phone is not null
      or v_ticket.recipient_name is not null
      or v_ticket.participant_delivery_status is not null
    ) and not (
      v_ticket.recipient_phone = v_contact_phone
      and v_ticket.recipient_name is not distinct from v_contact_name
      and v_ticket.participant_delivery_status in (
        'awaiting_participant_request',
        'delivered'
      )
    ) then
      raise exception 'ticket_already_bound_incompatibly';
    end if;

    if not (
      v_ticket.recipient_phone = v_contact_phone
      and v_ticket.recipient_name is not distinct from v_contact_name
      and v_ticket.participant_delivery_status in (
        'awaiting_participant_request',
        'delivered'
      )
    ) then
      v_idempotent := false;
    end if;

    update public.tickets
    set
      recipient_name = v_contact_name,
      recipient_phone = v_contact_phone,
      participant_delivery_status = case
        when participant_delivery_status = 'delivered'
          then 'delivered'
        else 'awaiting_participant_request'
      end,
      participant_delivered_at = case
        when participant_delivery_status = 'delivered'
          then participant_delivered_at
        else null
      end
    where id = v_ticket.id;

    v_index := v_index + 1;
  end loop;

  return jsonb_build_object(
    'order_id', p_order_id,
    'assigned_count', v_expected_count,
    'idempotent', v_idempotent
  );
end;
$$;
