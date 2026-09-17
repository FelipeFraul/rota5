> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 combo direct-notification limitation

At Baseline 2.7.0, `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` was ACTIVE MEDIUM/P2 and non-release-blocking: concurrent operations could reach Z-API before local serialization. Baseline 2.9.0 resolves this local race. `risk.paid-delivery-ambiguous-external-ack` remains ACTIVE and covers a provider effect whose local ACK is ambiguous.

## Baseline 2.6.0 paid-delivery limits

External Z-API effects remain at-least-once because an accepted request can have an ambiguous ACK before local `sent` persistence. Legacy COMBO rows with `qr_token_version=NULL` are historical compatibility and are not claimed to have the versioned HMAC/outbox reconstruction path. New confirmations are versioned.

# Known limits

## Historical clarification — Baseline 2.5.3

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
