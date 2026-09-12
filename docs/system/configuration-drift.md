# Configuration drift — Etapa 5

## Divergências

| ID | Resultado | Severidade | Local | Remoto | Impacto |
| --- | --- | --- | --- | --- | --- |
| `drift.vercel-project-domain` | DRIFT | CRITICAL | next.config.ts declara blackhouseclubedecomedia.vercel.app; link local aponta para rota5 | domínio declarado pertence ao projeto site; alias do projeto ligado é rota5-khaki.vercel.app | Ambiguidade operacional e origem CORS de assets vinculada a projeto diferente. |
| `drift.vercel-latest-deployment` | DRIFT | CRITICAL | baseline HEAD em origin/production | deployment mais recente do projeto rota5 em ERROR; anterior READY atende o alias | O último deploy não é o que atende produção e o commit servido não pôde ser provado. |
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
| Vercel project/domain | rota5 link + domínio blackhouse | projetos rota5 e site distintos | ambos respondem | DRIFT |
| Environment variable presence | 15/44 | 24/44 | aplicação remota saudável | PARTIAL_MATCH |
| Supabase Storage bucket | referência SEAT_MAP_STORAGE_BUCKET | 0 buckets | sem uso .storage | DRIFT |

## Segunda passagem

O ambiente externo revelou a divisão entre os projetos Vercel `site` e `rota5`, o erro no deployment mais recente e a conectividade atual dos provedores. O repositório declara migrations, webhooks, crons e bucket, mas não foi possível provar o histórico de migrations, os internos do PostgreSQL, registros de webhook, execuções recentes do cron, commit servido, Supabase Auth ou bucket correspondente. Nenhum drift foi corrigido.

## Revalidação do storage

O gate preserva DRIFT com severidade LOW: SEAT_MAP_STORAGE_BUCKET está declarado, ausente no arquivo .env local e presente por nome na Vercel; o Supabase retornou zero buckets e não há consumidor .storage no código. Isso caracteriza configuração incompleta ou não utilizada, sem evidência suficiente para classificar o item como legado.
