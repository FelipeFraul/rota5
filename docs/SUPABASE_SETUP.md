# Supabase Setup

This project has a local migration for the initial ticketing schema:

`supabase/migrations/20260522000100_create_ticketing_schema.sql`

The transactional reservation RPC migration is:

`supabase/migrations/20260522000200_create_reserve_seats_rpc.sql`

The reservation expiration RPC migration is:

`supabase/migrations/20260522000300_create_expire_reservations_rpc.sql`

The paid-order confirmation RPC migration is:

`supabase/migrations/20260522000400_create_confirm_paid_ticket_order_rpc.sql`

The paid-order confirmation RPC migration was applied manually through the Supabase SQL Editor and verified through the Supabase REST RPC endpoint on 2026-05-22 14:38:54 -03. A validation-only call returned the expected `order_id_required` error, confirming that `public.confirm_paid_ticket_order` is available and executable by the service role.

The paid-order confirmation RPC was audited with temporary data in the real Supabase project. The audit confirmed:

- valid pending order confirms payment and issues one ticket;
- reservation and order become `paid`;
- approved payment is recorded without duplicating provider payment IDs;
- related `session_seats` become `sold`;
- `current_reservation_id` is cleared and `sold_ticket_id` is filled;
- repeating the confirmation is idempotent and does not duplicate tickets;
- expired reservation fails with `reservation_expired`;
- expired order fails with `order_not_payable`;
- amount below order total plus fees fails with `payment_amount_too_low`;
- seat not reserved for the reservation fails with `reserved_seat_not_available`;
- concurrent same-order calls do not duplicate tickets;
- `anon` cannot execute `confirm_paid_ticket_order`;
- temporary audit data was removed.

A final paid-order confirmation audit was completed on 2026-05-22. The temporary local audit script was removed from the project. Complementary tests confirmed:

- a paid order called again with a different `provider_payment_id` returns idempotently and does not create another payment;
- the same `provider_payment_id` cannot confirm another order and is blocked with `payment_already_linked`;
- two `reservation_items` issue exactly two tickets;
- each sold `session_seat.sold_ticket_id` points to the matching emitted ticket;
- a payment amount greater than the order total is accepted, `payments.amount_cents` stores the actual paid amount, and the order totals remain unchanged;
- cleanup checks returned empty.

`payment_events` is not used by `confirm_paid_ticket_order` in this step. It is reserved for the future Mercado Pago webhook idempotency/audit layer. The future webhook should store the provider event, validate payment status with Mercado Pago, then call `confirm_paid_ticket_order` only after approval.

`qr_token_hash` stores only a hash placeholder. The current RPC does not generate a QR image and does not expose a raw token. The future QR delivery step must define one-time raw token generation/delivery without persisting the raw token in plain text.

The reservation expiration migration was applied manually through the Supabase SQL Editor and verified through the Supabase REST RPC endpoint on 2026-05-22 14:21:08 -03. A validation-only call returned the expected `limit_required` error, confirming that `public.expire_reservations` is available and executable by the service role.

The RPC was fully audited with temporary data on 2026-05-22 14:21:08 -03. The audit confirmed:

- expired active reservation is marked `expired`;
- matching reserved `session_seats` are released to `available`;
- matching draft/pending order is marked `expired`;
- future active reservation remains active and its seat remains reserved;
- paid reservation and paid order are untouched;
- seat reserved by another reservation is not released;
- `p_limit = 0` fails with `limit_must_be_positive`;
- `p_limit > 500` fails with `limit_too_high`;
- parallel expiration calls do not process the same reservation twice;
- temporary audit data was removed.

A final quality audit was completed on 2026-05-22 14:26:54 -03. Complementary tests confirmed:

- expired reservation without an order is expired without failing;
- expired reservation without reservation items is expired without failing;
- `released_seats_count` is based on actual updated rows;
- `sold` session seats are not changed to `available`;
- `blocked` session seats are not changed to `available`;
- `anon` cannot execute `expire_reservations`;
- temporary audit data was removed.

No automatic scheduler exists yet. A future step must add a safe cron/job that calls `expire_reservations` with service-role credentials.

## Confirm Paid Ticket Order Verification Query

After applying `20260522000400_create_confirm_paid_ticket_order_rpc.sql`, verify the function exists:

```sql
select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'confirm_paid_ticket_order';
```

Expected result: 1 row.

You can also verify existence through the REST RPC endpoint with an invalid payload:

```json
{
  "p_order_id": null,
  "p_provider": "mercado_pago",
  "p_provider_payment_id": "test",
  "p_amount_cents": 1000,
  "p_raw_metadata": {}
}
```

