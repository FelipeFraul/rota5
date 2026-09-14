> **Current Baseline 2.5.0 (2026-09-14):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency are **RESOLVED**. Findings: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED; release blockers: 0. PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality: 257/257 Node, 2/2 PostgreSQL 16, Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` runs application source `148b8200a44f4eeb49e004af45060a302bac9f20`; later migration/test-only commits create expected non-runtime drift. No deployment or remote mutation occurred during this freeze.

## Baseline 2.5.0 current quality state

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

## Estado canônico atual — Baseline 2.5.0

- Findings por prioridade, derivados dos 45 registros: P0 3, P1 11, P2 20, P3 9, P4 2.
- As somas por type, severity, priority e status são 45; registros desconhecidos ou não contabilizados: 0.
- Os invariantes de agregação são obrigatórios para `SEMANTIC_AUDIT: PASS`.

A identidade de infraestrutura permanece correta e não há P0 ou HIGH ACTIVE/POTENTIAL. A suíte padrão está verde em 257/257, a integração PostgreSQL em 2/2 e o Quality Gate 34898804387 passou; PRODUCT_HEALTH permanece DEGRADED porque outros riscos operacionais e itens NOT_VALIDATED continuam abertos.
