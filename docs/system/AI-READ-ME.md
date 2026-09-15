> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.


# Rota5 — AI READ ME

Historical Baseline 2.2.0 snapshot: source 3e2bdc2979301301b3f1566a2ac75a477ee4c169 recorded the tracked runner proof and the then-current 207/214 result. The current canonical state is the Baseline 2.6.0 banner above.

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional or tooling change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
