> **Current Baseline 2.7.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 combo direct-notification limitation

`risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. It covers concurrent legitimate operations reaching Z-API before local serialization. This differs from `risk.paid-delivery-ambiguous-external-ack`, which covers one accepted provider effect whose local ACK is ambiguous.

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
