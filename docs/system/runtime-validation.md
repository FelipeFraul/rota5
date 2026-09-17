> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.9.0 runtime evidence

The coordinated gap ran from `2026-09-17T03:17:37Z` until Production READY at `2026-09-17T03:19:08Z` (91 seconds). Operational intents before and created during the gap were both zero. The 00600 schema and ledger aligned; the queue read-only snapshot returned zero due tasks, six sent, zero failed and zero pending due. Both aliases and health passed. No mutating Production RPC test was run.


## Baseline 2.9.0 current runtime

Production `dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc` is READY on exact canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0` by Vercel REST metadata; target is production, source is CLI, ref is `production`, repository is `FelipeFraul/rota5`, alias parity is MATCH and health returned HTTP 200. Git auto-deploy remains disabled.

## Historical snapshot — Baseline 2.5.3 runtime and remote evidence

Production deployment `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` runs application source `148b8200a44f4eeb49e004af45060a302bac9f20`. Repository source is `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`; post-deployment differences are migrations/tests only and `APP_RUNTIME_DIFF_AFTER_DEPLOY=NAO`. Remote audit: events=7, sessions=7, event/session venue divergences=0, city/state divergences=0, legacy `update_admin_event_venue`=ABSENT.

## Current runtime catalog - Baseline 2.9.0

Current catalog: **31 checks — 29 PASS, 2 PARTIAL, 0 FAIL.**

Git semantics: canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`; baseline commit `SELF_NOT_RECORDED`; live branch tip `VOLATILE_NOT_EMBEDDED_IN_FROZEN_BASELINE`. The live `origin/production` tip is verified externally after commit and is not embedded here.

