# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **2.0.1**, status **FROZEN**. Its permanent source state is pure commit `bd0012f3a3277b2b6d1a97390ba7c3cc460a9165`, with zero functional changes since base, 356 files and canonical fingerprint `c70f133b075bc479e713d052fb0001c5e95ce35c140892bd5e5b6a121e05a53f`. The baseline commit is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. The canonical catalog contains 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps and 68 state transitions. The data catalog contains 44 tables, 79 active migrations, 39 local SQL functions, 36 triggers and 2,257 typed relations.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, while independent product findings remain open.

- Findings: 44; active P0: 0; active HIGH: 4; potential HIGH: 1; open HIGH: 5; resolved: 5.
- Broken flows: 0; partial flows: 9.
- Default suite: 207/214, with the same seven preexisting failures; typecheck PASS; lint PASS with 24 preexisting warnings; build PASS with its existing warning.
- Infrastructure health: **DEGRADED** because independent findings remain open. Git auto-deploy is DISABLED.

## HIGH #1 FINAL STATE

- `risk.gate-credential-revocation-does-not-revoke-session`: **RESOLVED / HIGH / P1**.
- EXPAND and CONTRACT: `APPLIED_AND_VALIDATED`; CONTRACT applied at `2026-09-13T18:11:18.773635Z` with SHA-256 `bb90b8da28217c1cdfa86bc68780aac05fbb8c16cb8058d2ba55f9d48e16a525`.
- Gates A-I: **PASS**. Canonical semantics: F=`STRICT_TICKET_VALIDATION`, G=`STRICT_COMBO_VALIDATION`, H=`TEMPORARY_CREDENTIAL_REVOCATION`, I=`FIXED_CREDENTIAL_REVOCATION`. Dual-mode: **ENDED**. Ticket/combo authorization: **STRICT_ONLY**. Source attribution: **NOT_NULL / IMMUTABLE**.
- Historical source-null rows: 1 before CONTRACT, 0 after; the preserved row is classified `legacy_unattributed`.
- OLD_APP + FINAL_DB: `INCOMPATIBLE_BY_DESIGN`; OLD_APP rollback is unsafe.
- Production remains `dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT`, READY, serving runtime artifact `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`; post-CONTRACT runtime PASS and relevant log errors 0. No new app deployment was needed because `src/**` did not change.

## BASELINE 2.0.1 SEMANTIC CORRECTION

This PATCH changes only the F-I labels. Runtime evidence, PASS results, finding lifecycles, source identity and remote state are unchanged from 2.0.0.
