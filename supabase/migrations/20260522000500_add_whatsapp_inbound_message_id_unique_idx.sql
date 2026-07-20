-- Strong idempotency for inbound WhatsApp messages.
-- Outbound messages are intentionally excluded because provider IDs may be absent or provider-specific.
create unique index if not exists whatsapp_messages_inbound_provider_message_id_unique
on public.whatsapp_messages(provider_message_id)
where direction = 'inbound'
  and provider_message_id is not null;
