> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

# Observability — Etapa 5

Status geral: **PARTIAL**. `src/lib/logger.ts` emite JSON com nível, mensagem e timestamp; redige chaves sensíveis, mascara telefones, limita arrays e trunca strings longas. Não existe request/correlation ID universal nem tracing distribuído.

| Flow | Status | Motivo |
| --- | --- | --- |
| `whatsapp.inbound_dispatch` | PARTIAL | Entrada, persistência e erros têm logs/IDs, sem request ID universal. |
| `ticket.payment_confirmation` | PARTIAL | order/payment/provider IDs ajudam correlação; não há trace distribuído. |
| `combo.payment_confirmation` | PARTIAL | IDs persistidos e payment_events; correlação depende de busca manual. |
| `ticket.delivery` | PARTIAL | delivery/idempotency/provider IDs persistidos e falhas registradas. |
| `reservation.expiration` | PARTIAL | cron e operações possuem logs, sem histórico remoto completo validado. |
| `whatsapp.batch_processing` | STRONG | claim, attempts, next_attempt_at, erro e estado terminal persistidos. |
| `gate.ticket_admission` | PARTIAL | eventos de validação persistidos; sem correlation ID ponta a ponta. |
| `codex.automation` | PARTIAL | estado da request e runner registrados; processo externo sem trace comum. |

IDs de provider, pagamento, pedido, reserva, ticket e eventos persistidos permitem reconstrução manual. `payment_events`, `ticket_validation_events`, `combo_redemption_events`, `whatsapp_outbound_deliveries`, `buyer_risk_events` e `rate_limit_events` formam trilhas específicas. Na janela de logs Vercel consultada foram observadas 50 entradas e uma de erro; mensagens não foram copiadas para evitar persistência acidental de dados.

## Revalidação do gate

Ticket purchase, payment confirmation, WhatsApp, combo, cron e webhook permanecem PARTIAL. IDs persistidos permitem correlacionar request, processamento, banco, integração e resultado em partes do fluxo, mas não existe request ID universal ou trace distribuído que una todas as etapas automaticamente.
