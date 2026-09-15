> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 closeout

Source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`, migration `20260915000500`, Quality Gate 34998744062 PASS and existing Production deployment `dpl_4ZaUUZxWjjjL51jKejGfXA8Ho27g` close the metadata-race item. The direct-notification concurrency residual enters P2. No remote change, Vercel deployment, cron, WhatsApp send or Ticketeira access occurred during reconciliation.

## Surgical documentary correction — Baseline 2.6.2

NEXT-ACTIONS now matches canonical lifecycle/priority metadata and current test evidence. Baseline 2.6.0 remains the functional MINOR, 2.6.1 remains the temporal-metadata PATCH, and 2.6.2 is this projection-only PATCH.

## Documentary correction — Baseline 2.6.1

Current generation/freeze/observation timestamps now come from the real 2.6.1 execution clock. The prior 2.6.0 documentary freeze is dated only from authoritative Git evidence: `e5870d9864914b990274e3a99342d53c2810c710` at `2026-09-15T12:45:09-03:00`. Findings methodology metadata now identifies Baseline 2.6.1. No functional milestone, database, deployment, finding lifecycle, release gate or health changed.

## Paid-delivery stabilization — 15/09/2026

Chronology: durable paid TICKET delivery and `superseded` status; durable paid COMBO delivery; versioned deterministic/HMAC QR recovery; collision-safe redemption codes; sequence privilege hardening; joint final reaudit. The original payment-before-delivery-work risk is RESOLVED. Ambiguous external ACK remains a separate P2 ACTIVE risk under at-least-once semantics.

# Stabilization history — 12–14 September 2026

This is the canonical human timeline reconstructed from Git history, committed migrations, baseline manifests, changelog entries, Quality Gate evidence, deployment identity and runtime/remote validation. Chat conversation is not canonical evidence.

## 2026-09-12

- **DOCUMENTED — initial V1 freeze.** Baseline 1.0.0 recorded the starting source at `a141c600…`; commit `7c00adb…` froze the first canonical knowledge set.
- **RESOLVED — P0 administrative workspace.** Commit `121b7a8…` removed the invalid JSX that blocked the admin event workspace.
- **RESOLVED — P0 combo redemption.** Commit `19950bc…` restored the path to atomic combo consumption while preserving its focused regression proof.
- **RESOLVED — infrastructure identity.** Commit `9302cbd…` separated Rota5 from Ticketeira and disabled Vercel Git auto-deploy.
- **MITIGATED, then completed on 13/09 — credential/session lifecycle.** Commit `cacbc43…` added source attribution, transactional revocation, rollout tests and migration `20260912000100_gate_credential_session_revocation_expand.sql`.

## 2026-09-13

- **RESOLVED — credential/session guards.** Commit `bd0012f…` finalized `20260913000100_gate_credential_session_revocation_contract.sql`; strict ticket/combo authorization and credential-linked session revocation passed the rollout gates.
- **REMOVED — active legacy-brand contamination.** Commit `d2b2857…` removed the audited active Rota5 surfaces without claiming that all historical strings disappeared.
- **RESOLVED — test-runner reproducibility.** Commit `3e2bdc2…` moved the alias loader into tracked source.
- **RESOLVED — default suite.** Commit `c726902…` corrected the known test/runtime regressions and restored the default suite.

## 2026-09-14

- **RESOLVED — critical coverage and PostgreSQL CI.** Commits `03c5a36…`, `102d765…` and `6784532…` added behavioral coverage, a separate PostgreSQL 16 job and a manual Quality Gate trigger. Quality Gate `34867214724` passed for that cycle.
- **RESOLVED — Baseline 2.4.x semantics.** Commits `5a4298b…`, `7a5c71b…`, `fc71d75…` and `770732f…` reconciled blocker derivation, stale projections, complete aggregates and universal RESOLVED semantics.
- **RESOLVED — administrative atomicity.** Commits `b8e74db…`, `a912afb…`, `31198b9…` and `2520566…` introduced migration `20260914000100_create_admin_event_catalog_rpcs.sql`, transactional CREATE/UPDATE/DUPLICATE, `admin_event_operations`, persistent idempotency, preserved duplicate intent, and safe web/WhatsApp retries. Node and PostgreSQL proofs cover rollback and retry behavior.
- **RESOLVED — location consistency.** Migration `20260914000200_create_update_admin_event_venue_rpc.sql` is retained as history. Commit `6d90550…` and migration `20260914000300_enforce_admin_event_location_consistency.sql` made venue/city/state coherent, preserved session venues on non-location saves, blocked unsafe multi-venue or mapped changes, updated safe single-venue event plus sessions atomically and made ticket readers session-first. Commit `e931d66…` and migration `20260914000400_retire_legacy_admin_event_venue_rpc.sql` removed the old event-only RPC.
- **RESOLVED — final joint audit.** Quality Gate `34898804387` passed on `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`. Remote evidence recorded 7 events, 7 sessions, 0 event/session venue divergences, 0 city/state divergences and legacy `update_admin_event_venue` absent.
- **DOCUMENTED — freeze 2.5.0.** No Vercel deployment, Supabase mutation or Ticketeira access was performed by the freeze.

## State at closure of the stabilization cycle

- Baseline: **2.5.0**
- Repository source: `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`
- Production application source: `148b8200a44f4eeb49e004af45060a302bac9f20` via `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf`
- Default Node suite: **257/257 PASS**
- PostgreSQL 16 integration: **2/2 PASS**
- Quality Gate: **34898804387 PASS**
- Atomicity: **RESOLVED**
- Admin location consistency: **RESOLVED**
- Product health: **DEGRADED**; infrastructure health: **DEGRADED**
- Remaining state: 21 ACTIVE, 6 POTENTIAL and 5 NOT_VALIDATED findings; examples include the combo metadata race, payment/external-delivery boundary, webhook registration evidence and incomplete local runtime configuration.
- **HARDENING CANDIDATE:** retention/cleanup for `admin_event_operations` is separate work, not a formal finding or release blocker.

The stabilization cycle of 12–14/09/2026 is closed. This statement does not mean the system has no remaining risks.

## Post-freeze documentary correction — Baseline 2.5.1

Baseline 2.5.1 is a `PATCH_DOCUMENTARY_CORRECTION` after the functional 2.5.0 freeze. It reconciles stale current/top-level metadata only; the 12–14/09/2026 milestones, source, runtime, database, tests, findings lifecycles, health, release blockers and closed-cycle status are unchanged.

## Post-freeze documentary patch — Baseline 2.5.2

Baseline 2.5.2 is a `PATCH_DOCUMENTARY_CORRECTION` that reconciles verified CURRENT scorecard/runtime projections and records a side-effect-free OpenAPI revalidation. The functional three-day milestones remain preserved and `DOCUMENTED_AND_CLOSED`; no runtime behavior, database mutation, finding lifecycle, health, release blocker or deployment changed.

## Historical documentary patch — Baseline 2.5.3

Baseline 2.5.3 removed live-branch self-reference from its then-current runtime semantics and made the complete human runtime table a validated projection of the machine catalog. That three-day stabilization cycle remained `DOCUMENTED_AND_CLOSED`; no functional source, runtime behavior, database, finding lifecycle, health, release blocker or deployment changed in that historical patch.
