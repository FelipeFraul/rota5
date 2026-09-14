> **Current Baseline 2.5.1 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on unchanged repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency remain **RESOLVED**. Findings and health are unchanged: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers; PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH are **DEGRADED**. Quality remains 257/257 Node, 2/2 PostgreSQL 16 and Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` remains on application source `148b8200a44f4eeb49e004af45060a302bac9f20`; no runtime, database, deployment or functional change occurred.

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
