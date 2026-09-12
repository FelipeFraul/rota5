# ROTA5 SYSTEM KNOWLEDGE

**Current baseline:** v1.1.0 — FROZEN

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

## Audit history
Etapa 1 mapped the repository; Etapa 2 reconstructed architecture; Etapa 3 cataloged capabilities; Etapa 4 cataloged flows and states; Etapa 5 reconstructed data, integrations, infrastructure and runtime; Etapa 6 audited risk and technical debt; Etapa 7 cross-audited completeness; Etapa 8 froze Baseline V1.0.0. Historical detail remains in the indexed documents and machine catalogs. Baseline integrity is PASS while product health is BROKEN. Stabilization P0-1 resolved the invalid JSX; `admin.web_event_workspace` is now PARCIAL and typecheck/lint/build pass.
