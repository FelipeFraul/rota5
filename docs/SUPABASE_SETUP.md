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

Production was validated on the final Step 6 audit after deploy `dpl_Fp8WM8m433161qPx4ePWpi9EysNF`: the route exists in Vercel, is matched as `/api/webhook/payment/mercado-pago`, and returns `401 Unauthorized` for an unsigned POST.

Do not configure the Mercado Pago dashboard webhook until the production URL has been confirmed.

Final quality audit notes:

- `vercel.json` is intentionally minimal and only sets `"framework": "nextjs"`.
- Vercel project settings are Next.js, `npm run build`, and Next.js default output.
- `eslint.config.mjs` keeps the default Next.js/TypeScript rule sets and only ignores generated artifacts such as `.next`, `.vercel`, `node_modules`, `out`, and `dist`.
- Unsigned webhooks return `401` before parsing the body.
- `payment_events` rows with `processed_at = null` are retryable; processed rows are treated as duplicate.
- Definitive ignores such as non-approved payments, invalid references, and missing orders are marked processed without issuing tickets.
- Transient Mercado Pago/API/RPC failures are not marked processed, allowing retry.
- `npm audit` currently reports a moderate PostCSS advisory through `next`; the proposed fix requires `npm audit fix --force` and is not safe to apply automatically.

## Mercado Pago Checkout

The checkout creation route is:

`POST /api/checkout/mercado-pago`

Production URL:

`https://site-phi-seven-72.vercel.app/api/checkout/mercado-pago`

Required header:

- `x-checkout-secret: <CHECKOUT_INTERNAL_SECRET>`

Required environment variables:

- `CHECKOUT_INTERNAL_SECRET`
- `APP_BASE_URL`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## WhatsApp Admin Foundation

The WhatsApp admin foundation migration is:

`supabase/migrations/20260522000800_create_admin_users_and_sessions.sql`

It creates:

- `public.admin_users`
- `public.admin_sessions`

`admin_users` stores normalized admin phones, role, status, optional name, creator phone, and last login time. `admin_sessions` stores temporary backend admin sessions with status, expiration, and minimal non-sensitive metadata. No admin passphrase, raw token, or secret is stored in either table.

Apply the migration through Supabase CLI if the project is linked, or paste the SQL into the Supabase SQL Editor. Verification query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('admin_users', 'admin_sessions')
order by table_name;
```

Expected result: 2 rows.

Important indexes and constraints:

- `admin_users.phone` is unique, digits-only, and non-empty.
- `admin_users.role` is restricted to `root`, `admin`, `operator`, `gate`, `support`.
- `admin_users.status` is restricted to `active`, `disabled`.
- `admin_sessions.phone` is digits-only and non-empty.
- `admin_sessions.status` is restricted to `active`, `expired`, `revoked`.
- `admin_sessions.expires_at > created_at`.
- indexes exist for phone/status/role/expiration lookups.

Backend-only environment variables:

- `ADMIN_ROOT_WHATSAPP_PHONES`: comma-separated normalized root phones.
- `ADMIN_AUTH_SECRET_HASH`: PBKDF2-SHA256 hash of the admin passphrase.
- `ADMIN_SESSION_TTL_MINUTES`: temporary admin session TTL; default documented value is 60.

None of these variables may use a `NEXT_PUBLIC_` prefix. `.env.example` intentionally contains only empty placeholders, never a real passphrase or hash.

Generate the passphrase hash locally without committing the passphrase:

```bash
node -e "const crypto=require('crypto');const p=process.argv[1];const salt=crypto.randomBytes(16).toString('hex');const i=210000;const h=crypto.pbkdf2Sync(p,salt,i,32,'sha256').toString('hex');console.log('pbkdf2_sha256$'+i+'$'+salt+'$'+h)" 'TYPE_THE_PASSPHRASE_HERE'
```

Set only the resulting hash in `ADMIN_AUTH_SECRET_HASH`. Do not place the passphrase itself in `.env`, `.env.example`, docs, GitHub, logs, or database rows.

Admin WhatsApp behavior:

- `admin`, `adm`, and `administrador` are reserved and intercepted before event search.
- Unauthorized phones receive a neutral message and never see admin wording.
- A configured root phone sending `admin` is bootstrapped into `admin_users` with role `root` if missing.
- The next inbound message while `admin_auth_pending` is saved as `[ADMIN_AUTH_REDACTED]`.
- A valid passphrase creates an `admin_sessions` row and shows a permission-filtered menu.
- `sair`, `logout`, or `encerrar` revokes active admin sessions while inside the admin flow.

Role permissions currently used for menu visibility:

- `root`: admins, events, tickets, courtesies, gate, reports.
- `admin`: events, tickets, courtesies, gate, reports.
- `operator`: gate, tickets, reports.
- `gate`: gate.
- `support`: tickets.

This step does not implement CRUD events, courtesies, reports, cancellation, swaps, or destructive admin actions. Menu entries that are not implemented return a controlled “in construction” response.

Final pre-secret audit notes:

- `admin_users` and `admin_sessions` were confirmed in the real Supabase project after applying the migration.
- Behavioral constraint checks confirmed invalid admin phones, invalid roles, invalid statuses, invalid session statuses, and duplicate admin phones are blocked.
- The migration SQL defines the expected indexes for admin user/session phone, status, role, expiration, and admin user id lookups.
- The migration SQL defines the `set_admin_users_updated_at` trigger for `admin_users.updated_at`.
- Without `ADMIN_AUTH_SECRET_HASH`, passphrase verification returns false and admin login remains fail-closed.
- The admin passphrase hash format is `pbkdf2_sha256$iterations$salt$hash`; production must use a new passphrase that has never been shared outside the secret manager.
- The repository must not contain a real passphrase or real hash. Searches for sensitive terms should show only code/docs describing the mechanism and the redaction marker.
- Unauthorized `admin`, `adm`, and `administrador` messages receive a neutral buyer-facing response and do not enter event search.
- While the conversation is in `admin_auth_pending`, inbound passphrase messages are stored as `[ADMIN_AUTH_REDACTED]` and metadata is limited to `{ redacted: true, reason: "admin_auth" }` plus provider/message type identifiers.
- Production should be redeployed after adding `ADMIN_AUTH_SECRET_HASH`.

Request body:

```json
{
  "order_id": "uuid"
}
```

The route is internal-only for now. Without the checkout secret it returns `401` and does not read or mutate order state.

Processing rules:

- load the order with the service role;
- accept only `orders.status = pending_payment`;
- require an active, non-expired reservation;
- require at least one `reservation_items` row;
- build Mercado Pago items from frozen `reservation_items.price_cents` and `fee_cents`;
- block checkout with `checkout_amount_mismatch` if the item total differs from the order total plus fees;
- set `external_reference` to `ticket_order_<order_id>` if missing;
- set `notification_url` to `${APP_BASE_URL}/api/webhook/payment/mercado-pago`;
- set preference expiration to `reservation.expires_at`;
- create or reuse a pending `payments` row with `provider_preference_id`, `checkout_url`, amount, and minimal metadata.

Checkout reuse policy:

- reuse only after the order is still `pending_payment`, the reservation is still `active`, and `reservation.expires_at` is still in the future;
- reuse only a pending Mercado Pago payment for the same order that has both `provider_preference_id` and `checkout_url`;
- create a new Mercado Pago preference if there is no reusable pending payment;
- block instead of reuse when the order is not payable, the reservation is expired/not active, reservation items are missing, or totals diverge.

The route does not confirm payment, does not emit tickets, does not generate QR images, does not send WhatsApp messages, and does not alter seat state. The Mercado Pago webhook and `confirm_paid_ticket_order` remain responsible for payment confirmation and ticket issuance.

The checkout return pages are intentionally informational only. `/checkout/success` does not state that a ticket was issued or that payment is approved; final confirmation still depends on the Mercado Pago webhook.

Checkout test coverage used temporary Supabase data and mocked Mercado Pago preference creation:

- [x] Missing `x-checkout-secret` returns 401.
- [x] Wrong `x-checkout-secret` returns 401.
- [x] Invalid JSON body returns 400.
- [x] Missing `order_id` returns 400.
- [x] Unknown order returns `order_not_found`.
- [x] Paid/non-payable order does not create checkout.
- [x] Expired reservation does not create checkout.
- [x] Valid pending order creates a preference and persists a pending payment.
- [x] Repeating the same order reuses the existing pending checkout.
- [x] Repeating after reservation expiration does not reuse the checkout.
- [x] `notification_url` points to `/api/webhook/payment/mercado-pago`.
- [x] `external_reference` is `ticket_order_<order_id>`.
- [x] Preference expiration uses `reservation.expires_at`.
- [x] Item totals are checked against the order total plus fees.
- [x] Checkout creation does not create tickets.

The final Step 7 audit also confirmed that generated/payment metadata does not store access tokens, headers, secrets, or unnecessary personal data. Repository citation-artifact searches returned no matches. A controlled low-value Mercado Pago real checkout test is still pending; the current automated coverage mocks Mercado Pago preference creation to avoid creating live payment links during audit.

## Z-API WhatsApp Webhook

The WhatsApp webhook route is:

`POST /api/webhook/zapi`

Production URL when the provider can send custom headers:

`https://site-phi-seven-72.vercel.app/api/webhook/zapi`

