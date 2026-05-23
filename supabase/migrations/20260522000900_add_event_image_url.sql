alter table public.events
add column if not exists image_url text;

alter table public.events
drop constraint if exists events_image_url_http_check;

alter table public.events
add constraint events_image_url_http_check
check (
  image_url is null
  or image_url ~* '^https?://[^[:space:]]+$'
);

comment on column public.events.image_url
is 'Public event cover/photo URL used in buyer/admin catalog surfaces. Required by backend before publishing an event.';
