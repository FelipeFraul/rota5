> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
