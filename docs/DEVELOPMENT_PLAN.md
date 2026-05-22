# WhatsApp Ticketing Development Plan

## Summary

This project is a WhatsApp-first ticketing system for event sales. Customers will search events by artist, city, and date, choose a session, sector, and seat, pay through Mercado Pago, and receive a ticket QR Code through WhatsApp.

The architecture is backend-first with Next.js App Router, TypeScript, Supabase, Z-API, and Mercado Pago. The initial foundation keeps secrets on the server, validates environment variables, exposes a health check, and prepares webhook/client boundaries for future steps.

Temporary `.gitkeep` files exist only to keep empty planned folders in version control. They should be removed as soon as real service files are added.

Step 2 is authored and audited: the initial Supabase ticketing schema now defines customers, WhatsApp conversations/messages, venues, sections, seats, events, sessions, session-level seat availability, prices, reservations, orders, payments, payment event audit logs, tickets, validation logs, and future seat map render cache.

Step 2 application status: applied manually through the Supabase SQL Editor and verified through the Supabase REST API on 2026-05-22 13:59:00 -03. The 18 expected tables exist in the real Supabase project. Supabase CLI was not linked in this environment because `npx supabase link` requires `supabase login` or `SUPABASE_ACCESS_TOKEN`.

Before any frontend/admin panel uses the anon key, RLS policies must be designed and enabled. For now, critical operations are expected to run server-side through the backend with the Supabase service role.

Step 3 created and applied the `public.reserve_seats` RPC on 2026-05-22 14:06:35 -03. It reserves seats transactionally by locking `session_seats`, freezing price and seat identity in `reservation_items`, marking seats as reserved, and creating a pending order. The function was audited on 2026-05-22 14:11:49 -03 with controlled temporary data in the real Supabase project. Tests covered valid reservation, repeated seat failure, duplicate seat array failure, cancelled session failure, missing active price failure, conversation/customer mismatch, atomic failure with mixed available/unavailable seats, and a concurrent same-seat attempt where exactly one request succeeded. Temporary audit data was removed.

Step 4 created and applied the `public.expire_reservations` RPC on 2026-05-22 14:21:08 -03. It selects expired active reservations with `FOR UPDATE SKIP LOCKED`, releases only matching reserved `session_seats`, marks reservations as expired, and expires draft/pending orders. The function was audited in the real Supabase project with temporary data. Tests covered valid expiration, future reservation untouched, paid reservation untouched, seat reserved by another reservation not released, invalid limits, and concurrent expiration calls where the same reservation was not processed twice. Temporary audit data was removed.

Step 4 final audit was completed on 2026-05-22 14:26:54 -03. Complementary tests confirmed that expired reservations without orders do not fail, expired reservations without items do not fail, `sold` seats are never released, `blocked` seats are never released, return counters reflect actual updates, and `anon` cannot execute the function. No cron, scheduled function, or automatic job exists yet; a future scheduler must call `expire_reservations`.

Step 5 created and applied the `public.confirm_paid_ticket_order` RPC on 2026-05-22 14:38:54 -03. It is the transactional payment-confirmation boundary that future payment webhooks will call after gateway approval. It locks the order, reservation, and reserved seats; validates payable state and paid amount; records an approved payment; marks the reservation/order paid; turns seats sold; and issues one ticket per reservation item without storing raw QR tokens. The RPC was tested in the real Supabase project with temporary data covering valid confirmation, idempotency, expired reservation, expired order, low amount, invalid seat state, concurrent same-order confirmation, and anon denial. Temporary audit data was removed. Mercado Pago checkout and QR image generation are still future steps.

Step 5 final audit was completed on 2026-05-22. The temporary audit script was removed and no `.tools/audit_confirm_paid_ticket_order.js` file remains in the project. Complementary tests confirmed that a paid order called again with a different `provider_payment_id` returns idempotently without creating another payment, the same `provider_payment_id` cannot confirm another order, two reservation items issue exactly two tickets with matching `sold_ticket_id` values, and an overpayment records the paid amount in `payments` while keeping the order totals unchanged. `payment_events` remains reserved for the future Mercado Pago webhook idempotency layer; the webhook must save/validate provider events before calling `confirm_paid_ticket_order`. `qr_token_hash` stores only a hash placeholder today; a future QR step must generate and deliver the raw token exactly once without persisting it in plain text.

Step 6 created the Mercado Pago payment webhook at `POST /api/webhook/payment/mercado-pago`. The route validates Mercado Pago `x-signature`/`x-request-id` with the configured webhook secret, records idempotency in `payment_events`, fetches the real payment from Mercado Pago, processes only `approved` payments, resolves the order from `ticket_order_<order_id>`, and calls `confirm_paid_ticket_order`. The webhook does not create checkout, generate QR images, send WhatsApp messages, or perform manual ticket/order updates outside the RPC.

Step 6 final audit fixed the `payment_events` retry policy: an already processed event returns duplicate, but an existing event with `processed_at = null` is retried instead of abandoned. Complementary tests covered unsigned production-style rejection, retry of an unprocessed duplicate event, transient Mercado Pago API failure without `processed_at`, pending-payment ignore, approved-payment confirmation, invalid external reference ignore, cent conversion, and raw metadata secret hygiene.

The next steps will connect the customer-facing payment creation and delivery flows around the transactional core.

## Next Steps

1. Fundação do projeto
2. Schema Supabase da ticketeira - concluído e validado no Supabase real
3. RPC de reserva transacional de assentos - concluído e validado no Supabase real
4. RPC de expiração de reservas - concluído e validado no Supabase real
5. RPC de confirmação de pagamento e emissão de tickets - concluído e validado no Supabase real
6. Webhook Mercado Pago para confirmação de pagamento - criado, auditado e pronto para produção
7. Webhook Z-API com persistência de clientes, conversas e mensagens
8. Busca de eventos por artista, cidade e data
9. Fluxo conversacional de sessão, setor e assento
10. Geração de mapa de assentos
11. Checkout Mercado Pago vinculado à reserva
12. Envio de QR Code pelo WhatsApp
13. Tela/API de validação de portaria
14. Testes de concorrência, expiração, pagamento duplicado e QR Code usado duas vezes
