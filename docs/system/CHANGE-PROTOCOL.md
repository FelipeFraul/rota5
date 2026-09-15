> **Current Baseline 2.7.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
