> **Current Baseline 2.8.1 (2026-09-16):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.8.1 documentary validation

The 2.8.0 documentary Quality Gate run 35107474719 succeeded. The functional Quality Gate remains run 35049217326 on the canonical source commit. The 2.8.1 documentary gate is evaluated against its own commit after push and does not replace functional evidence.

## Baseline 2.8.0 quality gate

Functional Quality Gate 35049217326 passed on `c48405e41df3d1cd69eb3d383b7c6dd17257155e`: Node 285/285, PostgreSQL 4/4, typecheck PASS, lint without errors and build PASS. Product and Infrastructure remain DEGRADED; release blockers remain zero.

## Baseline 2.7.0 quality gate

Functional Quality Gate 34998744062: Node 280/280, PostgreSQL 4/4, typecheck PASS, lint PASS with existing warnings and no errors, build PASS. Release blockers remain zero. This documentary push creates no deployment.

## Historical snapshot — Baseline 2.6.0 quality state

Quality Gate **34984961888 PASS** on `0a10618648fc3f873afffd8f60e60bd0396b62e7`: Node 276/276, PostgreSQL 4/4, typecheck PASS, lint PASS with 23 preexisting warnings, and build PASS. Product and infrastructure health remain DEGRADED; release blockers are zero.

## Historical snapshot — Baseline 2.5.3 quality state

Default Node: **257/257 PASS** (0 fail, 0 skip, 0 todo). Separate PostgreSQL 16 integration: **2/2 PASS**. Quality Gate **34898804387 PASS** on `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`. These are separate suites and must not be reported as 259/259.

# Resumo de qualidade

## Snapshot histórico — Baseline V1 / Etapa 6

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

## Historical snapshot — Baseline 2.5.3

- Findings por prioridade, derivados dos 45 registros: P0 3, P1 11, P2 20, P3 9, P4 2.
- As somas por type, severity, priority e status são 45; registros desconhecidos ou não contabilizados: 0.
- Os invariantes de agregação são obrigatórios para `SEMANTIC_AUDIT: PASS`.

Historical Baseline 2.5.x assessment: A identidade de infraestrutura permanece correta e não há P0 ou HIGH ACTIVE/POTENTIAL. A suíte padrão está verde em 257/257, a integração PostgreSQL em 2/2 e o Quality Gate 34898804387 passou; PRODUCT_HEALTH permanece DEGRADED porque outros riscos operacionais e itens NOT_VALIDATED continuam abertos.
