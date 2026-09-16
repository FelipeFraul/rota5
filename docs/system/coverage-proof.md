> **Current Baseline 2.8.1 (2026-09-16):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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

- DEFAULT_NODE_SUITE: **285/285 PASS** (0 skip, 0 todo, 0 regressions).
- POSTGRES_INTEGRATION_SUITE: **4/4 PASS**, PostgreSQL 16.
- PostgreSQL integration groups executed in CI: **4/4 PASS**.
- QUALITY_GATE: **PASS**, run **35049217326**, commit `c48405e41df3d1cd69eb3d383b7c6dd17257155e`; default Node 285/285, PostgreSQL 4/4, npm ci, typecheck, lint and build all PASS.
