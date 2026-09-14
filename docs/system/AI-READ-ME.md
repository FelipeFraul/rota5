> **Current Baseline 2.3.0 (2026-09-14):** functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; fingerprint `6851aa10ce08fec1444d08bd213b18349dd70ec8ee6b7753c023164207e9b1d3`; default suite **214/214 PASS** with zero known failures and zero new regressions. Finding `gap.default-test-suite-failing` is **RESOLVED**. Current Production is `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` (READY) and Preview evidence is `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6`. Metrics: ACTIVE HIGH 1, POTENTIAL HIGH 1, OPEN HIGH 2, RESOLVED 8. Product health remains BROKEN; infrastructure health remains DEGRADED. Older baseline sections below are historical evidence.

# Rota5 — AI READ ME

Historical Baseline 2.2.0 snapshot: source 3e2bdc2979301301b3f1566a2ac75a477ee4c169 recorded the tracked runner proof and the then-current 207/214 result. The current canonical state is the Baseline 2.3.0 banner above.

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional or tooling change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
