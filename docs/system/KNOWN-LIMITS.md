> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

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
