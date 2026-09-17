> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Evidências ainda não validáveis — Etapa 7

> **HISTORICAL SNAPSHOT:** preserved original-stage inventory; current values are projected by the Baseline 2.6.0 bannered documents and canonical machine-readable catalogs.

Os nove grupos abaixo foram revisitados. Continuam sem evidência suficiente; nenhum permaneceu NOT_VALIDATED por esquecimento. A antiga lacuna sobre o deployment em ERROR foi encerrada pelo deployment Production READY atual.

| Área | Evidência pendente |
| --- | --- |
| DATA | Corpos SQL, constraints, índices, triggers, RLS, policies e grants efetivos do PostgreSQL remoto |
| DATA | Histórico e ordem efetivamente aplicados das 79 migrations no ambiente remoto |
| INFRASTRUCTURE | Configuração efetiva do Supabase Auth |
| INTEGRATIONS | Registro remoto dos webhooks Z-API e Mercado Pago |
| RUNTIME | Histórico recente de entrega, retries e falhas dos webhooks |
| RUNTIME | Execução efetiva recente dos dois crons |
| INFRASTRUCTURE | Commit/source SHA efetivamente publicado nos deployments observados |
| SECURITY | Visibilidade real de linhas via chave anon |
| REPOSITORY | Consumidores externos/dinâmicos de exports e assets classificados como órfãos/legado |

Essas lacunas não impedem o PASS documental: a baseline não promove configuração local a estado remoto e não transforma ausência de evidência em falha. Fonte canônica: `system-knowledge/unresolved-evidence.json`.