Preferred header:

- `x-zapi-webhook-secret: <ZAPI_WEBHOOK_SECRET>`

Accepted alternative headers are `x-webhook-secret` and `Authorization: Bearer <secret>`.

If the Z-API panel does not support custom headers, configure the receive-message webhook URL with the secret query parameter:

```text
https://site-phi-seven-72.vercel.app/api/webhook/zapi?zapi_webhook_secret=<ZAPI_WEBHOOK_SECRET>
```

The fallback query parameter is accepted only for the Z-API webhook compatibility case. Do not paste this URL in public issues, logs, screenshots, or documentation with the real secret value.

Processing rules:

- reject missing or invalid webhook secrets with `401 Unauthorized`;
- reject oversized or invalid JSON payloads safely without logging the full body;
- defensively extract phone, contact name, text, provider message ID, group/from-me flags, and message type from common Z-API payload shapes;
- ignore group messages, messages sent by the account itself, payloads without phone, and payloads without text;
- normalize WhatsApp phone numbers to digits only before persisting;
- upsert `customers` by `whatsapp_phone`, updating `name` only when a non-empty new name is received;
- create or reuse one `open` conversation for the customer;
- save inbound WhatsApp messages with minimal metadata;
- if an inbound `provider_message_id` already exists, return duplicate and do not route or send another reply;
- call `routeTicketMessage` and update `conversations.context` with the router state;
- send the reply through Z-API using `sendZapiText`;
- save the outbound message even when Z-API sending fails, with minimal send-status metadata.

The route returns HTTP 200 after a persisted inbound message even if the outbound Z-API send fails, avoiding infinite webhook retries for a message the system already received. Logs include safe identifiers such as `providerMessageId`, `conversationId`, and masked phone information, but not tokens, webhook secrets, full payloads, or full message bodies.

The initial router reply is intentionally limited. It acknowledges receipt and prepares the conversation state for future steps, but it does not search real events, choose sessions/sectors/seats, create reservations, create checkout links, generate QR Codes, send tickets, or validate gate entry.

Z-API webhook test coverage used temporary Supabase data and mocked Z-API sending:

- [x] Missing secret returns 401.
- [x] Group payload returns `ignored: true` with reason `group`.
- [x] `fromMe` payload returns `ignored: true` with reason `from_me`.
- [x] Missing phone returns `ignored: true` with reason `missing_phone`.
- [x] Missing text returns `ignored: true` with reason `missing_text`.
- [x] Valid message creates/updates customer, creates/reuses conversation, saves inbound, routes, saves outbound, and calls mocked Z-API.
- [x] Duplicate inbound `provider_message_id` returns duplicate and does not send again.
- [x] New non-empty contact name updates `customers.name`.
- [x] Decorated phone input is stored and sent as digits only.
- [x] Temporary test data cleanup returned empty.

Current production idempotency uses both an early duplicate lookup and the partial unique index below. The unique index is the source of truth for concurrent duplicate protection.

Final Step 8 audit:

- local migration created: `supabase/migrations/20260522000500_add_whatsapp_inbound_message_id_unique_idx.sql`;
- migration applied manually in the Supabase SQL Editor and validated against the real database;
- intended index:

```sql
create unique index if not exists whatsapp_messages_inbound_provider_message_id_unique
on public.whatsapp_messages(provider_message_id)
where direction = 'inbound'
  and provider_message_id is not null;
```

- route code treats `23505` unique violations from inbound message insert as `{ received: true, duplicate: true }`;
- `raw_metadata` stores only provider, message ID/type, and send status/error metadata;
- failed Z-API sends after inbound persistence return HTTP 200 and save outbound metadata with `send_status = failed`;
- `conversations.last_message_at` is updated for valid inbound processing;
- `conversations.context` currently uses only the real `welcome` state;
- the initial reply does not promise event search, seat selection, payment, checkout, QR Code, or ticket delivery;
- no event search, reservation, checkout, QR, map, or gate validation was implemented in this step.

The migration was not applied automatically because `npx supabase db push` failed with an unlinked project and `npx supabase link` requires `SUPABASE_ACCESS_TOKEN` or `supabase login`. It was then applied manually in Supabase. Validation by behavior confirmed that duplicate inbound inserts fail with `23505`, and a concurrent webhook test confirmed exactly one inbound, one outbound, and one mocked Z-API send for two simultaneous calls with the same provider message ID.

Final Step 8 audit test coverage with mocked Z-API and temporary Supabase data:

- [x] Missing secret returns 401.
- [x] Group payload returns `ignored: true` with reason `group`.
- [x] `fromMe` payload returns `ignored: true` with reason `from_me`.
- [x] Missing phone returns `ignored: true` with reason `missing_phone`.
- [x] Missing text returns `ignored: true` with reason `missing_text`.
- [x] Valid message creates customer/conversation/inbound/outbound.
- [x] Sequential duplicate does not send again.
- [x] Concurrent duplicate protection allows only one inbound, one outbound, and one send.
- [x] Z-API send failure keeps HTTP 200 and stores outbound failure metadata.
- [x] `raw_metadata` excludes raw payloads, headers, tokens, secrets, and full message text.
- [x] Logs exclude full phone, body, and secrets.
- [x] Temporary test data cleanup returned empty.

## WhatsApp Event Search

Step 9 adds the first real WhatsApp search behavior. The router parses simple event-search messages and calls `searchEvents` in `src/lib/tickets/services/events.ts`.

Supported search inputs include:

- artist/title terms, such as `Ana Castela`;
- city phrases, such as `shows em Sorocaba` or `eventos em Campinas`;
- relative dates, such as `hoje`, `amanhã`, weekday names, and `fim de semana`;
- month names, such as `junho` or `julho`;
- numeric dates, such as `10/06` and `10/06/2026`.

Search rules:

- include only `events.status = published`;
- include only sessions with status `scheduled` or `sales_open`;
- include only sessions with `starts_at >= now()` unless a future date range is parsed;
- sort by `event_sessions.starts_at asc`;
- limit WhatsApp results to five options;
- return event title, artist, city/state, venue name, session ID, starts_at, and session status.
- avoid raw SQL string concatenation with user input; event candidates are fetched with the Supabase query builder and matched with normalized text in application code.

Date parsing rules:

- `hoje`, `amanhã`, weekdays, and weekend ranges are calculated in `America/Sao_Paulo`;
- if a weekday has already passed in the current week, the parser uses the next future occurrence;
- month searches use the current year when the month is still upcoming, otherwise the next year;
- numeric dates accept `dd/mm` and `dd/mm/yyyy`; `dd/mm` rolls to the next year if that day has already passed.

Conversation context after results is intentionally small:

```json
{
  "state": "showing_events",
  "step": "showing_events",
  "lastSearch": {
    "artist": "Ana Castela",
    "city": "Sorocaba",
    "dateFrom": "2026-06-01T03:00:00.000Z",
    "dateTo": "2026-07-01T03:00:00.000Z",
    "originalText": "Ana Castela em junho"
  },
  "lastEvents": [
    {
      "option": 1,
      "eventId": "...",
      "sessionId": "...",
      "title": "...",
      "startsAt": "..."
    }
  ]
}
```

Numeric replies while `state = showing_events` are acknowledged with a controlled message for the next step. This step does not choose a session, sector, or seat, does not reserve seats, does not create checkout, does not generate QR Codes, and does not validate gate entry.

Numeric selection rules:

- a valid number in the current `lastEvents` list returns a controlled next-step message only;
- a number outside the current list returns `Não encontrei essa opção. Responda com um número da lista.`;
- a number without `state = showing_events` and valid `lastEvents` asks the user to search first.

Step 9 test coverage used temporary Supabase data and mocked Z-API sending:

- [x] Generic `oi` returns guidance.
- [x] Artist search returns a published future event.
- [x] City search filters by city.
- [x] Weekday search filters by the expected date interval.
- [x] Month search filters by the expected month.
- [x] Draft events do not appear.
- [x] Cancelled sessions do not appear.
- [x] Past sessions do not appear.
- [x] No-result search returns helpful copy.
- [x] Result search saves `state = showing_events` and `lastEvents`.
- [x] Numeric follow-up returns a controlled next-step message without reserving or charging.
- [x] Temporary test data cleanup returned empty.

Final Step 9 audit coverage:

