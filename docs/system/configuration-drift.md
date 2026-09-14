> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

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
| Supabase RPC surface | 33 funções SQL; 30 expostas como RPC esperada | 33 RPCs: 30 da aplicação + 3 extensões | OpenAPI HTTP 200 | PARTIAL_MATCH |
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
