# Real Payment Test Checklist

Use this checklist for one controlled low-value Mercado Pago payment test.

This is an operational test, not a new product feature. Do not use customer data, high values, or uncontrolled WhatsApp numbers.

## Scope

The test validates the real production path:

1. WhatsApp event search.
2. Event, sector, and seat selection.
3. Seat reservation.
4. Mercado Pago checkout generation.
5. Real low-value payment.
6. Mercado Pago webhook confirmation.
7. Ticket issuance.
8. WhatsApp ticket delivery.
9. Ticket URL opening.
10. Temporary gate session creation.
11. Gate scan allowed once.
12. Gate scan already-used on second read.

Do not test cancellation, ticket swaps, manual resend, reports, advanced admin panels, `wrong_event`, QR image/PDF generation, or seat-map flows in this run.

## Required Prefix

All temporary catalog records must use this prefix:

```text
TEST_REAL_PAYMENT_MVP
```

Use it in event title, artist name, venue name, section name, and any notes/labels that support cleanup.

## Required Value

Use a low value only:

```text
R$ 1,00
```

If Mercado Pago requires a higher minimum, use the smallest allowed amount. Do not use high-value prices for this test.

Example ticket price:

- `price_cents = 100`
- `fee_cents = 0`
- `currency = BRL`
- `ticket_type = full`

## Production Webhook Preconditions

Confirm in the Mercado Pago panel before payment:

- webhook URL is exactly:

```text
https://site-phi-seven-72.vercel.app/api/webhook/payment/mercado-pago
```

- the configured webhook secret matches `MERCADO_PAGO_WEBHOOK_SECRET` in Vercel Production;
- the webhook points to the stable production alias, not a preview deployment;
- Mercado Pago access token is the intended account/environment for the test;
- payment notifications for approved payments are enabled.

## Environment Preconditions

Vercel Production must contain these envs:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `ZAPI_BASE_URL`
- `ZAPI_INSTANCE_ID`
- `ZAPI_INSTANCE_TOKEN`
- `ZAPI_CLIENT_TOKEN`
- `ZAPI_WEBHOOK_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`
- `CHECKOUT_INTERNAL_SECRET`
- `TICKET_QR_SECRET`
- `GATE_SESSION_SECRET`
- `GATE_SESSION_TTL_MINUTES`
- `GATE_ADMIN_SECRET`
- `TICKET_RESERVATION_TTL_MINUTES`

`ZAPI_INSTANCE_TOKEN` is the provider token name used by this codebase. If an external checklist calls it `ZAPI_TOKEN`, map that value to `ZAPI_INSTANCE_TOKEN`.

No secret value should be copied into this document, committed to Git, or printed in logs.

## Manual Test Data

Create temporary Supabase data with the `TEST_REAL_PAYMENT_MVP` prefix.

Minimum data:

- one `venues` row, active;
- one `venue_sections` row, active, numbered seats enabled;
- one `seats` row, active, for example `A01`;
- one `events` row, status `published`;
- one future `event_sessions` row, status `sales_open`;
- one `session_seats` row, status `available`;
- one `ticket_prices` row:
  - `ticket_type = full`;
  - `label = Inteira`;
  - `price_cents = 100`;
  - `fee_cents = 0`;
  - `currency = BRL`;
  - `status = active`;
  - sales window null or active now.

Prefer creating this data manually in Supabase SQL Editor for the first real payment run. This avoids shipping a broad write script with service-role access.

## WhatsApp Flow

Use only a controlled WhatsApp number.

1. Send:

```text
TEST_REAL_PAYMENT_MVP
```

Expected: the test event appears as a numbered option.

2. Reply:

```text
1
```

Expected: available sectors appear.

3. Reply:

```text
1
```

Expected: available seats appear, including `A01` or the chosen test code.

4. Reply with the test seat code:

```text
A01
```

Expected:

- reservation is created;
- order is `pending_payment`;
- `session_seats.status = reserved`;
- WhatsApp reply says the seat is temporarily reserved.

5. Ask for payment:

```text
pagar
```

Expected:

- Mercado Pago checkout link is generated or reused;
- `payments.status = pending`;
- WhatsApp receives the checkout URL.

## Real Payment

Open the Mercado Pago checkout link and pay manually with the controlled account/card/payment method.

After payment approval:

- Mercado Pago webhook should be called;
- `confirm_paid_ticket_order` should confirm the order;
- reservation and order should become `paid`;
- `session_seats.status` should become `sold`;
- one ticket should be created with `status = issued`;
- WhatsApp should receive the signed ticket URL.

Do not manually mark orders paid.
Do not manually update tickets.
Do not manually update session seats.

## Ticket URL

Open the received `/tickets/{token}` URL.

Expected:

- public ticket page loads;
- only display-safe ticket data is shown;
- page does not mark the ticket used;
- page does not act as gate validation.

## Gate Session

From an authenticated admin session with `manage_gate`, open `Admin > Portaria > Check-in neste telefone` and select the controlled test event.

Expected:

- `gate_sessions` row is created;
- only `token_hash` is stored;
- admin receives a temporary gate link for the authenticated phone;
- the action is tied to a valid admin user/session rather than a phone allowlist.

Open the gate link on the controlled validator/admin device.

## Gate Validation

Scan or manually paste the ticket URL/token in the gate page.

Expected first read:

- API returns `allowed`;
- ticket becomes `used`;
- `tickets.used_at` is filled;
- `ticket_validation_events.result = allowed`;
- `ticket_validation_events.gate_session_id` is filled.

Expected second read:

- API returns `already_used`;
- `used_at` is preserved;
- a second validation event is created with `already_used`;
- UI counter increments refused/denied for the second read.

## Cleanup

After the test, remove only rows related to `TEST_REAL_PAYMENT_MVP`.

Recommended cleanup order:

1. `ticket_validation_events`
2. `gate_sessions`
3. `tickets`
4. `payments`
5. `payment_events`, if the event key can be safely tied to the test payment
6. `orders`
7. `reservation_items`
8. `reservations`
9. `session_seats`
10. `ticket_prices`
11. `event_sessions`
12. `events`
13. `seats`
14. `venue_sections`
15. `venues`
16. `whatsapp_messages`
17. `conversations`
18. `customers`, only if created solely for this test

Before deleting `customers`, confirm the phone belongs only to the controlled test.

Run a final search for:

```text
TEST_REAL_PAYMENT_MVP
```

Expected: no remaining temporary catalog rows.

## Safety Notes

- Do not automate the real payment.
- Do not commit `.env`.
- Do not print service-role keys, Mercado Pago tokens, Z-API tokens, checkout secrets, QR secrets, or gate secrets.
- Do not paste full signed ticket or gate tokens into logs/issues.
- Do not run cleanup without the `TEST_REAL_PAYMENT_MVP` prefix filter.
- Keep the payment amount low and controlled.