Expected error: `order_id_required`.

The function is intended for backend/service-role use. It revokes execution from `public`, `anon`, and `authenticated`, then grants execution to `service_role`.

## Confirm Paid Ticket Order Manual Test Checklist

Use temporary data only, and remove it after testing if running against a production-like project.

- [x] Valid pending order confirms payment and issues tickets.
- [x] Repeating the same confirmation is idempotent and does not duplicate tickets.
- [x] Active but expired reservation fails with `reservation_expired`.
- [x] Expired order fails with `order_not_payable`.
- [x] Amount below order total plus fees fails with `payment_amount_too_low`.
- [x] Seat not reserved for the reservation fails with `reserved_seat_not_available`.
- [x] Concurrent same-order calls do not duplicate tickets.
- [x] `anon` cannot execute `confirm_paid_ticket_order`.
- [x] No raw QR token is stored.
- [x] Paid order with different `provider_payment_id` returns idempotently without mutation.
- [x] Same `provider_payment_id` on another order is blocked.
- [x] Two reservation items issue two tickets with matching `sold_ticket_id` values.
- [x] Overpayment records the paid amount while preserving order totals.
- [x] No Mercado Pago checkout, WhatsApp send, QR image, map, or gate validation exists yet.

## Mercado Pago Webhook

The payment webhook route is:

`POST /api/webhook/payment/mercado-pago`

Production URL:

`https://site-phi-seven-72.vercel.app/api/webhook/payment/mercado-pago`

Required production environment variables:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The route validates `x-signature` and `x-request-id` using the Mercado Pago webhook secret. The signature manifest follows Mercado Pago's documented format:

`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`

The `data.id` value is read from query params when available, falling back defensively to the JSON payload. The webhook payload is never trusted for status, amount, or order state. It is used only to identify which payment must be fetched from Mercado Pago.

Processing rules:

- insert a `payment_events` row using `x-request-id` as the stable event key;
- if the event already exists and `processed_at` is filled, return `{ received: true, duplicate: true }`;
- if the event already exists but `processed_at` is still null, retry processing instead of abandoning the webhook;
- fetch the real payment from `GET /v1/payments/{id}`;
- process only `status = approved`;
- for non-approved statuses, set `processed_at` and return `payment_not_approved`;
- parse `external_reference` as `ticket_order_<order_id>`;
- call `confirm_paid_ticket_order`;
- after successful RPC confirmation, set `payment_events.processed_at`;
- on Mercado Pago API/transient errors, do not set `processed_at`, so retries can happen.

The webhook does not create checkout, does not generate QR images, does not send WhatsApp messages, and does not update tickets/orders manually. Ticket issuance remains centralized in `confirm_paid_ticket_order`.

Test coverage performed with temporary data and cleanup:

- [x] POST without signature returns 401.
- [x] Payload without payment ID returns 400.
- [x] Duplicate event returns duplicate and does not reprocess.
- [x] Event already registered with `processed_at = null` is retried.
- [x] Pending payment does not call the confirmation RPC.
- [x] Approved payment with valid `external_reference` confirms the order and emits a ticket.
- [x] Approved payment with invalid `external_reference` is ignored.
- [x] Mercado Pago API error returns a transient 500 and leaves the event unprocessed.
- [x] Decimal conversion returns 1000, 1090, and 1099 cents for 10, 10.9, and 10.99.
- [x] Stored webhook/payment metadata excludes access tokens, webhook secrets, signatures, and full headers.
- [x] `payment_events` receives audit rows.

Production validation for this route must include:

```bash
curl -i -X POST https://site-phi-seven-72.vercel.app/api/webhook/payment/mercado-pago
```

Expected result without Mercado Pago signature headers: `401 Unauthorized`, not `404`.

Do not configure the Mercado Pago dashboard webhook until the production URL has been confirmed.

This migration was applied manually through the Supabase SQL Editor and verified through the Supabase REST RPC endpoint on 2026-05-22 14:06:35 -03. A validation-only call returned the expected `customer_id_required` error, confirming that `public.reserve_seats` is available and executable by the service role.

The RPC was fully audited with temporary data on 2026-05-22 14:11:49 -03. The audit confirmed:

- valid reservation creates reservation, reservation item, order, and marks the session seat as reserved;
- repeated reservation of the same seat fails with `seat_not_available`;
- duplicated seat IDs fail with `duplicate_seat_ids`;
- cancelled session fails with `session_not_available`;
- missing active price fails with `ticket_price_not_found`;
- conversation from another customer fails with `conversation_not_found`;
- mixed available/unavailable multi-seat request fails atomically and leaves the available seat unchanged;
- concurrent same-seat requests result in exactly one success and one `seat_not_available` failure;
- temporary audit data was removed.

