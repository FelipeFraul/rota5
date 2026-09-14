> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Baseline 2.1.0 scoped active-brand runtime evidence

Preview `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6` and Production `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` are READY on exact source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; the default-suite remediation probes passed and relevant Production log errors are zero.

# Runtime validation — Etapa 5

Todas as verificações foram GET, HEAD, metadata ou logs em modo leitura. O catálogo atual registra 20 checks: PASS 18; PARTIAL 2; FAIL 0.

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
