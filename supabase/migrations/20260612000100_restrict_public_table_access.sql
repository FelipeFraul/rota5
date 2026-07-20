-- Defense-in-depth: the application accesses Supabase from server code with
-- service_role. Keep direct REST access from anon/authenticated closed even if
-- an anon key is exposed in the future.

alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.venues enable row level security;
alter table public.venue_sections enable row level security;
alter table public.seats enable row level security;
alter table public.events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.session_seats enable row level security;
alter table public.ticket_prices enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_items enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_validation_events enable row level security;
alter table public.seat_map_renders enable row level security;
alter table public.gate_sessions enable row level security;
alter table public.gate_accesses enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_auth_attempts enable row level security;
alter table public.admin_login_challenges enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.courtesy_limits enable row level security;
alter table public.courtesies enable row level security;
alter table public.buyer_risk_events enable row level security;
alter table public.rate_limit_events enable row level security;

revoke all on all tables in schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant all on all tables in schema public to service_role;
