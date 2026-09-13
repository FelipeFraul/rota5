# Known limits

Source: `system-knowledge/unresolved-evidence.json`. All records were revalidated on 2026-09-12.

| ID | Category | Evidence still missing |
| --- | --- | --- |
| `unresolved.remote-postgres-internals` | DATA | Corpos SQL, constraints, índices, triggers, RLS, policies e grants efetivos do PostgreSQL remoto |
| `unresolved.remote-migration-history` | DATA | Histórico e ordem efetivamente aplicados das 77 migrations no ambiente remoto |
| `unresolved.supabase-auth-state` | INFRASTRUCTURE | Configuração efetiva do Supabase Auth |
| `unresolved.webhook-registration` | INTEGRATIONS | Registro remoto dos webhooks Z-API e Mercado Pago |
| `unresolved.webhook-delivery-history` | RUNTIME | Histórico recente de entrega, retries e falhas dos webhooks |
| `unresolved.cron-execution-history` | RUNTIME | Execução efetiva recente dos dois crons |
| `unresolved.published-source-commit` | INFRASTRUCTURE | Commit/source SHA efetivamente publicado nos deployments observados |
| `unresolved.anon-row-visibility` | SECURITY | Visibilidade real de linhas via chave anon |
| `unresolved.external-dynamic-consumers` | REPOSITORY | Consumidores externos/dinâmicos de exports e assets classificados como órfãos/legado |

**NOT_VALIDATED does not mean BROKEN.** It means the available evidence cannot establish the remote or external fact. Promote a record only with evidence following the official source precedence.
