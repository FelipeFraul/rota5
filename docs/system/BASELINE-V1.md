> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.8.0 — explicit rate-limit outage policy

**Identity:** `rota5-baseline-v1`, version **2.8.0**, status **FROZEN**. Canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e` has 394 files and fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; baseline commit is `SELF_NOT_RECORDED`.

The compatible functional change replaces implicit fail-open behavior with `allowed | rate_limited | unavailable`: 14 public boundaries fail closed with 503, 5 strong-auth boundaries may continue only after authentication, timeout is cancelable at 2000 ms, malformed responses become unavailable and unavailable never becomes 429. Quality Gate 35049217326 passed 285/285 Node and 4/4 PostgreSQL plus typecheck, lint and build. Production `dpl_2bitbdQynYB6QdMiEkB1em65HsAy` is READY and Vercel REST proves `meta.githubCommitSha=c48405e41df3d1cd69eb3d383b7c6dd17257155e`; canonical aliases and health HTTP 200 passed. `risk.rate-limit-fails-open` is RESOLVED. No migration or remote mutation occurred during this freeze.

## Baseline 2.7.2 — historical integrity correction

This `PATCH_DOCUMENTARY_CORRECTION` restores historical baseline attribution accidentally relabeled during 2.7.1 and reconciles current freeze/generation timestamps. No functional source, database, deployment, health or finding lifecycle changed.

| Audited historical mutation | 2.7.1 classification | 2.7.2 result |
| --- | --- | --- |
| 17 functional Baseline 2.7.0 headings relabeled as 2.7.1 | ACCIDENTAL | Restored to 2.7.0 |
| Baseline 2.1.0 SemVer relabeled as documentary patch | ACCIDENTAL | Restored to `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` |
| Four functional Quality Gate identity fields relabeled as 2.7.1/PATCH | ACCIDENTAL | Restored to 2.7.0/MINOR |
| `resolved_semantic_contract.baseline` relabeled from its 2.4.4 origin | ACCIDENTAL | Restored to 2.4.4 |
| CURRENT corrections, new 2.7.1 entries and generated metadata | CORRECT | Preserved or advanced to 2.7.2 as applicable |

## Baseline 2.7.0 — combo metadata serialization

Canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27` was deployed as `dpl_4ZaUUZxWjjjL51jKejGfXA8Ho27g`. Migration `20260915000500_serialize_combo_metadata_transitions.sql` was already applied and validated before that documentary reconciliation. Historical quality was 280/280 Node, 4/4 PostgreSQL, typecheck, lint without errors and build PASS in Quality Gate 34998744062. The metadata lost-update finding was RESOLVED; direct-notification concurrency remained a separate ACTIVE MEDIUM/P2 residual. No remote mutation or deployment occurred during that freeze.


# Rota5 Baseline V1

**Identity:** `rota5-baseline-v1`, version **2.8.0**, status **FROZEN**. Canonical functional source is `c48405e41df3d1cd69eb3d383b7c6dd17257155e`, with 394 files and fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`. The baseline commit is `SELF_NOT_RECORDED` to avoid self-reference.

Rota5 is a Next.js application backed by Supabase/PostgreSQL. The canonical catalog contains 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 169 steps and 74 state transitions. The data catalog contains 45 tables, 88 migrations, 63 SQL functions, 1 sequence, 36 triggers and 2,272 currently catalogued typed relations.

## PRODUCT HEALTH AT FREEZE

**DEGRADED.** Baseline integrity is PASS and the canonical release-blocker set is empty, while independent operational and validation-queue findings remain open.

- Findings: 47; active P0: 0; active HIGH: 0; potential HIGH: 0; open HIGH: 0; resolved: 17; release blockers: 0.
- Broken flows: 0; partial flows: 9.
- Current quality: default Node 285/285 PASS; PostgreSQL 4/4 PASS; Quality Gate 35049217326 PASS; 0 skip, 0 todo and 0 regressions.
- Infrastructure health: **DEGRADED** because independent findings remain open. Git auto-deploy is DISABLED.

## HISTORICAL HIGH #1 FINAL STATE — BASELINE 2.0.0

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

## Universal RESOLVED semantics — Baseline 2.4.4

All 13 findings derived with `status=RESOLVED` now use one mandatory contract: top-level fields describe only current state; every top-level evidence entry carries `evidence_state=CURRENT`; `current_state` is closed, non-operational and non-release-blocking; and the complete former top-level snapshot is retained under `resolution.historical_evidence`. The validator rejects any resolved record that violates this structure or repeats its historical claims as current. No lifecycle, severity, priority or runtime source changed.
