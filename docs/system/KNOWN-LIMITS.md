# Known limits

## Baseline 2.5.3 clarification

The 5 NOT_VALIDATED findings and other current risks remain governed by their canonical lifecycle. Retention/cleanup for `admin_event_operations` is a separate hardening candidate, not a claim that the resolved atomicity or location defects are active.

Source: `system-knowledge/unresolved-evidence.json`. Seven records remain NOT_VALIDATED; resolved records stay in the machine catalog as history.

| ID | Category | Evidence still missing |
| --- | --- | --- |
| `unresolved.remote-postgres-internals` | DATA | PostgreSQL internals outside the HIGH #1 final-contract surface |
| `unresolved.supabase-auth-state` | INFRASTRUCTURE | Effective Supabase Auth configuration |
| `unresolved.webhook-registration` | INTEGRATIONS | Z-API and Mercado Pago remote webhook registration |
| `unresolved.webhook-delivery-history` | RUNTIME | Recent provider delivery, retry and failure history |
| `unresolved.cron-execution-history` | RUNTIME | Recent execution history for both crons |
| `unresolved.anon-row-visibility` | SECURITY | Effective row visibility through the anon key |
| `unresolved.external-dynamic-consumers` | REPOSITORY | External/dynamic consumers of legacy/orphan exports and assets |

**NOT_VALIDATED does not mean BROKEN.** Remote migration history and the Production runtime artifact identity are now validated and retained as resolved historical records.
