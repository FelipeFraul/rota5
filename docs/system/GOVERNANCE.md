> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Canonical migration application policy

Canonical files under `supabase/migrations/**` should be applied through the official Supabase migration mechanism when the ledger is aligned. Direct pg.Client application is exceptional and requires explicit, audited migration-history reconciliation before the operation is considered complete. Schema presence, historical SQL execution, migration-ledger registration, PostgreSQL CI and Production runtime are distinct evidence categories. This is a governance policy, not a runtime capability.



# Baseline governance

**NENHUMA MUDANÇA FUNCIONAL É CONSIDERADA CONCLUÍDA ATÉ QUE A DOCUMENTAÇÃO IMPACTADA SEJA ATUALIZADA.**

Cycle: PROPOSAL → IMPACT ANALYSIS → IMPLEMENTATION → TESTS → AUDIT → DOCUMENTATION → VALIDATION → NEW BASELINE STATE.

Before work, traverse module → capabilities → flows → tables/functions → integrations → tests → findings. Run `node .tools/baseline/validate-baseline.mjs` manually before accepting a new baseline state.

New capabilities require canonical ID, domain, type, description, modules, entrypoints, data, flow, tests and evidence. Journey/lifecycle changes must review `flows.json`, `flow-steps.json`, `flow-relations.json` and `state-transitions.json`, including branches and failure paths. Migrations must update data catalogs when applicable; a local migration never proves remote application. Integration changes must review env, authentication, webhook, retry, idempotency, observability, runtime, flows and findings.

Finding lifecycle has seven canonical statuses. The machine-readable source is `system-knowledge/findings.json` → `finding_status_taxonomy`; the validator derives metric and release-gate membership from its properties. Historical Etapa 6 statuses remain valid: `ACTIVE` is a confirmed operational finding and `POTENTIAL` is an evidence-supported, unconfirmed risk. The future lifecycle is `OPEN`, `MITIGATED`, `RESOLVED`, `ACCEPTED` and `NOT_VALIDATED`. `OPEN` is confirmed and unmitigated; `MITIGATED` is confirmed with a recorded mitigation but without proof of resolution; both are operationally open and block release at applicable severity. `ACCEPTED` is a documented, authorized risk acceptance: it remains historically unresolved but is closed for operational metrics, release gates and the stabilization queue. `NOT_VALIDATED` lacks sufficient evidence for confirmation; it is excluded from operational-open and release-blocking metrics, while remaining in the validation queue. `RESOLVED` has preserved proof and is closed. `active_*` remains literal to historical `ACTIVE`; `potential_*` remains literal to `POTENTIAL`; `open_*` uses the explicit set `ACTIVE`, `POTENTIAL`, `OPEN`, `MITIGATED` as a work inventory and is not itself a release gate. Release gates use the explicit confirmed set `ACTIVE`, `OPEN`, `MITIGATED` at priority `P0`/`P1` or severity `CRITICAL`/`HIGH`, never a generic status exclusion. Resolution preserves the finding ID and records date, evidence, related change and proving test.

Versioning: PATCH for documentary correction without functional change; MINOR for compatible functional or tooling change, new capability or flow evolution; MAJOR for significant architectural or contractual change. Versions use numeric SemVer (`MAJOR.MINOR.PATCH`) without restricting the major number. Baseline 2.2.0 identifies a pure committed source with `functional_changes_since_base: []`, `generated_from_working_tree: false`, the base commit and final source fingerprint. The Git commit containing a baseline is not stored inside its own content, avoiding self-reference; working-tree observations are informational.

## Baseline 2.0.0 contractual boundary (historical, unchanged by 2.0.1)

Version 2.0.0 is MAJOR because FINAL_DB requires strict-only authorization and is intentionally incompatible with OLD_APP. The production runtime artifact may differ from the canonical repository source commit when the latter changes only migrations/tests and `src/**` is byte-identical.
