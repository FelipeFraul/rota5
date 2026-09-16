> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

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