- [x] `Ana Castela em junho` treats `junho` as a date, not a city.
- [x] `eventos em 10/06` treats `10/06` as a date, not a city.
- [x] Artist/event names with removable-looking words, such as `Show do Milhão`, are preserved.
- [x] Events with multiple future sessions show distinguishable numbered options and save both `eventId` and `sessionId`.
- [x] Numeric selection outside the list is blocked without advancing state.
- [x] Numeric selection without event-list context asks for a search first.
- [x] Case-insensitive search works for lowercase and uppercase variants.
- [x] `showing_events` context stays lightweight and excludes descriptions, prices, raw metadata, or large objects.
- [x] Published/session/future filters exclude draft events, cancelled sessions, and past sessions.
- [x] Temporary data cleanup returned empty.

## WhatsApp Sector Listing

Step 10 turns a valid numeric event selection into a sector list for the selected session. This step starts only when `conversation.context.state = showing_events` and the number exists in the current `lastEvents` list.

Before listing sectors, the backend revalidates the selected option in Supabase:

- the event still exists and `events.status = published`;
- the session still exists for that event;
- the session status is `scheduled` or `sales_open`;
- `event_sessions.starts_at >= now()`;
- the session/event venue, when present, is not inactive.

If the option is stale, cancelled, or past, the user receives `Essa opção não está mais disponível. Faça uma nova busca.` and the context returns to `idle`.

Available sectors are calculated by `listAvailableSections(sessionId)` in `src/lib/tickets/services/sections.ts`:

- the venue for the section must be active;
- `venue_sections.status = active`;
- at least one `session_seats.status = available`;
- the linked structural `seats.status = active`;
- at least one `ticket_prices.status = active`;
- price window is active: `sales_start_at is null or <= now()` and `sales_end_at is null or >= now()`;
- prices and fees come only from `ticket_prices`, never from WhatsApp input or stale context.

The WhatsApp reply shows each sector as a numbered option with available seat count and price/fee. Availability is counted from `session_seats` joined to active structural seats before ticket prices are grouped, so a sector with 10 available seats and 2 active ticket types remains `availableSeatsCount = 10`, not 20. If a sector has one ticket type, it shows that label directly. If it has multiple ticket types, the reply shows `A partir de` using the ticket type with the lowest total paid amount (`price_cents + fee_cents`), while still displaying price and fee separately. Ticket types are ordered by that total, then by label and type for deterministic output.

The `showing_sections` context is intentionally lightweight:

```json
{
  "state": "showing_sections",
  "step": "showing_sections",
  "selectedEvent": {
    "eventId": "...",
    "sessionId": "...",
    "title": "...",
    "startsAt": "...",
    "city": "...",
    "state": "...",
    "venueName": "..."
  },
  "lastSections": [
    {
      "option": 1,
      "sectionId": "...",
      "sectionName": "Pista Premium",
      "hasNumberedSeats": true,
      "availableSeatsCount": 120,
      "minPriceCents": 12000,
      "minFeeCents": 1200,
      "ticketTypes": [
        {
          "ticketPriceId": "...",
          "ticketType": "full",
          "label": "Inteira",
          "priceCents": 12000,
          "feeCents": 1200,
          "currency": "BRL"
        }
      ]
    }
  ]
}
```

Numeric replies while `state = showing_sections` are controlled only:

- valid sector number: `Perfeito. No próximo passo vou te mostrar os assentos disponíveis desse setor.`;
- invalid sector number: `Não encontrei essa opção. Responda com um número da lista.`;
- no seat list, reservation, checkout, QR Code, map, or gate validation is performed in this step.
- the next reservation step must revalidate selected section, seat, ticket price, and availability in the database before calling `reserve_seats`; `showing_sections` context is only a conversation guide.

Step 10 test coverage used temporary Supabase data and the real compiled webhook route, with Z-API pointed to a non-real audit URL and full cleanup:

- [x] Valid event selection lists available sectors and moves context to `showing_sections`.
- [x] Number outside the event list is blocked and does not advance context.
- [x] Cancelled session after search is blocked.
- [x] Past session is blocked.
- [x] Active sector with available seats and active price appears.
- [x] Sector without available seats does not appear.
- [x] Sector without active price does not appear.
- [x] Price outside `sales_start_at`/`sales_end_at` does not appear.
- [x] Multiple ticket types show `A partir de` correctly.
- [x] `showing_sections` context stays lightweight with `selectedEvent` and `lastSections`.
- [x] Numeric reply while `showing_sections` is controlled and does not reserve.
- [x] Temporary test data cleanup returned empty.

Final Step 10 audit coverage:

- [x] `showing_events` context is used only to identify `eventId` and `sessionId`; status, availability, and price are revalidated from Supabase.
- [x] Event/session revalidation blocks missing, unpublished, cancelled, non-sales, past, or inactive-venue options.
- [x] Sectors require active venue, active section, available session seat, active structural seat, and active price in the sales window.
- [x] Inactive structural seats do not make a sector appear.
- [x] Blocked structural seats do not make a sector appear.
- [x] Inactive venues do not list sectors.
- [x] 10 available seats with 2 active ticket prices still returns `availableSeatsCount = 10`.
- [x] Ticket types are ordered deterministically by cheapest total, then label/type.
- [x] `A partir de` uses the lowest `price_cents + fee_cents` total and displays price/tax separately.
- [x] Invalid numeric replies in `showing_sections` are blocked without reserving.
- [x] A session with no visible sectors returns a clear message and resets to `idle` with empty `lastSections`.
- [x] `showing_sections` context remains lightweight and does not include seat lists or bulky objects.
- [x] Temporary test data cleanup returned empty.

## WhatsApp Seat Listing

Step 11 turns a valid numeric sector selection into a short list of available seats for that sector. This step starts only when `conversation.context.state = showing_sections` and the number exists in the current `lastSections` list.

The context is still only a guide. Before showing seats, the backend revalidates:

- the event exists and `events.status = published`;
- the session exists for that event;
- the session status is `scheduled` or `sales_open`;
- `event_sessions.starts_at >= now()`;
- the session/event venue is active;
- the selected section belongs to the validated venue;
- `venue_sections.status = active`;
- the section has an active ticket price for the same session inside the current sales window;
- the section still has availability.

Available seats are calculated by `listAvailableSeats({ sessionId, sectionId })` in `src/lib/tickets/services/seats.ts`:

- `session_seats.session_id = sessionId`;
- `session_seats.section_id = sectionId`;
- `session_seats.seat_id` is joined to `seats.id`;
- structural `seats.section_id = sectionId`;
- `session_seats.status = available`;
- linked structural `seats.status = active`;
- linked `venue_sections.status = active`;
- linked venue status is active.

Seats are ordered predictably by `row_label`, then numeric `seat_number` when possible, then textual `seat_number` and `seat_code`, so `A10` does not sort before `A2` when `seat_number` is numeric. WhatsApp output and `lastSeats` context are limited to 20 seats. If more seats are available, the reply says `Mostrando os primeiros 20 assentos disponíveis.` The database read uses a bounded candidate window rather than loading the full inventory, so the router can apply natural ordering without pulling every seat in large sections. A future seat-map step can offer a better large-inventory browsing experience.

The `showing_seats` context is intentionally lightweight:

```json
{
  "state": "showing_seats",
  "step": "showing_seats",
  "selectedEvent": {
    "eventId": "...",
    "sessionId": "...",
    "title": "...",
    "startsAt": "...",
    "city": "...",
    "state": "...",
    "venueId": "...",
    "venueName": "..."
  },
  "selectedSection": {
    "sectionId": "...",
    "sectionName": "Pista Premium",
    "hasNumberedSeats": true,
    "availableSeatsCount": 120
  },
  "lastSeats": [
    {
      "sessionSeatId": "...",
      "seatId": "...",
      "seatCode": "A03",
      "rowLabel": "A",
      "seatNumber": "03"
    }
  ]
}
```

No price, checkout, full seat map, payload, or bulky Supabase object is used as a source of truth in this context. The next reservation step must revalidate seat, section, price, and availability again before calling `reserve_seats`.

Numeric replies while `state = showing_sections` now behave as follows:

- invalid sector number: `Não encontrei esse setor. Responda com um número da lista.`;
- stale/unavailable sector: `Esse setor não está mais disponível. Escolha outro setor ou faça uma nova busca.`;
- numbered sector with seats: list up to 20 seat codes and move to `showing_seats`;
- unnumbered sector: `Esse setor não tem assento marcado. No próximo passo você poderá escolher a quantidade de ingressos.`

Unnumbered sectors intentionally stay in `showing_sections` with `selectedSection` and empty `lastSeats`; they do not enter `showing_seats` with an empty seat list, avoiding an ambiguous state.

Seat-code replies while `state = showing_seats` are controlled only:

- valid code in `lastSeats`: acknowledge the seat and say reservation comes in the next step;
- invalid code: `Não encontrei esse assento na lista. Escolha um dos códigos enviados.`;
- no `reserve_seats`, reservation, checkout, QR Code, map, or gate validation is performed in this step.

Seat-code comparison is normalized by removing spaces and hyphens and converting to uppercase. Examples accepted for `A03`: `a03`, `A 03`, and `A-03`.

