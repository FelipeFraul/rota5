> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

## Historical snapshot — Baseline 2.5.3 runtime and remote evidence

Production deployment `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` runs application source `148b8200a44f4eeb49e004af45060a302bac9f20`. Repository source is `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`; post-deployment differences are migrations/tests only and `APP_RUNTIME_DIFF_AFTER_DEPLOY=NAO`. Remote audit: events=7, sessions=7, event/session venue divergences=0, city/state divergences=0, legacy `update_admin_event_venue`=ABSENT.

## Current runtime catalog — Baseline 2.6.0

Current catalog: **25 checks — 23 PASS, 2 PARTIAL, 0 FAIL.**

Git semantics: canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7`; baseline commit `SELF_NOT_RECORDED`; live branch tip `VOLATILE_NOT_EMBEDDED_IN_FROZEN_BASELINE`. The live `origin/production` tip is verified externally after commit and is not embedded here.

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
| `runtime.git-production` | Git canonical source and baseline commit policy | CANONICAL_SOURCE_POLICY | PASS | Canonical functional source is 0a10618648fc3f873afffd8f60e60bd0396b62e7; baseline commit is SELF_NOT_RECORDED; live branch tip is VOLATILE_NOT_EMBEDDED_IN_FROZEN_BASELINE. |
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
| `runtime.paid-delivery-quality-gate` | Paid TICKET + COMBO durable delivery | GitHub Actions run 34984961888 | PASS | 276/276 Node, 4/4 PostgreSQL 16, typecheck, lint (23 preexisting warnings) and build passed on 0a10618648fc3f873afffd8f60e60bd0396b62e7. |
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
