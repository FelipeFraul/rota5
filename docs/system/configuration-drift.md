> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.9.0 Production identity

Vercel project `rota5` Production serves `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc` on `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Git auto-deploy remains disabled. A documentary commit after the freeze changes branch HEAD but does not change the application artifact; it is not a Production source drift. The previous `dpl_2bitbdQynYB6QdMiEkB1em65HsAy` on `c48405e41df3d1cd69eb3d383b7c6dd17257155e` is historical evidence.


## Baseline 2.8.1 current Production parity

Canonical functional source and Production source both equal `c48405e41df3d1cd69eb3d383b7c6dd17257155e`; Production deployment is `dpl_2bitbdQynYB6QdMiEkB1em65HsAy`; authoritative source parity is MATCH and Git auto-deploy remains disabled. A later documentary HEAD is not application-runtime drift.

# Configuration drift — Etapa 5

Current Production deployment `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc` is READY on exact canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`, proven by Vercel REST v13 `meta.githubCommitSha`; earlier deployments remain historical evidence.


## Divergências

| ID | Resultado | Severidade | Local | Remoto | Impacto |
| --- | --- | --- | --- | --- | --- |
| `drift.vercel-project-domain` | MATCH / RESOLVED | CRITICAL (histórico) | canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`; documentary HEAD não é runtime target | Vercel `rota5` ligado ao mesmo repo/branch | Identidade e source funcional Production reconciliados; auto-deploy Git permanece desabilitado. |
| `drift.vercel-latest-deployment` | MATCH | CRITICAL (histórico) | artifact funcional `cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8` | deployment Production `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo` READY atende os aliases canônicos | Identidade do artifact, deployment e aliases comprovada; o finding de deployment ERROR foi resolvido. |
| `drift.local-environment` | DRIFT | HIGH | arquivo .env não contém todos os campos obrigatórios de src/lib/env.ts | 24 nomes presentes na Vercel | Inicialização local que chama getEnv() pode falhar até completar a configuração. |
| `drift.supabase-storage-bucket` | DRIFT | LOW | variável obrigatória e presente remotamente; nenhum uso .storage encontrado | listBuckets retornou zero buckets | Configuração sem recurso remoto correspondente; hoje sem consumidor funcional encontrado. |

## Matriz declarado × real

| Objeto | Local | Remote | Runtime | Result |
| --- | --- | --- | --- | --- |
| Supabase tables/columns | 45 tabelas reconstruídas | 45 tabelas e colunas via OpenAPI read-only | OpenAPI HTTP 200 | MATCH |
| Supabase constraints/indexes/triggers/RLS/policies/grants | catalogados quando declarados | NOT_VALIDATED | NOT_VALIDATED | NOT_VALIDATED |
| Supabase RPC surface | 44 funções SQL; 39 expostas nominalmente como rotas RPC | 42 rotas RPC medidas: 39 da aplicação + 3 extensões | OpenAPI HTTP 200 | PARTIAL_MATCH |
| Z-API webhook registration | /api/webhook/zapi | NOT_VALIDATED | instância conectada | NOT_VALIDATED |
| Mercado Pago webhook registration | /api/webhook/payment/mercado-pago | NOT_VALIDATED | credencial aceitou leitura de conta | NOT_VALIDATED |
| Vercel crons | 2 | 2 | execução não disparada | MATCH |
| Published commit | canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0` | Vercel REST v13 metadata `githubCommitSha=c7ed2c31eb9c322ef489e71bb59631c39928a1e0` | deployment Production READY `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc`; health is supplementary | MATCH |
| Vercel project/domain | `FelipeFraul/rota5` + `production` + projeto `rota5` | Vercel `rota5` → mesmo repo/branch | auto-deploy desabilitado; nenhum deployment | MATCH |
| Environment variable presence | 15/44 | 24/44 | aplicação remota saudável | PARTIAL_MATCH |
| Supabase Storage bucket | referência SEAT_MAP_STORAGE_BUCKET | 0 buckets | sem uso .storage | DRIFT |

## Segunda passagem

A reauditoria separou as identidades: `FelipeFraul/rota5` e Vercel `rota5` formam a cadeia operacional do Rota5; `site` e `FelipeFraul/ticketeira` pertencem à Ticketeira e permanecem apenas como evidência histórica. O deployment Production mais recente de `rota5` está READY, atende os aliases canônicos e executa o artifact funcional esperado.

## Revalidação do storage

O gate preserva DRIFT com severidade LOW: SEAT_MAP_STORAGE_BUCKET está declarado, ausente no arquivo .env local e presente por nome na Vercel; o Supabase retornou zero buckets e não há consumidor .storage no código. Isso caracteriza configuração incompleta ou não utilizada, sem evidência suficiente para classificar o item como legado.
