# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.4.0**, status **FROZEN**. Its permanent source state is the pure base commit `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`, with zero functional changes since base, identified by canonical Git source tree fingerprint `6643a2c539caab8942ebe3953dc75963446d27dbb653e166a3310fe2c4e2fc4b`. The Git commit containing the baseline is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 78 active migrations, 38 local SQL functions, 35 triggers and 2,255 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

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

## HIGH #1 SOURCE AND ROLLOUT STATE

- Finding `risk.gate-credential-revocation-does-not-revoke-session`: **ACTIVE / HIGH / P1**.
- Source implementation: `IMPLEMENTED_AND_LOCALLY_VALIDATED` at `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`.
- Local proof: focused tests 96/96; disposable PostgreSQL 16 rollout matrix PASS; ticket race 2/2; combo race 2/2; typecheck PASS; lint 0 errors/24 preexisting warnings; build PASS.
- Production rollout: `NOT_STARTED`. Remote EXPAND: `NOT_APPLIED`. NEW_APP: `NOT_DEPLOYED`. CONTRACT: `DRAFT_ONLY` and `NOT_APPLIED`.
- The CONTRACT SQL stays outside the active migration queue. Phase 0 passed while Git auto-deploy remains disabled. Product health stays BROKEN and infrastructure health stays DEGRADED.
