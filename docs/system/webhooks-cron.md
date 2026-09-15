> **Current Baseline 2.7.3 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
