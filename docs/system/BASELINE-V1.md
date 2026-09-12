# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.3.1**, status **FROZEN**. Its permanent source state is the pure base commit `9302cbd46aec802fef371e9c948e7d558c3dfc2a`, with zero functional changes since base, identified by canonical Git source tree fingerprint `04906786b32fb4b3cb48f51e25e25b80bcb581899a4465c2f206591d6da7697e`. The Git commit containing the baseline is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 77 migrations, 33 local SQL functions, 33 triggers and 2,223 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, but product health is not healthy.

- Findings: 44; active P0: 0; active HIGH: 6; potential HIGH: 1; open HIGH: 7; CRITICAL: 0; resolved: 3.
- Broken flows: 0; partial flows: 9, including `kitchen.combo_redemption` and `admin.web_event_workspace`.
- `npm test`: FAIL, 207/214 passed and the same 7 preexisting cases failed.
- `npm run typecheck`: PASS, 0 diagnostics.
- `npm run lint`: PASS, 0 errors and 24 preexisting warnings.
- `npm run build`: PASS with the preexisting NFT/Turbopack warning.
- Infrastructure: identity CORRECT (`FelipeFraul/rota5` `production` → Vercel `rota5`); Git auto-deploy DISABLED; current HEAD not deployed. Health remains DEGRADED because the latest deployment is ERROR, the published commit is NOT_VALIDATED, storage drifts and local runtime is incomplete.

The ten NOT_VALIDATED groups include remote PostgreSQL internals and migration history, Supabase Auth, webhook registration/history, cron execution history, published source commit, deployment error cause, anon visibility and possible external consumers. NOT_VALIDATED does not mean BROKEN.

Maintenance follows `GOVERNANCE.md` and `CHANGE-PROTOCOL.md`. A functional change is incomplete until affected code, tests, machine catalogs and human documentation agree and the baseline validator passes.
