# Evidências ainda não validáveis — Etapa 7

> **HISTORICAL SNAPSHOT:** preserved original-stage inventory; current values are projected by the Baseline 2.5.3 bannered documents and canonical machine-readable catalogs.

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