The migration was applied manually through the Supabase SQL Editor and verified through the Supabase REST API on 2026-05-22 13:59:00 -03. The 18 expected tables exist in the real Supabase project.

Supabase CLI status:

- `npx supabase status` could not inspect a local stack because Docker is not available in this environment.
- `npx supabase link --project-ref uhttjhrszwrnodcczkdp --debug` requires `supabase login` or `SUPABASE_ACCESS_TOKEN`.
- `npx supabase db push` was not used to apply this migration because the project is not linked locally.

## Manual SQL Editor Setup

1. Create or open the Supabase project that will host this ticketing system.
2. Open the Supabase Dashboard.
3. Go to SQL Editor.
4. Open the local migration file:
   `supabase/migrations/20260522000100_create_ticketing_schema.sql`
5. Copy the full SQL contents.
6. Paste the SQL into a new SQL Editor query.
7. Run the query once.
8. Confirm the query completes without errors.

## Verification Query

After running the migration, execute this query in the SQL Editor:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'customers',
    'conversations',
    'whatsapp_messages',
    'venues',
    'venue_sections',
    'seats',
    'events',
    'event_sessions',
    'session_seats',
    'ticket_prices',
    'reservations',
    'reservation_items',
    'orders',
    'payments',
    'payment_events',
    'tickets',
    'ticket_validation_events',
    'seat_map_renders'
  )
order by table_name;
```

Expected result: 18 rows.

## RPC Verification Query

After applying `20260522000200_create_reserve_seats_rpc.sql`, verify the function exists:

```sql
select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'reserve_seats';
```

Expected result: 1 row.

The function is intended for backend/service-role use. It revokes execution from `public`, `anon`, and `authenticated`, then grants execution to `service_role`.

After applying `20260522000300_create_expire_reservations_rpc.sql`, verify the expiration function exists:

```sql
select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'expire_reservations';
```

Expected result: 1 row.

You can also verify existence through the REST RPC endpoint with an invalid payload:

```json
{ "p_limit": null }
```

Expected error: `limit_required`.

The function is intended for backend/service-role use. It revokes execution from `public`, `anon`, and `authenticated`, then grants execution to `service_role`.

## Expire Reservations Manual Test Checklist

Use temporary data only, and remove it after testing if running against a production-like project.

- [x] Expired active reservation is marked `expired`.
- [x] Matching reserved `session_seats` are released to `available`.
- [x] Matching draft/pending order is marked `expired`.
- [x] Future active reservation remains active and its seats remain reserved.
- [x] Paid reservation is untouched.
- [x] Seat reserved by another reservation is not released.
- [x] `p_limit = 0` fails with `limit_must_be_positive`.
- [x] `p_limit > 500` fails with `limit_too_high`.
- [x] Parallel expiration calls do not process the same reservation twice.
- [x] Expired reservation without order does not fail.
- [x] Expired reservation without reservation items does not fail.
- [x] Sold seats are not released.
- [x] Blocked seats are not released.
- [x] No cron/job exists yet.

## Reserve Seats Manual Test Checklist

Use temporary data only, and remove it after testing if running against a production-like project.

- [x] Valid customer/session/seat/price reserves successfully.
- [x] Reserving the same seat again fails with `seat_not_available`.
- [x] Passing duplicated IDs in `p_seat_ids` fails with `duplicate_seat_ids`.
- [x] A `cancelled`, `finished`, or `sales_closed` session fails with `session_not_available`.
- [x] A seat section without active price for the requested ticket type fails with `ticket_price_not_found`.
- [x] Mixed available/unavailable multi-seat request fails atomically.
- [x] Concurrent same-seat requests allow only one successful reservation.

## Table Checklist

- [x] customers
- [x] conversations
- [x] whatsapp_messages
- [x] venues
- [x] venue_sections
- [x] seats
- [x] events
- [x] event_sessions
- [x] session_seats
- [x] ticket_prices
- [x] reservations
- [x] reservation_items
- [x] orders
- [x] payments
- [x] payment_events
- [x] tickets
- [x] ticket_validation_events
- [x] seat_map_renders

## Optional CLI Setup

If Supabase CLI credentials are available later:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Then run the verification query above in the SQL Editor.

## Before Step 3

The base schema is applied and confirmed. Step 3 can add the transactional reservation RPC on top of this schema.
