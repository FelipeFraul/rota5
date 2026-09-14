> **Current Baseline 2.5.2 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on unchanged repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency remain **RESOLVED**. Findings and health are unchanged: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers; PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH are **DEGRADED**. Quality remains 257/257 Node, 2/2 PostgreSQL 16 and Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` remains on application source `148b8200a44f4eeb49e004af45060a302bac9f20`; no runtime, database, deployment or functional change occurred.

## Baseline 2.5.2 runtime and remote evidence

Production deployment `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` runs application source `148b8200a44f4eeb49e004af45060a302bac9f20`. Repository source is `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`; post-deployment differences are migrations/tests only and `APP_RUNTIME_DIFF_AFTER_DEPLOY=NAO`. Remote audit: events=7, sessions=7, event/session venue divergences=0, city/state divergences=0, legacy `update_admin_event_venue`=ABSENT.

# Baseline 2.1.0 scoped active-brand runtime evidence

Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` and Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` are READY on exact source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; the default-suite remediation probes passed and relevant Production log errors are zero.

# Runtime validation — Etapa 5

Todas as verificações foram GET, HEAD, metadata ou logs em modo leitura. O catálogo atual registra 24 checks: PASS 22; PARTIAL 2; FAIL 0.

| ID | Alvo | Evidência | Status | Resultado |
| --- | --- | --- | --- | --- |
| `runtime.supabase-openapi` | Supabase PostgREST OpenAPI | REMOTE_SCHEMA | PASS | 45 tabelas e 42 rotas RPC retornadas; contagens medidas diretamente e nomes de colunas comparados. |
| `runtime.supabase-anon-head` | Supabase anon HEAD | RUNTIME_OBSERVED | PARTIAL | 7 consultas aceitas e 37 negadas; HEAD não prova visibilidade de linhas. |
| `runtime.supabase-storage` | Supabase Storage listBuckets | REMOTE_CONFIG | PASS | Consulta somente leitura retornou zero buckets. |
| `runtime.zapi-status` | Z-API instance status | RUNTIME_OBSERVED | PASS | HTTP 200; instância e smartphone conectados. |
| `runtime.mercado-pago-account` | Mercado Pago account metadata | RUNTIME_OBSERVED | PASS | HTTP 200; identidade de conta retornada; site_id MLB. |
| `runtime.vercel-project` | Vercel linked project | REMOTE_CONFIG | PASS | `rota5` (`prj_dl7tt8fZbw88ZQV0GhklY0akEwbf`) ligado a `FelipeFraul/rota5`; Production Branch `production`. |
| `runtime.vercel-env` | Vercel environment names | REMOTE_CONFIG | PASS | 24 nomes observados; valores não lidos nem persistidos. |
| `runtime.vercel-declared-domain` | Historical Ticketeira classification | REMOTE_CONFIG | PASS | `site` e `FelipeFraul/ticketeira` são infraestrutura da Ticketeira, não da cadeia operacional do Rota5. |
| `runtime.vercel-linked-deployment` | Vercel linked production deployment | REMOTE_CONFIG | PASS | Deployment Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` READY atende os aliases canônicos e executa o source exato `c726902505fd69c2cfef2dec8013ffe0cf0adba3`. |
| `runtime.health-declared` | Health declared domain | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.health-linked` | Health linked alias | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.github-repository` | GitHub repository metadata | REMOTE_CONFIG | PASS | Repositório privado `FelipeFraul/rota5`; branch operacional `production`. |
| `runtime.git-production` | Git production branch | REMOTE_CONFIG | PASS | HEAD e `origin/production` apontam para `9302cbd46aec802fef371e9c948e7d558c3dfc2a`. |
| `runtime.codex-version` | Codex CLI version | RUNTIME_OBSERVED | PASS | codex-cli 0.147.0 observado localmente. |
| `runtime.vercel-logs` | Vercel runtime logs | RUNTIME_OBSERVED | PARTIAL | 50 registros na janela consultada, com 1 entrada de erro; conteúdo sensível não persistido. |

O source funcional atual foi validado no deployment Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa`. O finding independente de published-commit mantém seu lifecycle anterior nesta tarefa, conforme a regra de não alterar outros findings.

## Revalidação dos resultados fora de PASS

Os dois resultados fora de PASS são `runtime.supabase-anon-head` (PARTIAL, pois HEAD não prova visibilidade de linhas) e `runtime.vercel-logs` (PARTIAL, pois a amostra histórica não constitui trilha completa). `runtime.vercel-linked-deployment` foi revalidado como PASS após o cutover controlado. O catálogo JSON registra método, expectativa, ausência de efeito colateral e evidência de cada check.
