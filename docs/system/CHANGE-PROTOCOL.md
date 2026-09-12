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
