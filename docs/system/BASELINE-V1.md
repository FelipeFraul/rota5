> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **2.3.0**, status **FROZEN**. Its permanent source state is pure commit `c726902505fd69c2cfef2dec8013ffe0cf0adba3`, with zero changes since base, 358 files and canonical fingerprint `6851aa10ce08fec1444d08bd213b18349dd70ec8ee6b7753c023164207e9b1d3`. The baseline commit is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. The canonical catalog contains 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps and 68 state transitions. The data catalog contains 44 tables, 79 active migrations, 39 local SQL functions, 36 triggers and 2,257 typed relations.

## PRODUCT HEALTH AT FREEZE

**BROKEN.** Baseline integrity is PASS, while independent product findings remain open.

- Findings: 44; active P0: 0; active HIGH: 2; potential HIGH: 1; open HIGH: 3; resolved: 7.
- Broken flows: 0; partial flows: 9.
- Default node suite: 236/236 PASS; PostgreSQL integration: 1/1 PASS on PostgreSQL 16 with the real trigger executed; Quality Gate 34867214724 PASS; typecheck, lint and build PASS; 0 skip, 0 todo and 0 regressions.
- Infrastructure health: **DEGRADED** because independent findings remain open. Git auto-deploy is DISABLED.

## HIGH #1 FINAL STATE

- `risk.gate-credential-revocation-does-not-revoke-session`: **RESOLVED / HIGH / P1**.
- EXPAND and CONTRACT: `APPLIED_AND_VALIDATED`; CONTRACT applied at `2026-09-13T18:11:18.773635Z` with SHA-256 `bb90b8da28217c1cdfa86bc68780aac05fbb8c16cb8058d2ba55f9d48e16a525`.
- Gates A-I: **PASS**. Canonical semantics: F=`STRICT_TICKET_VALIDATION`, G=`STRICT_COMBO_VALIDATION`, H=`TEMPORARY_CREDENTIAL_REVOCATION`, I=`FIXED_CREDENTIAL_REVOCATION`. Dual-mode: **ENDED**. Ticket/combo authorization: **STRICT_ONLY**. Source attribution: **NOT_NULL / IMMUTABLE**.
- Historical source-null rows: 1 before CONTRACT, 0 after; the preserved row is classified `legacy_unattributed`.
- OLD_APP + FINAL_DB: `INCOMPATIBLE_BY_DESIGN`; OLD_APP rollback is unsafe.
- Production is `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa`, READY, serving exact source commit `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` passed and relevant Production log errors are 0. Git auto-deploy remains DISABLED.

## BASELINE 2.1.0 SCOPED ACTIVE-BRAND RESOLUTION

- SemVer reason: **MINOR_COMPATIBLE_FUNCTIONAL_CHANGE**.
- `legacy.active-brand-contamination`: **RESOLVED / HIGH / P1** for `DOCUMENTED_AND_REAUDITED_ACTIVE_SURFACES`.
- All active surfaces documented and revalidated for the finding were corrected and passed Preview `dpl_4MAmzsQ6NVM36W1uie5VoVJas9zW` and Production `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo` on source `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`.
- Checkout pending/success, five public-help topics, scoped router prompts, CSS assets and static CORS contain zero scoped legacy-brand references; `rota5.webp` and `rota5_mb.webp` return HTTP 200; relevant Production log errors are 0.
- This resolution is scoped to the active surfaces documented and revalidated for this finding. It is not a repository-wide assertion that historical brand strings do not exist elsewhere.
- Supabase and Ticketeira were unchanged. Product health remains **BROKEN** and infrastructure health remains **DEGRADED**.

## BASELINE 2.0.1 SEMANTIC CORRECTION

This PATCH changes only the F-I labels. Runtime evidence, PASS results, finding lifecycles, source identity and remote state are unchanged from 2.0.0.

## TEST RUNNER RESOLUTION — BASELINE 2.2.0

- `gap.test-runner-depends-on-untracked-loader`: **RESOLVED / HIGH / P1**.
- The original ignored `.tmp/typescript-alias-loader.mjs` dependency was reproduced as `ERR_MODULE_NOT_FOUND` before useful test execution.
- The byte-identical loader is tracked at `scripts/test-support/typescript-alias-loader.mjs`; behavior changed: no; external dependencies added: 0; untracked-loader references: 0.
- A canonical Git materialization without copied `.tmp` or `node_modules` passed `npm ci`, started the runner and returned 207/214 with the same seven known failures and zero new regressions.
- A Windows `core.autocrlf=true` worktree exposed two additional source-text assertion failures. This is separate evidence for `gap.source-contract-assertion-bias`, whose lifecycle remains unchanged.
- Production runtime remains `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo`; no deployment is required for the tooling-only change.
