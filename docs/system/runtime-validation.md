# Runtime validation — Etapa 5

Todas as verificações foram GET, HEAD, metadata ou logs em modo leitura. Total: 15; PASS: 12; PARTIAL: 2; FAIL: 1.

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
| `runtime.vercel-linked-deployment` | Vercel linked production deployment | REMOTE_CONFIG | FAIL | Nenhum deployment novo; o mais recente permanece ERROR e o HEAD atual não está publicado. |
| `runtime.health-declared` | Health declared domain | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.health-linked` | Health linked alias | RUNTIME_OBSERVED | PASS | GET /api/health retornou HTTP 200 e status ok. |
| `runtime.github-repository` | GitHub repository metadata | REMOTE_CONFIG | PASS | Repositório privado `FelipeFraul/rota5`; branch operacional `production`. |
| `runtime.git-production` | Git production branch | REMOTE_CONFIG | PASS | HEAD e `origin/production` apontam para `9302cbd46aec802fef371e9c948e7d558c3dfc2a`. |
| `runtime.codex-version` | Codex CLI version | RUNTIME_OBSERVED | PASS | codex-cli 0.147.0 observado localmente. |
| `runtime.vercel-logs` | Vercel runtime logs | RUNTIME_OBSERVED | PARTIAL | 50 registros na janela consultada, com 1 entrada de erro; conteúdo sensível não persistido. |

O commit publicado é `NOT_VALIDATED`: o HEAD atual e `origin/production` coincidem, mas nenhum release desse HEAD foi realizado. Identidade correta não implica código publicado.

## Revalidação dos resultados fora de PASS

Os três resultados fora de PASS são runtime.supabase-anon-head (PARTIAL, pois HEAD não prova visibilidade de linhas), runtime.vercel-linked-deployment (FAIL, pois o deployment mais recente está em ERROR) e runtime.vercel-logs (PARTIAL, pois a amostra contém um erro e não constitui trilha completa). O catálogo JSON registra método, expectativa, ausência de efeito colateral e evidência de cada check.
