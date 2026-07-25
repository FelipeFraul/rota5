drop index if exists combo_orders_source_order_offer_unique_idx;

create unique index if not exists combo_orders_source_ticket_offer_unique_idx
on public.combo_orders(source_ticket_id, offer_id)
where source_ticket_id is not null
  and offer_id is not null;

create unique index if not exists combo_orders_legacy_source_order_offer_unique_idx
on public.combo_orders(source_order_id, offer_id)
where source_order_id is not null
  and source_ticket_id is null
  and offer_id is not null;

comment on index public.combo_orders_source_ticket_offer_unique_idx
is 'Prevents duplicate combo offer checkout for the same source ticket while allowing different recipients from the same paid table/bistro order.';

comment on index public.combo_orders_legacy_source_order_offer_unique_idx
is 'Preserves legacy de-duplication for combo orders created before source_ticket_id was populated.';