Step 11 test coverage used temporary Supabase data and the real compiled webhook route, with Z-API pointed to a non-real audit URL and full cleanup:

- [x] Valid sector selection lists seats and moves context to `showing_seats`.
- [x] Sector number outside the list is blocked.
- [x] Cancelled session after sector listing is blocked.
- [x] Inactive venue is blocked.
- [x] Inactive section is blocked.
- [x] `session_seats.available` plus `seats.active` seats appear.
- [x] `session_seats.reserved`, `sold`, and `blocked` seats do not appear.
- [x] `seats.inactive` and structural `seats.blocked` seats do not appear.
- [x] The 20-seat WhatsApp limit is applied.
- [x] `showing_seats` context stays lightweight.
- [x] Valid seat-code reply is controlled and does not reserve.
- [x] Seat code outside the list is blocked.
- [x] Unnumbered sections use the controlled future-quantity message and do not reserve.
- [x] Temporary test data cleanup returned empty.

Final Step 11 audit coverage:

- [x] `lastSeats` is only a conversation guide; it is not treated as definitive availability.
- [x] The next reservation step is documented as requiring full revalidation before `reserve_seats`.
- [x] Seat listing is bound to selected session and selected section, including structural `seats.section_id`.
- [x] Seats from another section do not appear.
- [x] Seats from another session do not appear.
- [x] `reserved`, `sold`, `blocked`, `inactive`, and structurally blocked seats do not appear.
- [x] Event/session/venue/section/price/availability are revalidated before listing seats.
- [x] Natural ordering keeps `A1`, `A2`, `A10` in the expected order.
- [x] Output and context expose at most 20 seats and include the limit notice when more are available.
- [x] The query uses a bounded candidate window instead of loading a full large section inventory before slicing.
- [x] Unnumbered sections remain non-ambiguous and do not enter `showing_seats` with an empty list.
- [x] `a03`, `A 03`, and `A-03` match `A03`.
- [x] Valid seat-code replies do not create reservations, orders, checkout, tickets, or `session_seats` updates.
- [x] Invalid seat-code replies are blocked without advancing.
- [x] `showing_seats` context stays lightweight and excludes map fields, payloads, prices as source of truth, and bulky objects.
- [x] Temporary test data cleanup returned empty.

## WhatsApp Seat Reservation

Step 12 turns a valid seat-code reply in `showing_seats` into a real temporary reservation by calling the existing audited RPC `public.reserve_seats`. No manual reservation writes are performed in the application code.

Before attempting a new reservation, the backend checks whether the same customer already has a reservation with:

- `reservations.status = active`;
- `reservations.expires_at > now()`;
- a linked `orders.status = pending_payment`.

If that record exists, the router does not call `reserve_seats`, moves the conversation back into a safe `reservation_created` state with the active reservation/order IDs, and replies that the user already has a reservation in progress. This protects stale contexts, repeated messages, and new open conversations from creating multiple unpaid reservations automatically.

Before calling the RPC, the backend revalidates:

- event exists and `events.status = published`;
- session exists for the event, is future, and status is `scheduled` or `sales_open`;
- venue is active;
- section is active, belongs to the validated venue, has active price, and still has availability;
- seat exists, belongs to the selected section, and `seats.status = active`;
- session seat exists for the selected session and seat;
- `session_seats.status = available`;
- ticket price for the selected session/section/type is active and inside the sales window.

The reservation service is `reserveSelectedSeat` in `src/lib/tickets/services/reservations.ts`. It calls:

```ts
supabase.rpc("reserve_seats", {
  p_customer_id,
  p_conversation_id,
  p_session_id,
  p_seat_ids: [seatId],
  p_ticket_type: "full",
  p_ttl_minutes: TICKET_RESERVATION_TTL_MINUTES
})
```

Ticket type defaults to `full` in this step. Half-price and promotional ticket selection will come later. If there is no active `full` price for the selected section, the user receives a safe message and no reservation is created.

After success, the conversation context moves to `reservation_created`:

```json
{
  "state": "reservation_created",
  "step": "reservation_created",
  "selectedEvent": {
    "eventId": "...",
    "sessionId": "...",
    "title": "...",
    "startsAt": "...",
    "city": "...",
    "state": "...",
    "venueId": "...",
    "venueName": "..."
  },
  "selectedSection": {
    "sectionId": "...",
    "sectionName": "Pista Premium",
    "hasNumberedSeats": true,
    "availableSeatsCount": 120
  },
  "selectedSeat": {
    "seatId": "...",
    "seatCode": "A03"
  },
  "reservation": {
    "reservationId": "...",
    "orderId": "...",
    "expiresAt": "...",
    "totalAmountCents": 12000,
    "totalFeeCents": 1200,
    "currency": "BRL"
  }
}
```

The response tells the user that the seat is reserved temporarily, shows event/sector/seat, price plus fee, expiration time, and says the payment link will come in the next step. It does not say the ticket is guaranteed.

Known reservation errors are mapped to safe user messages:

- active pending reservation already exists: `Você já tem uma reserva em andamento. No próximo passo vamos gerar o link de pagamento ou permitir cancelar/trocar.`
- `seat_not_available`: `Esse assento acabou de ficar indisponível. Escolha outro assento.`
- missing or stale seat before RPC: `Esse assento não está mais disponível. Escolha outro assento ou faça uma nova busca.`
- `ticket_price_not_found`: `Não encontrei preço ativo para esse setor no momento. Escolha outro setor ou tente mais tarde.`
- `session_not_available`: `Essa sessão não está mais disponível. Faça uma nova busca.`
- `customer_not_found` or `conversation_not_found`: generic retry-safe message without exposing SQL details.
- generic failures: `Não consegui reservar esse assento agora. Tente novamente em instantes.`

If the context is already `reservation_created`, new seat messages do not create another reservation. The user receives a controlled message saying the next step will generate payment or allow cancel/swap. The database-level active-reservation check provides the same protection even when the context is stale or absent.

This step intentionally does not:

- call Mercado Pago checkout;
- create `payments`;
- create tickets;
- generate QR Codes;
- send payment links;
- render maps;
- perform gate validation.

Step 12 test coverage used temporary Supabase data and the real compiled webhook route, with Z-API pointed to a non-real audit URL and full cleanup:

- [x] Valid seat code calls `reserve_seats`, creates active reservation and pending order, and marks the session seat reserved.
- [x] Code outside `lastSeats` does not call the RPC and does not reserve.
- [x] `a03`, `A 03`, and `A-03` normalize and reserve.
- [x] Seat changed to reserved between listing and choice is blocked.
- [x] Cancelled session is blocked.
- [x] Inactive seat is blocked.
- [x] Missing active `full` price returns a friendly message.
- [x] `seat_not_available` returns a friendly message.
- [x] No payment or ticket is created in this step.
- [x] Existing active reservation plus pending order blocks another automatic reservation.
- [x] `reservation_created` context blocks another automatic reservation.
- [x] Concurrent same-seat attempts result in exactly one reservation winner.
- [x] The losing concurrent request does not receive a success message.
- [x] Temporary test data cleanup returned empty.

## WhatsApp Checkout Link

Step 13 generates or reuses a Mercado Pago checkout link after a WhatsApp reservation exists. The core checkout logic now lives in `src/lib/tickets/services/checkout.ts`; the protected API route `POST /api/checkout/mercado-pago` and the WhatsApp router both call this same service, so validation and payment persistence do not diverge.

Conversational triggers while `context.state = reservation_created` or `payment_pending` include:

- `pagar`;
- `pagamento`;
- `link`;
- `gerar link`;
- `sim`;
- `continuar`;
- short/simple replies after the reservation.

Before a checkout link is created or resent, the backend revalidates:

- reservation exists;
- `reservation.customer_id` matches the WhatsApp customer;
- `reservation.status = active`;
- `reservation.expires_at > now()`;
- order exists and matches the context order ID;
- `order.reservation_id = reservation.id`;
- `order.customer_id` matches the WhatsApp customer;
- `order.status = pending_payment`;
- reservation has items;
- each item still has a matching `session_seats` row with `status = reserved`;
- each related `session_seats.current_reservation_id = reservation.id`.

If any of those checks fail, the router replies that the reservation is no longer available and resets the context to `idle`. Expired reservations do not generate checkout links.

The checkout service creates or reuses a `payments` row with:

- `provider = mercado_pago`;
- `provider_preference_id`;
- `status = pending`;
- `amount_cents` from the order total;
- `currency = BRL`;
- public `checkout_url`;
- minimal `raw_metadata` containing provider/preference/external reference/notification URL/expiration.

The WhatsApp context moves to `payment_pending`:

