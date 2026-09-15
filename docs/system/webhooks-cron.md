> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.

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
