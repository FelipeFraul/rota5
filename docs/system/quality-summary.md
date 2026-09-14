> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Resumo de qualidade

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

## Resultado

**PASS documental. Saúde do sistema: BROKEN.** A auditoria completou os 17 domínios, 66 módulos, 56 entrypoints, 140 capabilities, 34 flows, 169 steps, 68 transições, 44 tabelas, 39 funções SQL, 36 triggers, 6 integrações, 2 webhooks, 2 crons, 43 env vars e 51 records no inventário canônico de testes. PASS significa que os artefatos da Etapa 6 foram produzidos e validados; não significa que o produto esteja saudável.

## Contagens

- Findings: 44.
- Severidade: CRITICAL 0, HIGH 10, MEDIUM 23, LOW 9, INFO 2.
- Prioridade: P0 3, P1 11, P2 19, P3 9, P4 2.
- Bugs confirmados: 3.
- Flows quebrados revalidados: 2.
- Capabilities BROKEN/DEGRADED: 10; ORPHANED: 4.
- Test gaps canônicos: 7.

## Pontos mais urgentes

1. Corrigir o JSX inválido antes de qualquer evolução segura.
2. Restaurar o consumo atômico do combo válido.
3. Resolver o projeto/domínio Vercel canônico antes de deploy.
4. Revogar sessões derivadas junto com credenciais de gate/cozinha.
5. Tratar criação multi-entidade e entrega pós-pagamento como fronteiras explícitas.
6. Recuperar um gate de testes portátil e verde.

## Limites

Não houve pentest, carga destrutiva, pagamento, WhatsApp, cron, mutação de banco, alteração Vercel, deploy, commit ou push. Internals remotos do PostgreSQL e registros remotos de webhook continuam NOT_VALIDATED.

## Estado atual da Baseline 2.2.0

A identidade de infraestrutura permanece correta e não há P0 ou HIGH ACTIVE. Restam 1 HIGH POTENTIAL e 1 HIGH operacionalmente aberto. A suíte padrão está verde em 236/236 e o Quality Gate 34867214724 passou; PRODUCT_HEALTH continua BROKEN porque três findings P1 confirmados ainda bloqueiam release. Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` permanece READY no source funcional `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; o HEAD atual não foi implantado e INFRASTRUCTURE_HEALTH permanece DEGRADED.