```json
{
  "state": "payment_pending",
  "step": "payment_pending",
  "selectedEvent": { "eventId": "...", "sessionId": "...", "title": "..." },
  "selectedSection": { "sectionId": "...", "sectionName": "..." },
  "selectedSeat": { "seatId": "...", "seatCode": "A03" },
  "reservation": {
    "reservationId": "...",
    "orderId": "...",
    "expiresAt": "...",
    "totalAmountCents": 12000,
    "totalFeeCents": 1200,
    "currency": "BRL"
  },
  "payment": {
    "provider": "mercado_pago",
    "checkoutUrl": "https://...",
    "preferenceId": "...",
    "amountCents": 13200,
    "currency": "BRL"
  }
}
```

The checkout URL is safe to store because it is sent to the customer. No access token, webhook secret, service role key, payment event payload, QR token, or bulky Mercado Pago response is stored in conversation context.

The user-facing response says the link was generated, shows event/sector/seat when available, shows the total amount, sends the public payment URL, and explains that the ticket will be emitted only after Mercado Pago confirmation. The webhook `confirm_paid_ticket_order` remains the only path that confirms payment and issues tickets.

This step intentionally does not:

- mark orders paid;
- call `confirm_paid_ticket_order`;
- create tickets;
- generate QR Codes;
- send ticket PDFs/images;
- render maps;
- perform gate validation;
- cancel or swap reservations.

Step 13 tests used temporary Supabase data and a mocked Mercado Pago preference endpoint, with full cleanup:

- [x] `reservation_created` plus `pagar` revalidates reservation/order, creates checkout, persists pending payment, moves context to `payment_pending`, and replies with checkout URL.
- [x] Expired reservation does not create checkout and resets context to `idle`.
- [x] Non-`pending_payment` order does not create checkout.
- [x] Session seat no longer reserved for the reservation does not create checkout.
- [x] Repeating `pagar` for the same reservation reuses the existing checkout.
- [x] `payment_pending` plus `link` resends the existing checkout while the reservation is active.
- [x] Expired `payment_pending` does not resend the link.
- [x] Checkout does not create tickets, QR Codes, a new reservation, or manual `session_seats` mutations.
- [x] `POST /api/checkout/mercado-pago` remains protected: missing or wrong `x-checkout-secret` returns `401`.
- [x] Temporary test data cleanup returned empty.

Final Step 13 audit coverage:

- [x] `createCheckoutForReservation` is the only checkout core used by both WhatsApp and `POST /api/checkout/mercado-pago`.
- [x] `sim` outside `reservation_created` or `payment_pending` does not generate checkout.
- [x] Expired `payment_pending` does not resend an old link and resets context safely.
- [x] `paid`, `expired`, `cancelled`, or other non-`pending_payment` orders cannot create a new pending payment.
- [x] A pending Mercado Pago payment belonging to another order is not reused.
- [x] A reservation with multiple items is blocked if any related `session_seat` is not still reserved for that reservation.
- [x] Divergence between frozen item totals and order total blocks checkout.
- [x] Mercado Pago preference failure returns a safe message and does not create tickets, mark orders paid, create QR Codes, or alter seat reservations.
- [x] `payment_pending` context contains only selected event/section/seat, reservation, and public payment link metadata; it does not store tokens, secrets, raw responses, QR data, or raw payloads.
- [x] Payment messages do not say the ticket is already emitted, guaranteed, or confirmed; they state that issuance depends on Mercado Pago confirmation.
- [x] Temporary scripts and data were removed after the audit.

Policy after audit:

- Reuse checkout only when the reservation is still `active`, not expired, the order is still `pending_payment`, and an existing `payments` row for the same order has `provider = mercado_pago`, `status = pending`, `provider_preference_id`, and `checkout_url`.
- Create a new Mercado Pago preference only when no reusable pending checkout exists for that same order.
- Block checkout when the reservation is expired/stale, order is not payable, reservation items are missing or no longer reserved, or totals do not match.
- Payment is confirmed only by the Mercado Pago webhook and `confirm_paid_ticket_order`.
- QR Code, ticket delivery, PDF/image generation, map rendering, gate validation, cancellation, and reservation swap remain out of scope for this step.
- A controlled low-value real Mercado Pago checkout/payment test is still pending; audit tests used a mocked Mercado Pago preference endpoint to avoid creating real payment links.

## WhatsApp Ticket Delivery After Payment

Step 14 sends ticket information to the customer by WhatsApp after Mercado Pago confirms an approved payment and `public.confirm_paid_ticket_order` succeeds.

### QR/token strategy

The current RPC intentionally does not store raw QR tokens. It writes only `tickets.qr_token_hash`:

```sql
encode(digest(gen_random_uuid()::text || clock_timestamp()::text || ri.id::text, 'sha256'), 'hex')
```

That means:

- the RPC does not return a raw QR token;
- the webhook cannot reconstruct a raw token from `qr_token_hash`;
- re-sending a QR from that hash alone is impossible.

Step 14 keeps `qr_token_hash` untouched and adds a practical signed URL strategy:

```text
APP_BASE_URL/tickets/{payload.signature}
```

The payload contains:

```json
{
  "tid": "ticket_id",
  "code": "ticket_code"
}
```

The signature is HMAC SHA-256 over the base64url payload using `TICKET_QR_SECRET`. The raw secret is never logged, sent, or stored. The signed token is deterministic, so the system can resend the same ticket URL later without saving token plaintext.

### Ticket delivery flow

After the Mercado Pago webhook verifies signature, fetches the real approved payment, validates the external reference, and calls `confirm_paid_ticket_order`, it now:

- checks the RPC response;
- skips WhatsApp delivery when the RPC returns `idempotent = true`;
- loads issued tickets for the paid order;
- creates signed ticket URLs;
- sends one WhatsApp text message with ticket details and links.

The message includes event, date, venue/city/state, section, seat, ticket code, and the signed ticket URL. It says the ticket will be validated at the entrance. It does not mark the ticket as used and does not implement gate validation.

The page `src/app/tickets/[token]/page.tsx` validates the signed token, loads only `issued` tickets, and shows a simple safe ticket page. The page receives only display-safe fields: event, date, venue/city/state, section, seat, and ticket code. It does not receive or render phone, document, email, order id, payment id, customer id, `qr_token_hash`, or raw metadata. It does not mark the ticket used and is not a gate validation panel.

Invalid tokens are handled as a safe invalid-ticket page. This includes malformed tokens, payload tampering, signature tampering, and well-formed tokens for nonexistent tickets. The signature check uses HMAC SHA-256 with `TICKET_QR_SECRET` and constant-time comparison. `TICKET_QR_SECRET` is required server-side and must not have a production default.

### Idempotency and failure policy

- Already processed `payment_events` still return duplicate and do not resend tickets.
- A new webhook for an order that is already paid can make the RPC return `idempotent = true`; in that case the webhook does not resend tickets automatically.
- If tickets are issued but Z-API delivery fails, the webhook logs a safe warning and still returns success to avoid retrying financial confirmation indefinitely.
- Manual resend of tickets is a future step.

Step 14 does not:

- implement gate validation;
- mark tickets as used;
- create PDF/image tickets;
- send QR images;
- implement cancellation or ticket swap;
- store raw QR tokens.

Step 14 tests used temporary Supabase data with Mercado Pago and Z-API mocked:

- [x] Approved payment calls the RPC, creates tickets, and sends a WhatsApp message with ticket URL.
- [x] Pending payment does not send a ticket.
- [x] Duplicate processed payment event does not resend.
- [x] Already-paid/idempotent order does not duplicate tickets and does not resend automatically.
- [x] Two tickets in one order are listed in the WhatsApp message.
- [x] Z-API failure after ticket issuance does not roll back tickets and returns a safe webhook response.
- [x] Signed token validates, does not contain `TICKET_QR_SECRET`, and URL uses `APP_BASE_URL`.
- [x] `/tickets/[token]` builds successfully.
- [x] Payment event metadata does not store QR secret or Mercado Pago access token.
- [x] Temporary test data cleanup returned empty.

Final Step 14 audit additionally confirmed:

- [x] Tampered payload tokens are invalid.
- [x] Tampered signature tokens are invalid.
- [x] Well-formed tokens for nonexistent tickets are invalid.
- [x] The public ticket page does not expose phone, document, payment id, order id, customer id, or `qr_token_hash`.
- [x] Delivery uses `customers.whatsapp_phone` from the paid order/customer relationship, not Mercado Pago payload phone data.
- [x] Duplicate processed webhook events do not resend tickets.
- [x] RPC `idempotent = true` does not resend tickets automatically.
- [x] Z-API failure after ticket issuance does not undo payment/tickets and does not force infinite Mercado Pago retries.
- [x] Logs and metadata do not contain `TICKET_QR_SECRET` or full signed ticket URLs.
- [x] Multi-ticket WhatsApp messages remain organized and do not claim gate validation.

## Step 15 - Gate Sessions And Scanner Shell

Step 15 creates the temporary gate access structure without validating tickets definitively yet.

### Database

Migration:

```text
supabase/migrations/20260522000600_create_gate_sessions.sql
```

Creates `public.gate_sessions` with:

