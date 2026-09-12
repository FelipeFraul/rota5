# Baseline governance

**NENHUMA MUDANÇA FUNCIONAL É CONSIDERADA CONCLUÍDA ATÉ QUE A DOCUMENTAÇÃO IMPACTADA SEJA ATUALIZADA.**

Cycle: PROPOSAL → IMPACT ANALYSIS → IMPLEMENTATION → TESTS → AUDIT → DOCUMENTATION → VALIDATION → NEW BASELINE STATE.

Before work, traverse module → capabilities → flows → tables/functions → integrations → tests → findings. Run `node .tools/baseline/validate-baseline.mjs` manually before accepting a new baseline state.

New capabilities require canonical ID, domain, type, description, modules, entrypoints, data, flow, tests and evidence. Journey/lifecycle changes must review `flows.json`, `flow-steps.json`, `flow-relations.json` and `state-transitions.json`, including branches and failure paths. Migrations must update data catalogs when applicable; a local migration never proves remote application. Integration changes must review env, authentication, webhook, retry, idempotency, observability, runtime, flows and findings.

Future finding lifecycle: OPEN, MITIGATED, RESOLVED, ACCEPTED, NOT_VALIDATED. Historical Etapa 6 statuses remain unchanged. Resolution preserves the finding ID and records date, evidence, related change and proving test.

Versioning: PATCH for documentary correction without functional change; MINOR for compatible functional change, new capability or flow evolution; MAJOR for significant architectural or contractual change. This freeze remains 1.0.0.
