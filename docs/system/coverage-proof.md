> **Current Baseline 2.7.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.1 concurrency proof

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

## Gate evidence

- DEFAULT_NODE_SUITE: **280/280 PASS** (0 skip, 0 todo, 0 regressions).
- POSTGRES_INTEGRATION_SUITE: **4/4 PASS**, PostgreSQL 16.
- PostgreSQL integration groups executed in CI: **4/4 PASS**.
- QUALITY_GATE: **PASS**, run **34998744062**, commit `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`; default Node 280/280, PostgreSQL 4/4, npm ci, typecheck, lint and build all PASS.
