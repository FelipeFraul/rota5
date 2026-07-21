create table if not exists public.whatsapp_outbound_deliveries (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  customer_id uuid not null references public.customers(id),
  conversation_id uuid null references public.conversations(id),
  recipient_phone text not null,
  message_type text not null,
  reason text not null,
  business_context jsonb not null default '{}'::jsonb,
  status text not null,
  attempt_count integer not null default 0,
  provider_message_id text null,
  last_error text null,
  claimed_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_outbound_deliveries_message_type_check check (
    message_type in ('text', 'image')
  ),
  constraint whatsapp_outbound_deliveries_status_check check (
    status in ('pending', 'sending', 'sent', 'failed')
  ),
  constraint whatsapp_outbound_deliveries_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint whatsapp_outbound_deliveries_recipient_phone_not_empty_check check (
    btrim(recipient_phone) <> ''
  ),
  constraint whatsapp_outbound_deliveries_idempotency_key_not_empty_check check (
    btrim(idempotency_key) <> ''
  ),
  constraint whatsapp_outbound_deliveries_reason_not_empty_check check (
    btrim(reason) <> ''
  )
);

create index if not exists whatsapp_outbound_deliveries_status_idx
on public.whatsapp_outbound_deliveries(status);

create index if not exists whatsapp_outbound_deliveries_customer_id_idx
on public.whatsapp_outbound_deliveries(customer_id);

create index if not exists whatsapp_outbound_deliveries_conversation_id_idx
on public.whatsapp_outbound_deliveries(conversation_id);

create index if not exists whatsapp_outbound_deliveries_reason_idx
on public.whatsapp_outbound_deliveries(reason);

create index if not exists whatsapp_outbound_deliveries_created_at_idx
on public.whatsapp_outbound_deliveries(created_at);
