> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

# Change protocol

Before implementation, identify affected capabilities, flows, modules, tables/RPCs, integrations, findings and tests. For an important module, follow module → capabilities → flows → tables → integrations → tests → findings using `self-reading.json`.

After implementation:

1. Update code and meaningful tests.
2. Update affected machine-readable catalogs.
3. Update flows, steps, relations and state transitions when journeys/lifecycles changed.
4. Update findings without deleting history or IDs.
5. Update the corresponding Markdown documents.
6. Recalculate canonical counts, source fingerprint and integrity hashes.
7. Run `node .tools/baseline/validate-baseline.mjs`.
8. Record the change in both changelogs and apply PATCH/MINOR/MAJOR governance.
