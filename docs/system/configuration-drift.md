> **Current Baseline 2.4.4 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on canonical source `67845326088eac47452224b00ef1e866036e86f1` (fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`, 368 files, 79 migrations). Findings `bug.event-duplicate-artist-leak` and `bug.user-visible-text-corruption` are **RESOLVED** as stale. `gap.partial-flows-lack-end-to-end-proof` remains **ACTIVE**, decomposed from P1 to P2; no specific P1 was justified. Canonical release blockers: **0**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 11. PRODUCT_HEALTH: **DEGRADED**; INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality evidence remains 236/236, PostgreSQL 1/1 and Quality Gate 34867214724 PASS. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; no deployment, Supabase change or Ticketeira access.

# Configuration drift — Etapa 5

Current Production deployment `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` is READY on exact source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; the prior branding deployment remains historical evidence.


## Divergências

| ID | Resultado | Severidade | Local | Remoto | Impacto |
| --- | --- | --- | --- | --- | --- |
| `drift.vercel-project-domain` | MATCH / RESOLVED | CRITICAL (histórico) | origin `FelipeFraul/rota5`, branch `production`, projeto local `rota5` | Vercel `rota5` ligado ao mesmo repo/branch | Identidade correta; HEAD ainda não publicado. |
| `drift.vercel-latest-deployment` | MATCH | CRITICAL (histórico) | artifact funcional `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` | deployment Production `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo` READY atende os aliases canônicos | Identidade do artifact, deployment e aliases comprovada; o finding de deployment ERROR foi resolvido. |
| `drift.local-environment` | DRIFT | HIGH | arquivo .env não contém todos os campos obrigatórios de src/lib/env.ts | 24 nomes presentes na Vercel | Inicialização local que chama getEnv() pode falhar até completar a configuração. |
| `drift.supabase-storage-bucket` | DRIFT | LOW | variável obrigatória e presente remotamente; nenhum uso .storage encontrado | listBuckets retornou zero buckets | Configuração sem recurso remoto correspondente; hoje sem consumidor funcional encontrado. |

## Matriz declarado × real

| Objeto | Local | Remote | Runtime | Result |
| --- | --- | --- | --- | --- |
| Supabase tables/columns | 44 tabelas reconstruídas | 44 tabelas e colunas via OpenAPI | OpenAPI HTTP 200 | MATCH |
| Supabase constraints/indexes/triggers/RLS/policies/grants | catalogados quando declarados | NOT_VALIDATED | NOT_VALIDATED | NOT_VALIDATED |
| Supabase RPC surface | 39 funções SQL; 30 expostas como RPC esperada | 33 RPCs: 30 da aplicação + 3 extensões | OpenAPI HTTP 200 | PARTIAL_MATCH |
| Z-API webhook registration | /api/webhook/zapi | NOT_VALIDATED | instância conectada | NOT_VALIDATED |
| Mercado Pago webhook registration | /api/webhook/payment/mercado-pago | NOT_VALIDATED | credencial aceitou leitura de conta | NOT_VALIDATED |
| Vercel crons | 2 | 2 | execução não disparada | MATCH |
| Published commit | a141c6004421fb8442f95493de3ca4ec4d4c997b | metadata de commit ausente | health 200 | NOT_VALIDATED |
| Vercel project/domain | `FelipeFraul/rota5` + `production` + projeto `rota5` | Vercel `rota5` → mesmo repo/branch | auto-deploy desabilitado; nenhum deployment | MATCH |
| Environment variable presence | 15/44 | 24/44 | aplicação remota saudável | PARTIAL_MATCH |
| Supabase Storage bucket | referência SEAT_MAP_STORAGE_BUCKET | 0 buckets | sem uso .storage | DRIFT |

## Segunda passagem

A reauditoria separou as identidades: `FelipeFraul/rota5` e Vercel `rota5` formam a cadeia operacional do Rota5; `site` e `FelipeFraul/ticketeira` pertencem à Ticketeira e permanecem apenas como evidência histórica. O deployment Production mais recente de `rota5` está READY, atende os aliases canônicos e executa o artifact funcional esperado.

## Revalidação do storage

O gate preserva DRIFT com severidade LOW: SEAT_MAP_STORAGE_BUCKET está declarado, ausente no arquivo .env local e presente por nome na Vercel; o Supabase retornou zero buckets e não há consumidor .storage no código. Isso caracteriza configuração incompleta ou não utilizada, sem evidência suficiente para classificar o item como legado.
