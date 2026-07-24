alter table public.combo_offers
add column if not exists original_price_cents integer;

alter table public.combo_offers
drop constraint if exists combo_offers_original_price_cents_check;

alter table public.combo_offers
add constraint combo_offers_original_price_cents_check
check (original_price_cents is null or original_price_cents > 0);

comment on column public.combo_offers.original_price_cents
is 'Optional original display price used as the "De" price in combo offer messages.';
