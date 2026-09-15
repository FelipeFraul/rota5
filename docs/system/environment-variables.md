> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Environment variables — Etapa 5

Baseline 2.1.0 catalogs 43 active environment variables. `ROCK_BAR_OFFICIAL_WHATSAPP_PHONE` was removed from the active schema because it had no consumer; this note preserves the historical transition.


Foram catalogados 44 nomes. Presença remota foi confirmada para 24; valores nunca foram persistidos. `UNKNOWN` significa que o target remoto não confirmou o nome ou não foi consultável, não ausência comprovada.

| Nome | Obrigatoriedade | Categoria | Ambiente | Secret | Local | Remoto | Consumidores/evidência |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ADMIN_SESSION_TTL_MINUTES` | optional | application | server | NO | NO | UNKNOWN | src\lib\tickets\services\adminAuth.ts, src/lib/env.ts, .env.example |
| `ADMIN_WEB_SESSION_TTL_MINUTES` | optional | application | server | NO | NO | UNKNOWN | src\lib\tickets\services\adminAuth.ts |
| `APP_BASE_URL` | required | application | server | NO | NO | YES | src\lib\tickets\codexRequests.ts, src\lib\tickets\router.ts, src\lib\tickets\services\adminAuth.ts, src\lib\tickets\services\comboOffers.ts, src/lib/env.ts, .env.example |
| `CHECKOUT_INTERNAL_SECRET` | required | payment | server | YES | NO | YES | src\app\api\admin\login\verify\route.ts, src\app\api\checkout\mercado-pago\route.ts, src\lib\tickets\services\adminAuth.ts, src/lib/env.ts, .env.example |
| `CODEX_CLI_PATH` | optional | automation | local | NO | NO | UNKNOWN | scripts\codex-local-runner.mjs |
| `CODEX_RUNNER_POLL_SECONDS` | optional | automation | server | NO | NO | UNKNOWN | scripts\codex-local-runner.mjs |
| `CODEX_WHATSAPP_PHONE` | optional | messaging | server | NO | NO | UNKNOWN | scripts\list-codex-requests.mjs |
| `CODEX_WHATSAPP_PHONES` | optional | messaging | server | NO | NO | UNKNOWN | src\lib\tickets\codexRequests.ts, scripts\codex-local-runner.mjs, .env.example |
| `COMBO_OFFER_DELAY_MINUTES` | optional | application | server | NO | NO | UNKNOWN | src\lib\tickets\config.ts |
| `CONVERSATION_INACTIVITY_TTL_MINUTES` | optional | application | server | NO | NO | UNKNOWN | src\app\api\webhook\zapi\route.ts, src\lib\tickets\services\conversationFinalizer.ts, .env.example |
| `CRON_SECRET` | required | hosting-runtime | server | YES | NO | YES | src\app\api\cron\expire-reservations\route.ts, src\app\api\cron\process-whatsapp-batches\route.ts, .env.example |
| `DATABASE_URL` | required | database | server | YES | YES | YES | scripts\test-admin-section-capacity-rpc-real.mjs |
| `FULL_INTENT_AUDIT` | optional | application | server | NO | NO | UNKNOWN | scripts\audit-whatsapp-intent-100.mjs |
| `GATE_ADMIN_SECRET` | required | application | server | YES | NO | YES | src/lib/env.ts, .env.example |
| `GATE_SESSION_SECRET` | required | application | server | YES | NO | YES | src/lib/env.ts, .env.example |
| `GATE_SESSION_TTL_MINUTES` | required | application | server | NO | NO | YES | src/lib/env.ts, .env.example |
| `GITHUB_ISSUES_REPOSITORY` | optional | automation | server | NO | NO | UNKNOWN | src\lib\github\issues.ts, .env.example |
| `GITHUB_ISSUES_TOKEN` | optional | automation | server | YES | NO | UNKNOWN | src\lib\github\issues.ts, .env.example |
| `GITHUB_REPOSITORY` | optional | automation | server | NO | NO | UNKNOWN | src\lib\github\issues.ts |
| `MANUAL_TEST_PAYMENT_SECRET` | optional | payment | server | YES | YES | YES | documentada/remota |
| `MERCADO_PAGO_ACCESS_TOKEN` | required | payment | server | YES | YES | YES | src/lib/env.ts, .env.example |
| `MERCADO_PAGO_API_BASE_URL` | optional | payment | server | NO | NO | UNKNOWN | src\lib\mercado-pago\client.ts, src/lib/env.ts, .env.example |
| `MERCADO_PAGO_WEBHOOK_SECRET` | required | payment | server | YES | YES | YES | src/lib/env.ts, .env.example |
| `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` | required | payment | browser-build-and-server | NO | YES | YES | src\app\checkout\[orderId]\page.tsx, src\app\combo-checkout\[orderId]\page.tsx, src/lib/env.ts, .env.example |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | database | browser-build-and-server | YES | NO | UNKNOWN | .tools/audit_system_closure.mjs |
| `NODE_ENV` | optional | application | server | NO | NO | UNKNOWN | src\app\admin\eventos\abrir\[token]\route.ts, src\app\api\admin\login\verify\route.ts, src\app\api\kitchen\session\open\route.ts, src\lib\tickets\tableMap\persistOfficialPlaces.ts, src\proxy.ts |
| `PATH` | optional | application | local | NO | YES | UNKNOWN | .tools\audit_admin_reports.mjs |
| `PAYMENT_PROVIDER` | required | payment | server | NO | NO | YES | src/lib/env.ts, .env.example |
| `SEAT_MAP_STORAGE_BUCKET` | required | application | server | NO | NO | YES | src/lib/env.ts, .env.example |
| `SUPABASE_ACCESS_TOKEN` | optional | database | server | YES | NO | YES | docs/SUPABASE_SETUP.md |
| `SUPABASE_ANON_KEY` | required | database | server | YES | YES | YES | scripts\test-combo-offer-priority-real.mjs, src/lib/env.ts, .env.example |
| `SUPABASE_SERVICE_ROLE_KEY` | required | database | server | YES | YES | YES | src\app\api\admin\login\verify\route.ts, src\lib\supabase\admin.ts, src\proxy.ts, scripts\audit-whatsapp-santana-search.mjs, scripts\codex-local-runner.mjs, scripts\import-programacao-events.mjs, scripts\list-codex-requests.mjs, scripts\rename-black-house-ticket-sections.mjs, scripts\split-black-house-special-items.mjs, scripts\test-admin-section-capacity-rpc-real.mjs, scripts\test-combo-offer-priority-real.mjs, scripts\update-black-house-sectors.mjs, src/lib/env.ts, .env.example |
| `SUPABASE_URL` | required | database | server | NO | YES | YES | src\app\api\admin\login\verify\route.ts, src\lib\supabase\admin.ts, src\proxy.ts, scripts\audit-whatsapp-santana-search.mjs, scripts\codex-local-runner.mjs, scripts\import-programacao-events.mjs, scripts\list-codex-requests.mjs, scripts\rename-black-house-ticket-sections.mjs, scripts\split-black-house-special-items.mjs, scripts\test-admin-section-capacity-rpc-real.mjs, scripts\test-combo-offer-priority-real.mjs, scripts\update-black-house-sectors.mjs, src/lib/env.ts, .env.example |
| `TICKET_QR_SECRET` | required | application | server | YES | NO | YES | src/lib/env.ts, .env.example |
| `TICKET_RESERVATION_TTL_MINUTES` | required | application | server | NO | NO | YES | src/lib/env.ts, .env.example |
| `USERPROFILE` | optional | application | local | NO | YES | UNKNOWN | scripts\codex-local-runner.mjs |
| `VERCEL_GIT_COMMIT_SHA` | optional | hosting-runtime | server | NO | NO | UNKNOWN | src\lib\tickets\codexRequests.ts |
| `VERCEL_URL` | optional | hosting-runtime | server | NO | NO | UNKNOWN | src\lib\tickets\codexRequests.ts |
| `ZAPI_BASE_URL` | required | messaging | server | NO | YES | YES | scripts\codex-local-runner.mjs, scripts\test-combo-offer-priority-real.mjs, src/lib/env.ts, .env.example |
| `ZAPI_CLIENT_TOKEN` | required | messaging | server | YES | YES | YES | scripts\codex-local-runner.mjs, src/lib/env.ts, .env.example |
| `ZAPI_INSTANCE_ID` | required | messaging | server | YES | YES | YES | scripts\codex-local-runner.mjs, src/lib/env.ts, .env.example |
| `ZAPI_INSTANCE_TOKEN` | required | messaging | server | YES | YES | YES | scripts\codex-local-runner.mjs, src/lib/env.ts, .env.example |
| `ZAPI_WEBHOOK_SECRET` | required | messaging | server | YES | YES | YES | src\app\api\webhook\zapi\route.ts, src/lib/env.ts, .env.example |

O arquivo local não contém todos os campos obrigatórios do schema central, enquanto o health remoto está saudável. Essa diferença é registrada como drift de configuração local.
