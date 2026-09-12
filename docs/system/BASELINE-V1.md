# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.0.0**, status **FROZEN**, frozen at 2026-09-12T04:24:28.619Z. Source is branch `production`, commit `a141c6004421fb8442f95493de3ca4ec4d4c997b`, matching `origin/production`. The snapshot is not the pure commit: `src/lib/tickets/messages.ts` was already modified and remains unchanged by the audit.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 77 migrations, 33 local SQL functions, 33 triggers and 2,223 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, but product health is not healthy.

- Findings: 44; P0: 3; HIGH: 10; CRITICAL: 0.
- Broken flows: 2 (admin.web_event_workspace, kitchen.combo_redemption); partial flows: 7.
- `npm test`: FAIL, 203/210 passed and 7 failed.
- `npm run typecheck`: FAIL, 5 diagnostics rooted at `CreateEventModal.tsx:19`.
- `npm run lint`: FAIL, 1 error and 24 warnings.
- Infrastructure: project/domain drift `site` × `rota5`, latest `rota5` deployment observed as ERROR, published commit NOT_VALIDATED, storage drift and incomplete local runtime environment.

The ten NOT_VALIDATED groups include remote PostgreSQL internals and migration history, Supabase Auth, webhook registration/history, cron execution history, published source commit, deployment error cause, anon visibility and possible external consumers. NOT_VALIDATED does not mean BROKEN.

Maintenance follows `GOVERNANCE.md` and `CHANGE-PROTOCOL.md`. A functional change is incomplete until affected code, tests, machine catalogs and human documentation agree and the baseline validator passes.
