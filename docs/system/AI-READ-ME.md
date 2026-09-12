# Rota5 — AI READ ME

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
