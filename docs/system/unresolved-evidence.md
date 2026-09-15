> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

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
