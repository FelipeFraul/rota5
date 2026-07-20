alter table public.ticket_prices
drop constraint if exists ticket_prices_session_section_type_key;

create unique index if not exists ticket_prices_session_section_label_unique_idx
on public.ticket_prices(session_id, section_id, lower(btrim(label)));

comment on index public.ticket_prices_session_section_label_unique_idx
is 'Allows multiple purchase offers in the same session/section while preventing duplicate labels.';