- optional `event_id` and `session_id` scope;
- `gate_label`;
- normalized digit-only `validator_phone`;
- optional `validator_name`;
- unique `token_hash`;
- `status` in `active`, `revoked`, `expired`;
- `expires_at`;
- normalized digit-only `created_by_admin_phone`;
- `created_at` and `updated_at` maintained by the existing `public.set_updated_at()` trigger.

The raw gate session token is never stored. Only `token_hash = sha256(raw signed token)` is persisted.

Supabase status for this migration:

- `npx supabase db push` was attempted and failed because this checkout has no Supabase project ref.
- `npx supabase projects list` was attempted and failed because no `SUPABASE_ACCESS_TOKEN` is available.
- The migration was then applied manually in the real Supabase project.
- Follow-up validation with temporary data confirmed that `gate_sessions` exists, active sessions can be inserted with `token_hash` only, phone constraints reject non-digit validator/admin phones, revoked status is stored/queryable, and cleanup removed all temporary rows.

### Environment

New environment variables:

```text
GATE_SESSION_SECRET=
GATE_SESSION_TTL_MINUTES=480
```

`GATE_SESSION_SECRET` signs temporary portaria links and is separate from `GATE_ADMIN_SECRET`. It must have at least 32 characters and must not be public. `GATE_SESSION_TTL_MINUTES` controls the default lifetime; current production configuration uses 480 minutes.

### Gate Token Strategy

The gate session URL is:

```text
APP_BASE_URL/gate/session/{payload.signature}
```

Payload:

```json
{
  "gid": "gate_session_id",
  "phone": "validator_phone",
  "exp": "expires_at"
}
```

The signature is HMAC SHA-256 over the base64url payload using `GATE_SESSION_SECRET`, checked with constant-time comparison. The token payload intentionally excludes admin phone, secrets, event details, and bulky metadata.

### WhatsApp Admin Flow

Authenticated WhatsApp admins receive a permission-filtered main menu and can enter submenus for Events, Orders/Tickets, Courtesies, Gate, Admin Users, and Reports according to their role. Each submenu has `Voltar` and `Sair`; `menu` returns to the main menu, `voltar` returns one level, and `sair`/`logout`/`encerrar` revokes the active admin session. Admin navigation also accepts unique area names from any admin submenu; for example, typing `evento` while viewing gate options switches back to the event area.

Numbers are always interpreted relative to the current screen only. An admin inside `Portaria`, `Eventos`, or any nested event flow cannot jump to another main area by typing that area's main-menu number; to switch areas, the admin must type the area word such as `evento`, `ingresso`, `cortesia`, `portaria`, `administrador`, or `relatorio`.

The submenu states are:

```text
admin_events_menu
admin_orders_menu
admin_courtesies_menu
admin_gate_menu
admin_users_menu
admin_reports_menu
```

The gate submenu option `1. Check-in neste telefone` creates a temporary gate session for the same WhatsApp phone that is authenticated in the admin flow and replies in that same conversation with the scanner link. The `Eventos` submenu is also operational for `root` and `admin` roles; other administrative areas still return controlled construction messages until their workflows are implemented.

The current admin menu path is:

```text
admin
4. Portaria
1. Check-in neste telefone
```

The old direct `portaria telefone` command is not the menu guidance for check-in. The operational admin flow keeps the user in the same WhatsApp conversation after authentication and does not ask the admin to send a link to any fixed number.

### WhatsApp Admin Events Module

The `Admin > Eventos` module is backend-only and available only to roles with `manage_events` (`root` and `admin`). `operator`, `gate`, and `support` receive the controlled unavailable message and cannot enter the event flows.

Implemented event actions:

- list events, five per page, with status, city/state, session count, and next session;
- show event details with sessions and sections;
- create event with title, artist, city, UF, venue, first session date/time, and initial status;
- reuse an existing venue by name/city/UF or create a new active venue;
- edit event title, artist, city/UF, venue, and status;
- return event to `draft` to remove it from publication, publish, or cancel by status change only, never physical deletion;
- list, create, edit date/status, open/close sales, and cancel event sessions;
- list, create, and edit venue sections;
- create structural seats by manual list or simple range;
- block/unblock structural seats by status;
- create missing `session_seats` for a selected session and section/all sections;
- list, create, edit, activate, and deactivate ticket prices/lots.

Event menu behavior:

- `1. Listar eventos`: shows up to 5 events per page, ordered by the next future session and then creation time. It includes status, city/UF, session count, and next future session. `mais` advances only when there is another page; otherwise the admin receives a safe end-of-pagination message. Selecting an item shows details, sessions, sections, and action options.
- `2. Criar evento`: collects title, artist, city, UF, venue, cover photo, first session date/time, initial status (`draft` or `published`), and the initial entry/section model before final confirmation. The photo step accepts a WhatsApp image or a public `https://...` URL. Draft events may skip the photo, but `published` events cannot be created without one. The entry model step supports: one unnumbered entry with capacity, multiple unnumbered entries/sections with capacities, or numbered-seat sections. Unnumbered entries create internal inventory units and `session_seats` as `available` so capacity can be reserved; numbered-seat sections are created immediately, while the actual seats are registered later in `Setores e assentos`. It reuses an existing venue by name/city/UF or creates an active venue. `published` creates the first session as `sales_open`; `draft` creates it as `scheduled`. Prices are not created by this flow. If first-session or initial-section creation fails, the event remains as `draft`; no physical rollback delete is performed.
- `3. Editar evento`: edits title, artist, city/UF, venue, cover photo, or status after a confirmation summary. Venue creation/reuse happens only after confirmation. Publishing is blocked until a cover photo exists. Setting status to `cancelled` requires `CANCELAR EVENTO`.
- `4. Pausar/ativar evento`: the schema has no `paused` status. “Pausar vendas” means returning the event to `draft`, which removes it from buyer search/sales because the sales flow only uses `published` events. `draft` can be published only after a cover photo is registered, and cancellation is a status change only. `cancelled` and `finished` are not reactivated from this menu.
- `5. Sessões e datas`: lists sessions with date/time, status, local, section count, and price count. Creating a session accepts only `scheduled` or `sales_open` and does not create `session_seats`. Opening/closing sales uses `scheduled`, `sales_open`, or `sales_closed`. Cancelling a session requires `CANCELAR SESSÃO`. Changing session date/time is blocked when reservations or tickets already exist.
- `6. Setores e assentos`: lists sections with slug, capacity, numbered-seat flag, status, structural seat count, and session-seat count. It creates sections with normalized unique slugs, edits safe fields, creates manual/range structural seats only for numbered sections, blocks/inactivates seats only when they are not reserved or sold in any session, and creates missing `session_seats` as `available` without touching existing `reserved`, `sold`, or `blocked` rows.
- `7. Preços e lotes`: lists prices for all sessions with session, section, ticket type, label, price, fee, sale window, and status. It creates active `BRL` prices with optional sale start/end dates, converts decimal strings such as `10,90` and `10.90` to cents, maps `promo/courtesy` aliases to schema values, respects the unique `(session_id, section_id, ticket_type)` constraint, edits label/price/fee/window/status, and never deletes a price.

All mutating paths require confirmation before writing. Normal writes require `CONFIRMAR`; event and session cancellation require explicit cancellation text. The module does not alter payments, orders, reservations, tickets, ticket validation, or Mercado Pago state. Existing sold/reserved session seats are not overwritten when creating missing `session_seats`.

Backend service organization:

- `src/lib/tickets/services/adminEvents.ts`: shared event catalog types, event create/list/detail/update, venue reuse, and shared parse helpers.
- `src/lib/tickets/services/adminSessions.ts`: session create/update and session usage/catalog count helpers.
- `src/lib/tickets/services/adminSections.ts`: section list/create/update and section usage helpers.
- `src/lib/tickets/services/adminSeats.ts`: structural seat parsing/create/update and missing `session_seats` helpers.
- `src/lib/tickets/services/adminPrices.ts`: price list/create/update and money parser export.

Parser helpers used by the module:

- `parseBrazilianDateTime`
- `parseMoneyToCents`
- `normalizeSlug`
- `parseSeatCodes`
- `parseSeatRange`
- `parseSeatCodesOrRange`

Menu/message renderers in the router include:

- `renderAdminEventsMenu`
- `renderAdminEventDetails`
- `renderAdminSessionsMenu`
- `renderAdminSectionsMenu`
- `renderAdminPricesMenu`

Supported admin event states include:

```text
admin_events_menu
admin_events_list
admin_event_detail
admin_event_create_collecting
admin_event_create_confirm
admin_event_edit_menu
admin_event_edit_collecting
admin_event_edit_confirm
admin_event_status_select
admin_event_status_confirm
admin_event_sessions_menu
admin_event_session_create_collecting
admin_event_session_edit_collecting
admin_event_sections_menu
admin_event_section_create_collecting
admin_event_seats_create_collecting
admin_event_session_seats_confirm
admin_event_prices_menu
admin_event_price_create_collecting
admin_event_price_edit_collecting
```

