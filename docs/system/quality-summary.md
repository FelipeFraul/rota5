> **Current Baseline 2.3.0 (2026-09-14):** functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; fingerprint `6851aa10ce08fec1444d08bd213b18349dd70ec8ee6b7753c023164207e9b1d3`; default suite **214/214 PASS** with zero known failures and zero new regressions. Finding `gap.default-test-suite-failing` is **RESOLVED**. Current Production is `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` (READY) and Preview evidence is `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6`. Metrics: ACTIVE HIGH 1, POTENTIAL HIGH 1, OPEN HIGH 2, RESOLVED 8. Product health remains BROKEN; infrastructure health remains DEGRADED. Older baseline sections below are historical evidence.

# Resumo de qualidade

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

## Resultado

**PASS documental. Saúde do sistema: BROKEN.** A auditoria completou os 17 domínios, 66 módulos, 56 entrypoints, 140 capabilities, 34 flows, 169 steps, 66 transições, 44 tabelas, 33 funções SQL, 33 triggers, 6 integrações, 2 webhooks, 2 crons, 43 env vars, 4 drifts e todos os 43 testes catalogados. PASS significa que os artefatos da Etapa 6 foram produzidos e validados; não significa que o produto esteja saudável.

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

A identidade de infraestrutura permanece correta e não há P0 ativo. Permanecem 1 HIGH ACTIVE, 1 HIGH POTENTIAL e 2 HIGH abertos. A suíte padrão está verde em 214/214 com runner reproduzível do Git; PRODUCT_HEALTH continua BROKEN pelo gap crítico de cobertura. Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` está READY no source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; INFRASTRUCTURE_HEALTH permanece DEGRADED devido aos demais findings.