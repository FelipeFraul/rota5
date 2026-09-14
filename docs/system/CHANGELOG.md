> **Current Baseline 2.4.3 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on canonical source `67845326088eac47452224b00ef1e866036e86f1` (fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`, 368 files, 79 migrations). Findings `bug.event-duplicate-artist-leak` and `bug.user-visible-text-corruption` are **RESOLVED** as stale. `gap.partial-flows-lack-end-to-end-proof` remains **ACTIVE**, decomposed from P1 to P2; no specific P1 was justified. Canonical release blockers: **0**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 11. PRODUCT_HEALTH: **DEGRADED**; INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality evidence remains 236/236, PostgreSQL 1/1 and Quality Gate 34867214724 PASS. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; no deployment, Supabase change or Ticketeira access.

## Baseline 2.3.0 — default suite restored

- Type: `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE`
- Source: `c726902505fd69c2cfef2dec8013ffe0cf0adba3`
- Functional fingerprint: `6851aa10ce08fec1444d08bd213b18349dd70ec8ee6b7753c023164207e9b1d3` (358 files; 79 migrations)
- Default suite: **207/214 → 214/214**; seven known failures → zero; no new regressions.
- `gap.default-test-suite-failing`: **ACTIVE → RESOLVED**.
- Event duplication artist inheritance, scoped dashboard/publicHelp corruption, and fragile assertions were corrected in four remediation blocks.
- Typecheck, lint (0 errors/23 preexisting warnings), build, F1–F7, Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` and Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa`: PASS/READY.
- Related finding lifecycles unchanged. Supabase unchanged; Ticketeira untouched.

## BASELINE 2.2.0 — TEST RUNNER REPRODUCIBLE

- **MINOR_COMPATIBLE_TOOLING_CHANGE** on source `3e2bdc2979301301b3f1566a2ac75a477ee4c169`, fingerprint `fcfe71ec31dc69efc87275b598ab526dab43d6564369772b71be335703deadba`, 357 source files and 79 migrations.
- Replaced the ignored `.tmp/typescript-alias-loader.mjs` dependency with byte-identical tracked `scripts/test-support/typescript-alias-loader.mjs`; no dependency was added and loader behavior did not change.
- Clean canonical Git materialization passed `npm ci` and started `npm test`: 207/214 with the same seven known failures and zero new regressions.
- `gap.test-runner-depends-on-untracked-loader` moved ACTIVE → RESOLVED. No other finding lifecycle changed.
- The first Windows `core.autocrlf=true` worktree exposed two additional source-text assertion failures; this was recorded as evidence for the existing `gap.source-contract-assertion-bias`, without changing its status.
- Production runtime remains `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo`; no deployment, Supabase change or Ticketeira change occurred.
- ACTIVE HIGH=2, POTENTIAL HIGH=1, OPEN HIGH=3 and RESOLVED=7. Product health remains BROKEN and infrastructure health DEGRADED.

# Baseline changelog

## BASELINE V2.1.0 - SCOPED ACTIVE-BRAND RESOLUTION

- **MINOR_COMPATIBLE_FUNCTIONAL_CHANGE** on source `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`, fingerprint `b18a51cba6668b4ea37854f4e722181961cf9afac13d8f02638672a75c18426e`, 356 functional files and 79 migrations.
- Removed the documented active RockBar/Black House branding from checkout notices, five public-help responses, scoped router prompts, CSS/background assets, static CORS and the unused environment-schema entry.
- Preview `dpl_4MAmzsQ6NVM36W1uie5VoVJas9zW` and Production `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo` are READY on the exact source commit; scoped runtime checks passed and relevant Production log errors are zero.
- `legacy.active-brand-contamination` moved from ACTIVE to RESOLVED for `DOCUMENTED_AND_REAUDITED_ACTIVE_SURFACES`. Historical strings outside that audited scope are not covered by the resolution assertion.
- ACTIVE HIGH=3, POTENTIAL HIGH=1, OPEN HIGH=4 and RESOLVED=6. Product health remains BROKEN and infrastructure health DEGRADED.
- Typecheck, lint and build passed; focused tests are 114/116 with two unrelated preexisting failures; the default suite remains 207/214 with the same seven failures; new regressions=0.
- Supabase and Ticketeira were unchanged; Git auto-deploy remains DISABLED.


## BASELINE V2.0.1 — GATE F-I SEMANTIC CORRECTION

- PATCH_DOCUMENTATION_SEMANTIC_CORRECTION only; no functional, runtime or remote change.
- Corrected the canonical mapping to F=strict ticket validation, G=strict combo validation, H=temporary credential revocation and I=fixed credential revocation.
- All gates remain PASS and HIGH #1 remains RESOLVED. Metrics, product/infrastructure health and functional source identity are unchanged.
- Baseline 2.0.0 is preserved below as historical evidence.

## BASELINE V2.0.0 — HIGH #1 FINAL CONTRACT

- Froze source commit `bd0012f3a3277b2b6d1a97390ba7c3cc460a9165`, fingerprint `c70f133b075bc479e713d052fb0001c5e95ce35c140892bd5e5b6a121e05a53f` and 356 functional files.
- MAJOR: FINAL_DB is strict-only and intentionally incompatible with OLD_APP.
- EXPAND and CONTRACT are APPLIED_AND_VALIDATED; CONTRACT `20260913000100_gate_credential_session_revocation_contract` applied at `2026-09-13T18:11:18.773635Z` with SHA-256 `bb90b8da28217c1cdfa86bc68780aac05fbb8c16cb8058d2ba55f9d48e16a525`.
- Gates A-I and post-CONTRACT runtime passed. HIGH #1 moved explicitly from ACTIVE to RESOLVED; active HIGH=4, potential HIGH=1, open HIGH=5, resolved=5.
- Production remains READY at `dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT`, serving runtime artifact `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`; no new deployment was required. Product health remains BROKEN and infrastructure health remains DEGRADED.

## BASELINE V1.4.1 — HIGH #1 EXPAND AND NEW_APP PRODUCTION CUTOVER

- Preserved functional source commit `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8`, fingerprint `6643a2c539caab8942ebe3953dc75963446d27dbb653e166a3310fe2c4e2fc4b` and 355 functional files.
- EXPAND migration `20260912000100_gate_credential_session_revocation_expand` is `APPLIED_AND_VALIDATED` since `2026-09-13T14:20:15.059853Z`; source attribution remains nullable in dual-mode.
- Exact NEW_APP artifact completed Production cutover as `dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT` at `2026-09-13T16:19:42.340Z`. Health, public page, admin auth and EXPAND runtime probe passed with zero relevant log errors; rollback was not performed.
- Semantic audit proved `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` is an ancestor of `origin/production`, so `new_app_pushed=true`. It also resolved only `risk.latest-rota5-deployment-error`: the current Production deployment is READY and serves the canonical aliases. Derived HIGH metrics are now ACTIVE 5, POTENTIAL 1, OPEN 6 and RESOLVED 4.
- Gates A/B are PASS; C and F-I are PENDING; D/E are PENDING_FORMAL_CONFIRMATION. CONTRACT remains `DRAFT_ONLY / NOT_APPLIED` and prohibited until A-I pass.
- HIGH #1 remains `ACTIVE/HIGH/P1`; product health remains BROKEN and infrastructure health remains DEGRADED.

## BASELINE V1.4.0 — HIGH #1 SOURCE IMPLEMENTED, ROLLOUT NOT STARTED

- Froze functional source commit `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` with credential source attribution, transactional credential/session revocation and atomic ticket/combo authorization.
- Added one executable EXPAND migration. The CONTRACT SQL remains a protected draft outside `supabase/migrations/**`.
- Rollout strategy is EXPAND -> DEPLOY -> gates A-I -> CONTRACT -> post-fix runtime audit.
- Local proof passed: focused 96/96, PostgreSQL 16 matrix, ticket race 2/2, combo race 2/2 and Phase 0 release-path validation.
- The finding remains `ACTIVE/HIGH/P1`: EXPAND is not applied remotely, NEW_APP is not deployed and CONTRACT is not applied.
- Default gates remain typecheck PASS, lint PASS with 24 preexisting warnings, npm test 207/214 with the same seven historical failures, and build PASS with the existing warning.

# Baseline changelog

## BASELINE V1.3.1 — FINDING TAXONOMY CORRECTED

- Corrected derived finding metrics without changing product code or any finding status.
- `ACTIVE` now counts strictly as ACTIVE: 0 P0 and 6 HIGH. `POTENTIAL` is tracked separately: 1 HIGH. `OPEN` is explicit: 7 HIGH.
- `risk.admin-event-multistep-partial-state` remains `POTENTIAL/HIGH`; its static evidence supports a risk hypothesis but not an observed intermediate failure.
- Reconciled the complete lifecycle: `OPEN` and `MITIGATED` are confirmed, operationally open statuses; `ACCEPTED` and `NOT_VALIDATED` are excluded from operational-open and release-blocking metrics by explicit policy.

## BASELINE V1.3.0 — P0-3 RESOLVED

- Resolved `risk.vercel-project-identity-drift` while preserving its historical ID, severity, priority, root cause and evidence.
- Canonical chain: GitHub `FelipeFraul/rota5`, branch `production`, Vercel `rota5` (`prj_dl7tt8fZbw88ZQV0GhklY0akEwbf`).
- Vercel `site` and GitHub `FelipeFraul/ticketeira` are Ticketeira infrastructure and remain only as historical cause evidence.
- Git auto-deployment remains disabled; no deployment was created and HEAD `9302cbd46aec802fef371e9c948e7d558c3dfc2a` is not declared published.
- Source state is the pure base commit with zero functional changes since base; product health remains BROKEN and infrastructure health is DEGRADED.

## BASELINE V1.2.0 — P0-2 RESOLVED

- Resolved `bug.combo-redemption-unreachable-consume` with a minimal guard change in `src/lib/tickets/services/comboRedemptions.ts`.
- `combo.redeem`: QUEBRADA → PARCIAL; `kitchen.combo_redemption`: QUEBRADO → PARCIAL.
- Five focused local behavior tests pass; no remote mutating test was executed.
- Gates: typecheck PASS; lint PASS with 24 preexisting warnings; npm test 207/214 with the same 7 preexisting failures; build PASS with the existing warning.
- Baseline remains FROZEN; source base commit `121b7a8a4870f5933bd0cf0d45f12a8d71132424`; baseline commit SELF_NOT_RECORDED.

## BASELINE V1.1.0 — P0-1 RESOLVED

- Date: 2026-09-12T13:36:12.110Z
- `bug.create-event-invalid-jsx`: RESOLVED with ID/severity/priority history preserved.
- Functional diff: one excess `</div>` removed from `CreateEventModal.tsx`.
- Gates: typecheck PASS; lint PASS with 24 preexisting warnings; npm test unchanged at 203/210; build PASS with the existing NFT/Turbopack warning.
- Flow: `admin.web_event_workspace` changed from QUEBRADO to PARCIAL. Capability statuses did not change.
- No commit, push, deploy or remote change was performed.

## BASELINE V1.0.0 — FROZEN

- Date: 2026-09-12T04:24:28.619Z
- Source commit: `a141c6004421fb8442f95493de3ca4ec4d4c997b` on `production`, equal to `origin/production`.
- Working tree: dirty because baseline artifacts are untracked and `src/lib/tickets/messages.ts` has the preserved preexisting hash `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`.
- Metrics: 17 domains, 66 modules, 56 entrypoints, 140 capabilities, 34 flows, 44 tables, 43 tests and 44 findings.
- Known broken state: 3 P0, 10 HIGH, 2 broken flows, 7 partial flows; npm test, typecheck and lint fail.
- Unresolved evidence: 10 explicit groups. No commit, push or deploy was performed.

## Baseline 2.4.2 — semantic consistency correction

- Type: `PATCH_DOCUMENTARY_CORRECTION`; canonical runtime source unchanged.
- Reconciled the two RESOLVED bug records so top-level machine-readable fields describe current resolution while original evidence remains explicitly historical.
- Re-derived risk, coverage, finding-status, release-blocker and health projections from canonical catalogs and taxonomy.
- Current audit: 0 semantic contradictions, 0 stale current projections, 0 resolved findings with active top-level claims and 0 release blockers.
- Product and infrastructure health remain `DEGRADED`; no domain is `BROKEN`.
- No lifecycle, source, test, workflow, deployment, Supabase or Ticketeira change.

## Baseline 2.4.3 — aggregation completeness correction

- Type: `PATCH_DOCUMENTARY_CORRECTION`; canonical runtime source unchanged.
- Derived the actual priority vocabulary from all 44 findings: P0 3, P1 10, P2 20, P3 9 and P4 2.
- Sums by type, severity, priority and status each equal 44; unknown or uncounted findings: 0.
- Semantic PASS now requires aggregation invariants to hold in the canonical validator and machine-readable audit.
- Release blockers remain 0; product and infrastructure health remain `DEGRADED`; no domain is `BROKEN`.
