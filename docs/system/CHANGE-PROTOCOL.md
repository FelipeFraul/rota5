> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

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