Input is parsed and validated server-side. Dates use the Brazilian format `DD/MM/YYYY HH:mm`; money values are converted to cents before storage; slugs are normalized; seat lists accept comma-separated codes or simple ranges. Errors returned to WhatsApp are controlled and do not expose SQL details.

The final module audit created and removed real temporary data with prefix `TEST_ADMIN_EVENTS_FLOW`. It confirmed that catalog writes stay scoped to venue/event/session/section/seat/session-seat/price tables, that `session_seats` are only inserted as `available`, that duplicate structural records are blocked by existing constraints, that `10,90` and `10.90` both parse to `1090` cents, and that a fully configured published event is visible to the normal buyer search path. Cleanup confirmed no remaining `TEST_ADMIN_EVENTS_FLOW` event or venue rows.

The latest real Supabase A-P audit for `TEST_ADMIN_EVENTS_FLOW` passed:

- A: non-event roles are blocked from Events;
- B: `root` and `admin` are allowed into Events;
- C: complete event creation creates venue, event, and first session after confirmation;
- D: cancelled event creation writes nothing;
- E: event listing shows the created event;
- F: event title/artist/city edits persist only after confirmation;
- G: `published -> draft -> published` status changes do not delete the event;
- H: session creation creates an `event_sessions` row;
- I: session open/close/cancel status changes do not delete tickets;
- J: section creation succeeds and duplicate slug is blocked;
- K: batch seat creation creates structural seats and duplicate seats are blocked;
- L: `session_seats` creation creates only missing rows and preserves `reserved`;
- M: price creation stores active BRL cents correctly;
- N: price edits do not mutate existing frozen `reservation_items`;
- O: a fully configured catalog is visible to the buyer sales path;
- P: cleanup removed temporary rows.

Cleanup removed temporary or prefix-linked rows from `tickets`, `reservation_items`, `reservations`, `whatsapp_messages`, `conversations`, `customers`, `ticket_prices`, `session_seats`, `seats`, `venue_sections`, `event_sessions`, `events`, `venues`, and temporary `admin_users`.

A second operational audit exercised the real `/api/webhook/zapi` route against a local Z-API mock using temporary data with prefix `TEST_ADMIN_EVENTS_WHATSAPP_FLOW`. It confirmed:

- `root` and `admin` can enter `Eventos`; `operator`, `gate`, and `support` are blocked by the real menu flow;
- create/edit/status/session/section/seat/session-seat/price flows work through persisted WhatsApp conversation context;
- `CANCELAR`, `voltar`, `menu`, invalid numbers, and numeric `Sair` options leave the admin in safe states or revoke the session as expected;
- returning an event to `draft` is the supported “remove from publication” action because the schema does not have `paused`;
- a buyer can find and reserve from a catalog created through the admin conversation when the event is `published`, the session is `sales_open`, seats/session seats are available, and price is active;
- cleanup removed the temporary catalog, WhatsApp, customer, admin, reservation, and order data.

Current limitations and operational cautions:

- There is no physical event/session/section/seat/price deletion flow. Operational removal is by status (`draft`, `cancelled`, `inactive`, `sales_closed`) and requires confirmation where sensitive.
- There is no automatic refund, customer notification, or ticket invalidation when cancelling events or sessions. Those are future operational modules.
- Editing event text, city, or venue after sales is allowed with confirmation, but operators should treat it as an operational change that may affect customer-facing ticket information.
- Changing session date/time is blocked in this WhatsApp flow once reservations or tickets exist.
- Changing a section from numbered to unnumbered is blocked when reservations, tickets, or busy session seats exist.
- Blocking/inactivating structural seats is blocked when those seats are reserved or sold in any session.
- Price edits affect new reservations only; existing `reservation_items` keep frozen price and fee values.
- The module does not implement reports, courtesy generation, cancellation/refund workflows, manual resend, or advanced admin panel screens.

### Gate Page And Scanner

Page:

```text
/gate/session/[token]
```

The page validates the gate session through:

```text
POST /api/gate/session/validate
```

The valid response contains only minimal public data: session id, gate label, validator phone last 4 digits, expiration, and status. It does not return full phone, token hash, admin phone, or secrets.

The scanner UI is a client component. It uses browser camera APIs and `BarcodeDetector` when available, with a manual fallback input. Counters are neutral in this step:

- `Leituras`;
- `Erros`.

They are local UI counters only and are not final validation counters.

### Placeholder Scan Endpoint

Route:

```text
POST /api/gate/session/scan
```

This endpoint validates only the gate session and returns:

```json
{
  "received": true,
  "validationPending": true,
  "message": "Leitura recebida. A validação real será ativada no próximo passo."
}
```

It does not validate ticket ownership, does not mark the ticket used, does not insert validation events, and does not update `tickets`.

### Final Step 15 Audit

- [x] `portaria TELEFONE [label]` is gated by normalized `ADMIN_WHATSAPP_PHONES`.
- [x] Configured admin phones are recognized by normalization; production has the admin phone envs configured as encrypted Vercel variables.
- [x] `GATE_SESSION_SECRET` and `GATE_SESSION_TTL_MINUTES` are present in `src/lib/env.ts`, `.env.example`, and Vercel Production; neither uses `NEXT_PUBLIC_`, and the secret has no default fallback.
- [x] Gate tokens use `base64url(payload).signature`, HMAC SHA-256, constant-time signature comparison, and payload fields only `gid`, `phone`, and `exp`.
- [x] `gate_sessions.token_hash` stores only SHA-256 token hashes, is unique, and is not returned by public endpoints.
- [x] `POST /api/gate/session/validate` returns only session id, gate label, validator phone last four digits, expiration, and active status.
- [x] `POST /api/gate/session/scan` remains a placeholder and does not touch tickets, ticket validation events, orders, payments, session seats, or reservations.
- [x] `/gate/session/[token]` renders invalid/expired/revoked access safely, does not log the token, and does not expose full phone or `token_hash`.
- [x] The scanner is a client component, guards `navigator.mediaDevices` and `window.BarcodeDetector`, has manual fallback, and uses neutral labels `Leituras` and `Erros`.
- [x] If validator-link delivery fails, the session is revoked and the admin receives a safe failure message.
- [x] Temporary Supabase audit rows were removed.

### Explicit Non-Scope For Step 15

Step 15 does not:

- update `tickets.status`;
- fill `tickets.used_at`;
- mark an ingresso as valid or used;
- implement final one-time gate validation;
- create a gate operator dashboard;
- generate PDF/image tickets;
- cancel or swap tickets.

## Step 16 - Real Gate Validation And One-Time Ticket Use

Step 16 replaces the placeholder scan behavior with real ticket validation.

### Migration And RPC

Migration:

```text
supabase/migrations/20260522000700_create_validate_ticket_entry_rpc.sql
```

Changes:

- adds `ticket_validation_events.gate_session_id`;
- adds `ticket_validation_events_gate_session_id_idx`;
- creates `public.validate_ticket_entry(...)`;
- revokes execution from `public`, `anon`, and `authenticated`;
- grants execution only to `service_role`.

RPC signature:

```sql
public.validate_ticket_entry(
  p_ticket_id uuid,
  p_ticket_code text,
  p_gate_session_id uuid default null,
  p_gate_label text default null,
  p_validator_identifier text default null,
  p_metadata jsonb default '{}'::jsonb
)
```

The RPC locks the matching ticket with `FOR UPDATE`. Results:

- `allowed`: ticket was `issued`, is updated to `used`, and `used_at` is set.
- `already_used`: ticket was already used; `used_at` is returned and not changed.
- `cancelled`: ticket was cancelled.
- `not_found`: no matching `id + ticket_code`.
- `denied`: any other unexpected ticket status.

Every known-ticket attempt inserts a `ticket_validation_events` row with `ticket_id`, `ticket_code`, `gate_session_id`, result, gate label, validator identifier, and minimal metadata. Invalid signed ticket tokens cannot call the RPC because there is no ticket id; the backend records a `not_found` event directly with `gate_session_id` and minimal metadata.

The RPC response intentionally excludes phone, document, email, customer id, order id, payment id, `qr_token_hash`, and raw metadata.

### Scan Endpoint

Route:

```text
POST /api/gate/session/scan
```

Input:

```json
{
  "gateSessionToken": "...",
  "ticketToken": "..."
}
```

Flow:

1. validate the temporary gate session token;
2. reject expired, revoked, malformed, or missing gate sessions;
3. extract the ticket token from either a raw token or a `/tickets/{token}` URL;
4. validate the signed ticket token;
5. call `public.validate_ticket_entry`;
6. return the minimal gate result.

Example allowed response:

