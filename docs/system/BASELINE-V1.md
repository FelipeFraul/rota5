# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.1.0**, status **FROZEN**, frozen at 2026-09-12T13:36:12.110Z. Its permanent source state starts from base commit `7c00adb7db018786494b7b2b5124df3df69284ff`, includes the minimal fix in `src/app/admin/eventos/event-editor/CreateEventModal.tsx`, and is identified by source tree fingerprint `5320ec9da181b58066acb0c4c86c91542866d6831095cc2442070c229085173f`. The Git commit containing the baseline is `SELF_NOT_RECORDED` to avoid self-reference. Git state observed during generation is historical and does not determine future validity. `messages.ts` is part of the base commit and was not changed by this stabilization.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 77 migrations, 33 local SQL functions, 33 triggers and 2,223 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, but product health is not healthy.

- Findings: 44; active P0: 2; active HIGH: 9; CRITICAL: 0; resolved: 1.
- Broken flows: 1 (`kitchen.combo_redemption`); partial flows: 8, including `admin.web_event_workspace`.
- `npm test`: FAIL, 203/210 passed and 7 failed.
- `npm run typecheck`: PASS, 0 diagnostics.
- `npm run lint`: PASS, 0 errors and 24 preexisting warnings.
- `npm run build`: PASS with the preexisting NFT/Turbopack warning.
- Infrastructure: project/domain drift `site` × `rota5`, latest `rota5` deployment observed as ERROR, published commit NOT_VALIDATED, storage drift and incomplete local runtime environment.

The ten NOT_VALIDATED groups include remote PostgreSQL internals and migration history, Supabase Auth, webhook registration/history, cron execution history, published source commit, deployment error cause, anon visibility and possible external consumers. NOT_VALIDATED does not mean BROKEN.

Maintenance follows `GOVERNANCE.md` and `CHANGE-PROTOCOL.md`. A functional change is incomplete until affected code, tests, machine catalogs and human documentation agree and the baseline validator passes.
