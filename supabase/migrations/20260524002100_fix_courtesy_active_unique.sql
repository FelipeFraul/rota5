alter table public.courtesies
drop constraint if exists courtesies_event_customer_unique;

create unique index if not exists courtesies_event_customer_issued_unique_idx
on public.courtesies(event_id, customer_id)
where status = 'issued';

comment on index public.courtesies_event_customer_issued_unique_idx
is 'Prevents more than one active courtesy per event/customer while allowing reissue after cancellation.';

-- Replaced by 20260524002200_admin_courtesy_limits.sql:
-- active duplicates are now allowed and controlled by admin courtesy limits.