<!-- RUNTIME_CURRENT_TABLE_START -->
| ID | Target | Evidence | Status | Result |
| --- | --- | --- | --- | --- |
| `runtime.supabase-openapi` | Supabase PostgREST OpenAPI | REMOTE_SCHEMA | PASS | 45 tabelas e 42 rotas RPC retornadas; contagens medidas diretamente e nomes de colunas comparados. |
| `runtime.supabase-anon-head` | Supabase anon HEAD | RUNTIME_OBSERVED | PARTIAL | 7 consultas aceitas e 37 negadas; HEAD não prova visibilidade de linhas. |
| `runtime.supabase-storage` | Supabase Storage listBuckets | REMOTE_CONFIG | PASS | Consulta somente leitura retornou zero buckets. |
| `runtime.zapi-status` | Z-API instance status | RUNTIME_OBSERVED | PASS | HTTP 200; instância e smartphone conectados. |
| `runtime.mercado-pago-account` | Mercado Pago account metadata | RUNTIME_OBSERVED | PASS | HTTP 200; identidade de conta retornada; site_id MLB. |
| `runtime.vercel-project` | Vercel linked project | REMOTE_CONFIG | PASS | Projeto rota5 (prj_dl7tt8fZbw88ZQV0GhklY0akEwbf) ligado a FelipeFraul/rota5; Production Branch production. |
| `runtime.vercel-env` | Vercel environment names | REMOTE_CONFIG | PASS | 24 nomes observados; valores não lidos nem persistidos. |
| `runtime.vercel-declared-domain` | Historical Ticketeira domain classification | REMOTE_CONFIG | PASS | O projeto site e FelipeFraul/ticketeira pertencem à Ticketeira e não integram a cadeia operacional canônica do Rota5. |
| `runtime.vercel-linked-deployment` | Vercel linked production deployment | REMOTE_CONFIG | PASS | HISTORICAL SNAPSHOT (Baseline 2.5.x): Latest Production deployment dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf is READY and runs application source 148b8200a44f4eeb49e004af45060a302bac9f20; repository e931d66d03a620d5e26588c8f6c8714c62ef5d1d adds only migration/test evidence. |
| `runtime.health-declared` | Health declared domain | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.health-linked` | Health linked alias | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.github-repository` | GitHub repository metadata | REMOTE_CONFIG | PASS | Repositório privado FelipeFraul/rota5 existe; branch operacional production. |
| `runtime.git-production` | Git canonical source and baseline commit policy | CANONICAL_SOURCE_POLICY | PASS | Canonical functional source is c7ed2c31eb9c322ef489e71bb59631c39928a1e0; baseline commit is SELF_NOT_RECORDED; live branch tip is VOLATILE_NOT_EMBEDDED_IN_FROZEN_BASELINE. |
| `runtime.codex-version` | Codex CLI version | RUNTIME_OBSERVED | PASS | codex-cli 0.147.0 observado localmente. |
| `runtime.vercel-logs` | Vercel runtime logs | RUNTIME_OBSERVED | PARTIAL | 50 registros na janela consultada, com 1 entrada de erro; conteúdo sensível não persistido. |
| `runtime.high-1-local-postgres` | HIGH #1 source artifact | RUNTIME_OBSERVED | PASS | 96/96 focused; rollout matrix PASS; ticket race 2/2; combo race 2/2. |
| `runtime.high-1-phase-0-vercel` | Vercel manual release path for OLD_APP | RUNTIME_OBSERVED | PASS | Phase 0 preview READY and release path healthy; NEW_APP was not deployed. |
| `runtime.high-1-expand-remote` | Supabase EXPAND schema | RUNTIME_OBSERVED | PASS | Historical EXPAND-time snapshot: migration 20260912000100 was then remote latest; source fields were nullable and dual-mode was active before CONTRACT. |
| `runtime.high-1-new-app-production` | Vercel Production NEW_APP | RUNTIME_OBSERVED | PASS | Exact artifact cacbc4306abc82ce2ef4469125c62c3b6a8bf1b8 deployed as dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT; health/public/admin/EXPAND probe passed; relevant log errors 0; rollback not performed. |
| `runtime.high-1-post-cutover-counts` | HIGH #1 rollout counters | RUNTIME_OBSERVED | PASS | gate_sessions_total=1; source_null_total=1; source_null_unexpired=0; transition_legacy_created_after_expand=0; gate_accesses_active=0; fixed_gate_accesses_active=0. |
| `runtime.high-1-final-contract` | HIGH #1 FINAL_DB and Production NEW_APP | RUNTIME_OBSERVED | PASS | Strict ticket/combo, temp/fixed revoke, admin_direct, legacy rejection, source-null rejection, source immutability and cleanup passed; unrelated changes=0; Production relevant log errors=0. |
| `runtime.legacy-brand-scoped-production` | Scoped active-brand surfaces in Preview and Production | RUNTIME_OBSERVED | PASS | Checkout pending/success, five public-help topics, scoped router points, CSS/assets and static CORS passed with zero legacy terms or broken assets; Production relevant log errors=0. |
| `runtime.baseline-2-5-production-source` | REMOTE_DEPLOYMENT | REMOTE_DEPLOYMENT | PASS | HISTORICAL SNAPSHOT (Baseline 2.5.x): Production dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf runs application source 148b8200a44f4eeb49e004af45060a302bac9f20; repository source e931d66d03a620d5e26588c8f6c8714c62ef5d1d differs only by migration/test files after deployment. |
| `runtime.baseline-2-5-location-audit` | REMOTE_DATABASE | REMOTE_DATABASE | PASS | 7 events, 7 sessions, 0 event/session venue divergences, 0 city/state divergences; update_admin_event_venue is absent. |
| `runtime.paid-delivery-quality-gate` | Current canonical functional Quality Gate | GitHub Actions run 35141969033 | PASS | 291/291 Node, 4/4 PostgreSQL 16, typecheck, lint without errors and build passed on c7ed2c31eb9c322ef489e71bb59631c39928a1e0. |
| `runtime.baseline-2-7-combo-metadata-remote` | Supabase Rota5 combo metadata transition contract | REMOTE_RUNTIME_OBSERVED_BEFORE_DOCUMENTARY_RECONCILIATION | PASS | Migration 20260915000500 was already applied; 7 functions, minimal grants, row locks and JSONB merge passed. Two legacy issued redemptions retained raw_metadata={}; invalid invariants=0; combo outbox orphans=0. No remote query or mutation occurred during this reconciliation. |
| `runtime.baseline-2-8-functional-production` | Vercel Production Baseline 2.8.0 functional source | AUTHORITATIVE_PLATFORM_METADATA | PASS | GET /v13/deployments/dpl_2bitbdQynYB6QdMiEkB1em65HsAy returned HTTP 200: target=production, readyState=READY, source=cli, meta.githubCommitSha=c48405e41df3d1cd69eb3d383b7c6dd17257155e, meta.githubCommitRef=production and repository=FelipeFraul/rota5. Filtered githubCommitSha listing returned the same deployment; both canonical aliases resolve to it; /api/health returned HTTP 200. |
| `runtime.baseline-2-9-production` | Vercel Rota5 Production source and aliases | AUTHORITATIVE_PLATFORM_METADATA | PASS | dpl_DmWaACtXLsGd7mPwsKKsk8s2n4gc is READY in production on c7ed2c31eb9c322ef489e71bb59631c39928a1e0, ref production and repository FelipeFraul/rota5; both canonical aliases resolve to this deployment; /api/health returned HTTP 200, status=ok, service=whatsapp-ticketing. |
| `runtime.migration-ledger-2-9` | Supabase migration ledger through 20260915000600 | REMOTE_MIGRATION_LEDGER_READ_ONLY | PASS | 89 local migrations match 89 remote ledger versions; 20260914000100–20260915000600 aligned; db push --dry-run reports zero pending migrations. |
| `runtime.combo-00600-schema` | 00600 remote schema objects and RPC privileges | REMOTE_SCHEMA_AND_GRANTS | PASS | 12 changed functions and the operational due index are present; service_role can execute the required RPCs while public, anon and authenticated cannot. |
| `runtime.combo-queue-2-9` | Paid and operational combo outbound queue | PRODUCTION_QUEUE_SNAPSHOT | PASS | list_due_paid_combo_delivery_tasks: 0 due tasks; get_paid_combo_delivery_queue_counts: 6 sent, 0 failed, 0 pending due. Snapshot only; no claim or mutation. |
<!-- RUNTIME_CURRENT_TABLE_END -->

# Baseline 2.1.0 scoped active-brand runtime evidence

Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` and Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` are READY on exact source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; the default-suite remediation probes passed and relevant Production log errors are zero.

# HISTORICAL SNAPSHOT — Runtime validation, Etapa 5

Na observação histórica da Etapa 5, as verificações foram GET, HEAD, metadata ou logs em modo leitura. O snapshot registrou 15 checks: PASS 12; PARTIAL 2; FAIL 1.

| ID | Alvo | Evidência | Status | Resultado |
| --- | --- | --- | --- | --- |
| `runtime.supabase-openapi` | Supabase PostgREST OpenAPI | REMOTE_SCHEMA | PASS | 44 tabelas e 33 rotas RPC retornadas; nomes de colunas comparados. |
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