```json
{
  "allowed": true,
  "result": "allowed",
  "message": "Entrada liberada.",
  "ticket": {
    "ticketId": "...",
    "ticketCode": "TCK-...",
    "status": "used",
    "usedAt": "...",
    "eventTitle": "...",
    "startsAt": "...",
    "sectionName": "...",
    "seatCode": "A03"
  }
}
```

### Scanner UI

`/gate/session/[token]` now shows real validation counters:

- `Validados`;
- `Recusados`.

The scanner extracts ticket tokens from full `/tickets/{token}` URLs or raw token values, calls the scan endpoint, and shows allowed/denied feedback with ticket code, section, and seat when available. Camera reads have a 3-second same-content debounce to reduce repeated scans; the RPC still provides the concurrency-safe source of truth.

### Step 16 Audit

Temporary Supabase data was created and removed after validation. The audit confirmed:

- [x] migration applied: RPC exists and `ticket_validation_events.gate_session_id` exists;
- [x] issued ticket returns `allowed`, updates `tickets.status = used`, and fills `used_at`;
- [x] second scan returns `already_used` and does not change `used_at`;
- [x] cancelled ticket returns `cancelled`;
- [x] unknown ticket id/code returns `not_found`;
- [x] concurrent scans of the same ticket produce exactly one `allowed` and one `already_used`;
- [x] validation events are created with `gate_session_id`;
- [x] anon cannot execute `public.validate_ticket_entry`;
- [x] the SQL migration revokes execution from `authenticated` and `public`, leaving only `service_role`;
- [x] revoked or expired gate sessions are blocked before ticket validation is attempted;
- [x] invalid signed ticket tokens return a safe `not_found` result and do not update tickets;
- [x] the scanner UI increments `Validados` only for API responses with `allowed = true`; `not_found`, `cancelled`, `already_used`, and request errors increment `Recusados`;
- [x] scan code and UI do not log full gate tokens, ticket tokens, phone numbers, or secrets;
- [x] responses do not expose customer/order/payment/phone/document/email/`qr_token_hash`;
- [x] cleanup removed temporary data.

Not in scope for Step 16: advanced admin dashboard, event/session-specific wrong-event enforcement, cancellation/swap flows, reports, PDF/image tickets, and advanced camera UX.

## Step 17 - MVP Closure Audit

Step 17 performed a controlled end-to-end MVP audit without adding product features.

### Real Supabase Inventory

The real Supabase project was checked through safe REST operations and operational RPC calls. The following tables were present:

- `customers`
- `conversations`
- `whatsapp_messages`
- `venues`
- `venue_sections`
- `seats`
- `events`
- `event_sessions`
- `session_seats`
- `ticket_prices`
- `reservations`
- `reservation_items`
- `orders`
- `payments`
- `payment_events`
- `tickets`
- `ticket_validation_events`
- `seat_map_renders`
- `gate_sessions`

The following RPCs were present and executable by service role:

- `public.reserve_seats`
- `public.expire_reservations`
- `public.confirm_paid_ticket_order`
- `public.validate_ticket_entry`

Important indexes are defined in the applied migrations:

- partial unique inbound WhatsApp provider message id: `whatsapp_messages_inbound_provider_message_id_unique`;
- partial unique Mercado Pago provider payment id: `payments_provider_payment_id_unique_idx`;
- unique gate token hash: `gate_sessions.token_hash`;
- gate validation event index: `ticket_validation_events_gate_session_id_idx`.

### Environment Audit

Vercel Production contains the required encrypted server-side envs:

- Supabase keys;
- Z-API instance/base/webhook keys;
- Mercado Pago access/webhook/public key;
- checkout internal secret;
- app base URL;
- ticket QR secret;
- gate session/admin secrets and TTLs;
- admin WhatsApp phones;
- reservation TTL.

No secret env uses a `NEXT_PUBLIC_` prefix. `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` is intentionally public. `.env` is gitignored and not tracked. `.env.example` contains names only and no real secret values.

Local `.env` currently contains the earlier core Supabase/Z-API/Mercado Pago keys, but does not include every final-step key such as `APP_BASE_URL`, `CHECKOUT_INTERNAL_SECRET`, `TICKET_QR_SECRET`, `GATE_SESSION_SECRET`, `GATE_SESSION_TTL_MINUTES`, `GATE_ADMIN_SECRET`, and `TICKET_RESERVATION_TTL_MINUTES`. Pull/update local envs before running full server-side flows locally.

The Z-API token env used by the code is `ZAPI_INSTANCE_TOKEN`; any external checklist item named `ZAPI_TOKEN` should be treated as the same provider token and mapped to `ZAPI_INSTANCE_TOKEN`.

### Production Route Audit

Production checks on `https://site-phi-seven-72.vercel.app`:

- `/api/health` returns `200` and `status: ok`;
- `/api/webhook/zapi` without secret returns `401`;
- `/api/webhook/payment/mercado-pago` without signature returns `401`;
- `/api/checkout/mercado-pago` without `x-checkout-secret` returns `401`;
- `/api/gate/session/validate` with invalid token returns safe `valid: false`;
- `/api/gate/session/scan` with invalid payload returns safe `gate_session_invalid`;
- `/tickets/test-invalid-token` renders the safe invalid ticket page;
- `/gate/session/token-invalido` renders the safe invalid gate page.

### Controlled E2E Audit

Temporary data used the prefix `TEST_E2E_TICKETING_MVP` and was removed at the end.

The audit confirmed:

- published event fixture is searchable;
- `reserve_seats` creates an active reservation, pending order, reservation item, and reserved session seat;
- `confirm_paid_ticket_order` marks reservation/order paid, issues one ticket, and turns the session seat sold;
- a gate session can validate the ticket with `validate_ticket_entry`;
- first scan returns `allowed`, second scan returns `already_used`;
- validation events are recorded with `gate_session_id`;
- cleanup leaves zero temporary customers, tickets, and gate sessions.

Critical concurrency was rechecked:

- two same-seat reservation attempts produce exactly one success;
- two approved-payment confirmations for the same order do not duplicate tickets;
- two simultaneous gate scans produce one `allowed` and one `already_used`.

### Security Audit

Static checks confirmed:

- no service role key is used in frontend components;
- webhook/checkout routes keep their required secrets/signatures;
- logs pass through the project logger, which redacts sensitive key names and masks phone-like fields;
- ticket and gate token paths do not log full tokens;
- Z-API raw metadata remains minimal;
- Mercado Pago event metadata stores request/payment/event identifiers, not full headers or access tokens;
- `tickets.status` and `tickets.used_at` are changed only by `public.validate_ticket_entry`;
- `session_seats` operational status is changed by reservation/payment/expiration RPCs, not by frontend or webhook helper code.

### Validation Commands

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm audit`: reports two moderate PostCSS advisories through `next`. The available fix requires `npm audit fix --force` and would install a breaking Next version, so it was not applied.

### Remaining MVP Limitations

- No cancellation flow.
- No ticket swap flow.
- No manual ticket resend.
- No event/session `wrong_event` gate filter yet.
- No advanced admin panel.
- No reports.
- No QR visual/PDF ticket.
- Scanner camera support depends on browser capabilities; manual fallback remains available.
- A controlled low-value real Mercado Pago payment run is still recommended before public operation.

## Step 18 - Real Low-Value Mercado Pago Test Preparation

Step 18 prepares the first real controlled Mercado Pago payment test without adding product features.

Checklist:

```text
docs/REAL_PAYMENT_TEST.md
```

The test must use the `TEST_REAL_PAYMENT_MVP` prefix and a low value such as `R$ 1,00`, or the smallest value Mercado Pago allows. Payment must be manual and controlled through the Mercado Pago checkout link; scripts must not automate payment.

### Complete Local/Production Env List

To run the full cycle locally or in production, configure:

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
- `ADMIN_WHATSAPP_PHONES`
- `TICKET_RESERVATION_TTL_MINUTES`

`ZAPI_INSTANCE_TOKEN` is the token env name used by the codebase. If external Z-API documentation or an operational checklist says `ZAPI_TOKEN`, map that value into `ZAPI_INSTANCE_TOKEN`.

No secret env should use `NEXT_PUBLIC_`. The only public key in the list is `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`, which is intentionally browser-safe.

`.env.example` contains names only and no real values. `.env` remains gitignored and must not be committed.

### Real Payment Preconditions

- Mercado Pago webhook URL must be:

```text
https://site-phi-seven-72.vercel.app/api/webhook/payment/mercado-pago
```

- `MERCADO_PAGO_WEBHOOK_SECRET` in Vercel Production must match the Mercado Pago panel.
- Use the stable production alias, not a preview URL.
- Use only a controlled WhatsApp buyer number and controlled validator/admin numbers.
- Confirm cleanup plan before starting.

### Script Decision

No seed/cleanup script was added in Step 18. The first real-money run should use manual SQL Editor setup and manual cleanup following `docs/REAL_PAYMENT_TEST.md`, so no script with service-role access is committed before the operational process is proven.

Future scripts can be added after the first manual test if the cleanup rules and test dataset shape are stable.

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
