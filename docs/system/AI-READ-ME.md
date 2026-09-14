> **Current Baseline 2.5.2 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on unchanged repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency remain **RESOLVED**. Findings and health are unchanged: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers; PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH are **DEGRADED**. Quality remains 257/257 Node, 2/2 PostgreSQL 16 and Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` remains on application source `148b8200a44f4eeb49e004af45060a302bac9f20`; no runtime, database, deployment or functional change occurred.

# Rota5 — AI READ ME

Historical Baseline 2.2.0 snapshot: source 3e2bdc2979301301b3f1566a2ac75a477ee4c169 recorded the tracked runner proof and the then-current 207/214 result. The current canonical state is the Baseline 2.5.2 banner above.

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional or tooling change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
