> **Current Baseline 2.8.1 (2026-09-16):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
