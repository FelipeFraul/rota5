> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

# Webhooks e cron — Etapa 5

## Webhooks

| ID | Endpoint | Auth | Idempotência | Registro remoto |
| --- | --- | --- | --- | --- |
| `webhook.zapi` | POST `/api/webhook/zapi` | ZAPI_WEBHOOK_SECRET | provider_message_id e persistência de mensagens/deliveries | NOT_VALIDATED |
| `webhook.mercado-pago` | POST `/api/webhook/payment/mercado-pago` | MERCADO_PAGO_WEBHOOK_SECRET com x-signature/request-id | payment_events e confirmação transacional evitam reprocessamento funcional | NOT_VALIDATED |

A conectividade da Z-API e a identidade da conta Mercado Pago foram validadas por leitura. Os painéis não forneceram, pelas superfícies usadas, a lista de webhooks registrados; ambos permanecem `NOT_VALIDATED`. Nenhuma mensagem ou pagamento foi criado.

## Cron

| ID | Endpoint | Schedule | Auth | Remoto |
| --- | --- | --- | --- | --- |
| `cron.expire-reservations` | `/api/cron/expire-reservations` | `* * * * *` | Bearer CRON_SECRET | REMOTE_CONFIG |
| `cron.process-whatsapp-batches` | `/api/cron/process-whatsapp-batches` | `* * * * *` | Bearer CRON_SECRET | REMOTE_CONFIG |

As duas configurações foram confirmadas no deployment. Os handlers não foram invocados porque produzem efeitos. Por isso o último resultado de execução permanece não validado.
