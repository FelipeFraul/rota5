# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **1.4.1**, status **FROZEN**. Its permanent source state is the pure base commit `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`, with zero functional changes since base, identified by canonical Git source tree fingerprint `6643a2c539caab8942ebe3953dc75963446d27dbb653e166a3310fe2c4e2fc4b`. The Git commit containing the baseline is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. It centers on WhatsApp discovery and ticket sales, Mercado Pago Pix checkout and webhooks, ticket delivery, gate admission, courtesies, combos/kitchen operations, event administration and reporting. The architecture contains 17 domains, 66 modules and 56 entrypoints. Its catalog contains 140 capabilities and 34 flows with 169 steps and 66 transitions.

The data baseline reconstructs 44 tables, 78 active migrations, 38 local SQL functions, 35 triggers and 2,255 typed relations. Six integrations, two webhooks, two crons and 44 environment variables are cataloged. Local definitions and remote observations remain explicitly distinct.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, but product health is not healthy.

- Findings: 44; active P0: 0; active HIGH: 5; potential HIGH: 1; open HIGH: 6; CRITICAL: 0; resolved: 4.
- Broken flows: 0; partial flows: 9, including `kitchen.combo_redemption` and `admin.web_event_workspace`.
- `npm test`: FAIL, 207/214 passed and the same 7 preexisting cases failed.
- `npm run typecheck`: PASS, 0 diagnostics.
- `npm run lint`: PASS, 0 errors and 24 preexisting warnings.
- `npm run build`: PASS with the preexisting NFT/Turbopack warning.
- Infrastructure: identity CORRECT (`FelipeFraul/rota5` `production` → Vercel `rota5`); Git auto-deploy DISABLED. Production serves exact NEW_APP artifact `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` through deployment `dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT`. Health remains DEGRADED because unrelated published-commit, storage and local-runtime findings remain open.

The nine NOT_VALIDATED groups include remote PostgreSQL internals and migration history, Supabase Auth, webhook registration/history, cron execution history, published source commit, anon visibility and possible external consumers. NOT_VALIDATED does not mean BROKEN.

Maintenance follows `GOVERNANCE.md` and `CHANGE-PROTOCOL.md`. A functional change is incomplete until affected code, tests, machine catalogs and human documentation agree and the baseline validator passes.

## HIGH #1 SOURCE AND ROLLOUT STATE

- Finding `risk.gate-credential-revocation-does-not-revoke-session`: **ACTIVE / HIGH / P1**.
- Source implementation: `IMPLEMENTED_AND_LOCALLY_VALIDATED` at `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`.
- Local proof: focused tests 96/96; disposable PostgreSQL 16 rollout matrix PASS; ticket race 2/2; combo race 2/2; typecheck PASS; lint 0 errors/24 preexisting warnings; build PASS.
- Production rollout: `POST_CUTOVER_GATES_PENDING`. Remote EXPAND: `APPLIED_AND_VALIDATED` at `2026-09-13T14:20:15.059853Z`. NEW_APP: `PRODUCTION_CUTOVER_COMPLETE` at `2026-09-13T16:19:42.340Z`. CONTRACT: `DRAFT_ONLY` and `NOT_APPLIED`.
- Gate A and Gate B passed. Gate C is `PENDING`; D/E are `PENDING_FORMAL_CONFIRMATION`; F-I are `PENDING`. The CONTRACT SQL stays outside the active migration queue and is prohibited until A-I pass. Product health stays BROKEN and infrastructure health stays DEGRADED.
