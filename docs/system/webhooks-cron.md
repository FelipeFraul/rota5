> **Current Baseline 2.9.0 (2026-09-17):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c7ed2c31eb9c322ef489e71bb59631c39928a1e0`. Fingerprint `889e832d1499df9f968f1cdc820f8f2b138d6e3435a304abd5a50292faa44dd6`; 397 source files, 89 local and remote ledger migrations, 45 tables, 65 SQL functions, 1 sequence, 60 test files and 47 findings. Combo operational notification concurrency is RESOLVED; external ambiguous ACK remains separate. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
