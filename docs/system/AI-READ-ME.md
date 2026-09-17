> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Current Baseline 2.9.0

Canonical functional source: `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Production: `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc` READY, with both aliases and health passing. The documentary freeze does not deploy an application. Migration 00600 was applied by official Supabase db push after a separate ledger repair of nine earlier direct-SQL migrations; the ledger is aligned with zero pending. Start from the manifest, index and self-reading catalog.



# Rota5 — AI READ ME

Historical Baseline 2.2.0 snapshot: source 3e2bdc2979301301b3f1566a2ac75a477ee4c169 recorded the tracked runner proof and the then-current 207/214 result. The current canonical state is the Baseline 2.6.0 banner above.

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional or tooling change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
