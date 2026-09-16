> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.8.0 rate-limit resolution

`risk.rate-limit-fails-open` is **RESOLVED / SECURITY / MEDIUM / P2 / CONFIRMED**. The original root cause was `APPLICATION_UNAVAILABLE_POLICY`: outage now has an explicit `unavailable` state and boundary policy, rather than silent authorization or false 429.

# Riscos de segurança e autorização

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### risk.gate-credential-revocation-does-not-revoke-session — Pausa/revogação da credencial não invalida sessões de leitor já emitidas

- Current Baseline 2.0.1 status: **RESOLVED / HIGH / P1**. EXPAND and CONTRACT are applied and validated; gates A-I, strict runtime, credential revocation, legacy rejection, source-null rejection and source immutability passed. Historical Stage 6 evidence is preserved in findings.json.

### risk.rate-limit-fails-open — RESOLVED

- Tipo / severidade / prioridade: **SECURITY / MEDIUM / P2**.
- Status / confiança: **RESOLVED / CONFIRMED**.
- Contrato CURRENT: `allowed | rate_limited | unavailable`; 14 fail-closed 503, 5 explicit post-auth degradation boundaries, timeout cancelável de 2s, malformed → unavailable e unavailable nunca → 429.
- Prova: focused 5/5, Node 285/285, PostgreSQL 4/4, Quality Gate 35049217326, reauditoria PASS e Production exato `dpl_2bitbdQynYB6QdMiEkB1em65HsAy` → `c48405e41df3d1cd69eb3d383b7c6dd17257155e`.
- A classificação e a descrição ACTIVE originais permanecem no histórico machine-readable.
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
