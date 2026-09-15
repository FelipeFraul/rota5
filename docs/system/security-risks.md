> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

# Riscos de segurança e autorização

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### risk.gate-credential-revocation-does-not-revoke-session — Pausa/revogação da credencial não invalida sessões de leitor já emitidas

- Current Baseline 2.0.1 status: **RESOLVED / HIGH / P1**. EXPAND and CONTRACT are applied and validated; gates A-I, strict runtime, credential revocation, legacy rejection, source-null rejection and source immutability passed. Historical Stage 6 evidence is preserved in findings.json.

### risk.rate-limit-fails-open — Falha do rate limiter libera a requisição

- Tipo / severidade / prioridade: **SECURITY / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: consumeRateLimit registra warning e retorna allowed em exceção, deixando endpoints públicos sem proteção durante indisponibilidade do banco/RPC.
- Evidência: `src/lib/security/rateLimit.ts`:127 — Catch explicitamente registra “failed open”.
- Impacto: Ataques de volume ou abuso não são contidos justamente durante falha da dependência de rate limit.
- Escopo: domains domain.platform-runtime; capabilities platform.limit_requests; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Autenticação/assinatura e validações específicas continuam aplicáveis onde existem.
- Direção: Definir política de degradação por criticidade de endpoint.
- Justificativa da prioridade: P2 porque é uma escolha ativa de disponibilidade com condição específica, sem exploração observada.

### risk.remote-database-controls-unvalidated — Controles remotos de banco além do schema visível não foram validados

- Tipo / severidade / prioridade: **UNKNOWN / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / CONFIRMED**
- Problema: OpenAPI confirmou tabelas/colunas/RPCs, mas não constraints, índices, triggers, corpos de função, migrations aplicadas, RLS, policies, grants ou Auth remoto.
- Evidência: `system-knowledge/data-model.json` — Validação remota limitada ao contrato exposto.; `system-knowledge/integrations.json` — Integração Supabase registra explicitamente os controles não validados.
- Impacto: A baseline não pode afirmar que guardas locais de integridade, concorrência e autorização existem com a mesma forma em produção.
- Escopo: domains domain.platform-runtime, domain.reservation-inventory, domain.orders-payments, domain.ticketing-delivery; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Comparação de 45 tabelas/colunas e 42 rotas RPC medidas diretamente reduz a incerteza de superfície.
- Direção: Comparar metadados e definições remotas por canal autorizado.
- Justificativa da prioridade: P2 porque é incerteza relevante, não vulnerabilidade ou divergência comprovada.

### risk.service-role-application-authorization-boundary — A autorização da aplicação protege operações que usam service role

- Tipo / severidade / prioridade: **SECURITY / MEDIUM / P2**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: APIs server-side usam o cliente administrativo que contorna RLS; segurança depende de cada handler validar sessão, CSRF, segredo, token e ownership antes da consulta/mutação.
- Evidência: `src/lib/supabase/admin.ts` — Cria cliente com service role no servidor.; `system-knowledge/infrastructure.json` — Boundary API→Supabase registra bypass de RLS.; `system-knowledge/entrypoints.json` — 56 entrypoints ampliam a superfície a revisar.
- Impacto: Uma omissão de autorização em um único handler teria privilégios amplos no banco; nenhuma rota explorável foi confirmada nesta etapa.
- Escopo: domains domain.platform-runtime, domain.admin-identity-access; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: server-only, proxy, cookies, CSRF, tokens e schemas são usados nas rotas catalogadas.
- Direção: Manter uma matriz verificável de autorização por entrypoint e reduzir privilégios quando possível.
- Justificativa da prioridade: P2 por ser risco estrutural real com controles presentes e sem exploração confirmada.

## Modelo RLS

As 44 tabelas locais habilitam RLS, mas não há CREATE POLICY local catalogada. A aplicação server-side usa service role e concentra autorização nos handlers. Policies, grants, Auth e equivalência remota continuam NOT_VALIDATED; isso não foi promovido a vulnerabilidade confirmada.
