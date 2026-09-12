# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.2.0**, status **FROZEN**, frozen at 2026-09-12T14:12:39.549Z. Its permanent source state starts from base commit `121b7a8a4870f5933bd0cf0d45f12a8d71132424`, includes the minimal fix in `src/lib/tickets/services/comboRedemptions.ts`, and is identified by source tree fingerprint `28973ed142a2e6ee1f22108ef5affdd69efded898f83d69c702b6804d7e038f5`. The Git commit containing the baseline is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 77 migrations, 33 local SQL functions, 33 triggers and 2,223 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, but product health is not healthy.

- Findings: 44; active P0: 2; active HIGH: 9; CRITICAL: 0; resolved: 1.
- Broken flows: 0; partial flows: 9, including `kitchen.combo_redemption` and `admin.web_event_workspace`.
- `npm test`: FAIL, 207/214 passed and the same 7 preexisting cases failed.
- `npm run typecheck`: PASS, 0 diagnostics.
- `npm run lint`: PASS, 0 errors and 24 preexisting warnings.
- `npm run build`: PASS with the preexisting NFT/Turbopack warning.
- Infrastructure: project/domain drift `site` × `rota5`, latest `rota5` deployment observed as ERROR, published commit NOT_VALIDATED, storage drift and incomplete local runtime environment.

The ten NOT_VALIDATED groups include remote PostgreSQL internals and migration history, Supabase Auth, webhook registration/history, cron execution history, published source commit, deployment error cause, anon visibility and possible external consumers. NOT_VALIDATED does not mean BROKEN.

Maintenance follows `GOVERNANCE.md` and `CHANGE-PROTOCOL.md`. A functional change is incomplete until affected code, tests, machine catalogs and human documentation agree and the baseline validator passes.
