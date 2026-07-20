alter table public.combo_offers
add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'combo_offers_image_url_http_check'
      and conrelid = 'public.combo_offers'::regclass
  ) then
    alter table public.combo_offers
    add constraint combo_offers_image_url_http_check
    check (image_url is null or image_url ~* '^https?://');
  end if;
end $$;

comment on column public.combo_offers.image_url
is 'Public image URL used for combo offer admin, checkout, and WhatsApp presentation.';
