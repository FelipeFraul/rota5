> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

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

- DEFAULT_NODE_SUITE: **236/236 PASS** (0 skip, 0 todo, 0 regressions).
- POSTGRES_INTEGRATION_SUITE: **1/1 PASS**, PostgreSQL 16.
- Actual production trigger executed in CI: **SIM** — `sync_official_table_map_reservation_status`.
- QUALITY_GATE: **PASS**, run **34867214724**, commit `67845326088eac47452224b00ef1e866036e86f1`; npm ci, typecheck, lint and build all PASS.
