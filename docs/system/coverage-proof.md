> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.


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

- DEFAULT_NODE_SUITE: **276/276 PASS** (0 skip, 0 todo, 0 regressions).
- POSTGRES_INTEGRATION_SUITE: **1/1 PASS**, PostgreSQL 16.
- Actual production trigger executed in CI: **SIM** — `sync_official_table_map_reservation_status`.
- QUALITY_GATE: **PASS**, run **34984961888**, commit `0a10618648fc3f873afffd8f60e60bd0396b62e7`; default Node 276/276, PostgreSQL 4/4, npm ci, typecheck, lint and build all PASS.
