> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Current Baseline 2.9.0

The functional source is `c7ed2c31eb9c322ef489e71bb59631c39928a1e0` and the Production deployment is `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc`. The 00600 migration and ledger are validated; the remaining remote database findings retain their own resolution criteria. See the manifest, runtime validation and stabilization history for evidence.


# ROTA5 SYSTEM KNOWLEDGE

**Current baseline:** v2.7.4 — FROZEN

**Start here:** [AI-READ-ME.md](AI-READ-ME.md) · [BASELINE-V1.md](BASELINE-V1.md) · [CANONICAL-INDEX.md](CANONICAL-INDEX.md)

The machine bootstrap is `system-knowledge/baseline-manifest.json`; routing is in `system-knowledge/self-reading.json`.

## Architecture
[Architecture](architecture.md) · [Domains](domains.md) · [Modules](modules.md) · [Dependencies](dependencies.md) · [Entrypoints](entrypoints.md)

## Capabilities
[Capabilities](capabilities.md) · [Matrix](capability-matrix.md) · [Test coverage](capability-test-coverage.md) · [Orphans](orphan-capabilities.md)

## Flows
[Flows](flows.md) · [Flow matrix](flow-matrix.md) · [Flow steps and coverage](flow-test-coverage.md) · [State transitions](state-transitions.md) · [Broken flows](broken-flows.md)

## Data
[Data model](data-model.md) · [Database runtime](database-runtime.md) · [Data integrity risks](data-integrity-risks.md)

## Integrations
[External dependencies](external-dependencies.md) · [Integrations runtime](integrations-runtime.md) · [Webhooks and cron](webhooks-cron.md)

## Infrastructure
[Infrastructure](infrastructure.md) · [Environment](environment-variables.md) · [Configuration drift](configuration-drift.md) · [Runtime validation](runtime-validation.md) · [Observability](observability.md)

## Tests
[Test inventory](tests-inventory.md) · [Test gaps](test-gaps.md)

## Risks
[Risk register](risk-register.md) · [Quality summary](quality-summary.md) · [Security](security-risks.md) · [Technical debt](technical-debt.md) · [Next actions](NEXT-ACTIONS.md)

## Governance
[Governance](GOVERNANCE.md) · [Change protocol](CHANGE-PROTOCOL.md) · [Known limits](KNOWN-LIMITS.md) · [Changelog](CHANGELOG.md)

## Stabilization history
[Human timeline](stabilization-history.md) · machine-readable: `system-knowledge/stabilization-history.json`

## Audit history
Etapa 1 mapped the repository; Etapa 2 reconstructed architecture; Etapa 3 cataloged capabilities; Etapa 4 cataloged flows and states; Etapa 5 reconstructed data, integrations, infrastructure and runtime; Etapa 6 audited risk and technical debt; Etapa 7 cross-audited completeness; Etapa 8 froze Baseline V1.0.0. Historical detail remains in the indexed documents and machine catalogs. Baseline integrity is PASS while product and infrastructure health are DEGRADED. Stabilization resolved P0-1 and P0-2, then P0-3 separated the Git/Vercel identity: `FelipeFraul/rota5` on `production` now maps to Vercel `rota5`. No P0 remains active; product health remains BROKEN and infrastructure health is DEGRADED.
