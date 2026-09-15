> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.

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
