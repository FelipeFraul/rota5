# Rota5 — AI READ ME

Current canonical state: Baseline **2.2.0**, source 3e2bdc2979301301b3f1566a2ac75a477ee4c169. The test runner is reproducible from tracked Git content; the default suite remains 207/214 with seven known failures. Product health remains BROKEN and infrastructure health DEGRADED. Production runtime remains dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo on source d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8 because this tooling-only change requires no deployment.

1. Read `system-knowledge/baseline-manifest.json`.
2. Read `system-knowledge/index.json`.
3. Classify the question as architecture, capability, flow, module, data, integration, infrastructure, test, risk, impact, unknown or product health.
4. Follow the matching route in `system-knowledge/self-reading.json`.
5. Read cited evidence before changing code. Never turn NOT_VALIDATED into fact.
6. After any functional or tooling change, update every affected catalog and Markdown projection, regenerate fingerprints/hashes and run `node .tools/baseline/validate-baseline.mjs`.

Quick map: architecture = architecture/domains/modules/dependencies; functionality = capabilities/capability-relations; journeys = flows/flow-steps/flow-relations/state-transitions; data = data-model/database-objects/database-relations; integrations/runtime = integration-runtime/infrastructure/environment/webhooks/cron/runtime-validation; risks = findings/finding-relations/risk-summary/health; reliability = cross-audit/contradictions/unresolved-evidence.
