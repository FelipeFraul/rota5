> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 concurrency proof

The PostgreSQL matrix covers choice-vs-choice, choice-vs-preparation, scan-vs-preparation, scan-vs-READY, arrival-vs-consumption and atomic validation metadata. Node coverage also verifies the versioned READY scan contract and removal of CURRENT client-side raw_metadata snapshot replacement.


# Coverage proof

## Critical remediation

| Measure | Result |
|---|---:|
| MUST capabilities | 21 |
| MUST behaviorally covered | 21 |
| MUST without behavioral coverage | 0 |
| Incidental capabilities additionally proven | 2 |
| High-risk flows covered | 2/2 |
| High-risk flows without behavioral coverage | 0 |
| Historical/orphan items excluded from current risk | 7 |
| Gross capability `UNCOVERED` (informational) | 14 |

The test harness loads production TypeScript modules and checks authorization, mutations, idempotency and side effects. Source-regex-only assertions are not the basis of this resolution.

## Current gate evidence - Baseline 2.8.0

- DEFAULT_NODE_SUITE: **291/291 PASS** (0 skip, 0 todo, 0 regressions).
- POSTGRES_INTEGRATION_SUITE: **4/4 PASS**, PostgreSQL 16.
- PostgreSQL integration groups executed in CI: **4/4 PASS**.
- QUALITY_GATE: **PASS**, run **35141969033**, commit `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`; default Node 291/291, PostgreSQL 4/4, npm ci, typecheck, lint and build all PASS.
