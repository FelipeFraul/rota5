> **Current Baseline 2.4.2 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on canonical source `67845326088eac47452224b00ef1e866036e86f1` (fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`, 368 files, 79 migrations). Findings `bug.event-duplicate-artist-leak` and `bug.user-visible-text-corruption` are **RESOLVED** as stale. `gap.partial-flows-lack-end-to-end-proof` remains **ACTIVE**, decomposed from P1 to P2; no specific P1 was justified. Canonical release blockers: **0**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 11. PRODUCT_HEALTH: **DEGRADED**; INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality evidence remains 236/236, PostgreSQL 1/1 and Quality Gate 34867214724 PASS. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; no deployment, Supabase change or Ticketeira access.

# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **2.4.2**, status **FROZEN**. Its canonical functional source is pure commit `67845326088eac47452224b00ef1e866036e86f1`, with 368 files and fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`. The baseline commit is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. The canonical catalog contains 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps and 68 state transitions. The data catalog contains 44 tables, 79 active migrations, 39 local SQL functions, 36 triggers and 2,257 typed relations.

## PRODUCT HEALTH AT FREEZE

**DEGRADED.** Baseline integrity is PASS and the canonical release-blocker set is empty, while one POTENTIAL HIGH and other independent findings remain open.

- Findings: 44; active P0: 0; active HIGH: 0; potential HIGH: 1; open HIGH: 1; resolved: 11; release blockers: 0.
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

## Semantic consistency — Baseline 2.4.2

PATCH_DOCUMENTARY_CORRECTION. A auditoria explícita partiu de 109 projeções/metadados atuais stale e 2 registros RESOLVED contraditórios; após a reconciliação: 0 projeções atuais stale, 0 contradições semânticas, 0 claims top-level ativos em findings resolvidos e 0 release blockers. O runtime source não mudou.
