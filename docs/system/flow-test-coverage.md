# Flow Test Coverage — Etapa 4

Cobertura foi cruzada com o inventário de 67 testes/auditorias da Etapa 3. Um teste de capability isolada não torna o flow ponta a ponta COVERED. Resultados observados permanecem históricos; nenhum serviço externo foi executado nesta etapa.

| Flow | Test status | Testes | Falhas associadas | Limite |
| --- | --- | --- | --- | --- |
| `whatsapp.public_discovery` | FAILING | `test-033`<br>`audit.whatsapp-intent-100`<br>`audit.whatsapp-intent-gate`<br>`test-032`<br>`audit.buy-flow`<br>`audit.whatsapp-santana-search`<br>`test-029`<br>`test-030`<br>`test-035`<br>`audit.seatmap-qr-image` | `test-032`<br>`test-030` | Ao menos uma capability participante possui teste falhando. |
| `ticket.purchase` | PARTIAL | `audit.buyer-anti-abuse`<br>`test-031`<br>`test-030`<br>`audit.buy-flow`<br>`test-034`<br>`audit.seatmap-qr-image`<br>`audit.admin-orders-tickets`<br>`audit.cancel-pending-reservation-rpc`<br>`audit.reservation-expiration-cancel`<br>`test-026`<br>`audit.mercado-pago-security` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `ticket.checkout` | PARTIAL | `audit.buyer-anti-abuse`<br>`test-018`<br>`audit.mercado-pago-security` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `ticket.delivery` | PARTIAL | `test-028`<br>`test-041`<br>`test-027`<br>`test-036`<br>`test-037`<br>`audit.mercado-pago-security`<br>`audit.seatmap-qr-image` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `ticket.view` | PARTIAL | `test-031` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `courtesy.public` | PARTIAL | `test-031` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `combo.purchase` | PARTIAL | `test-031`<br>`test-018` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `combo.delivery_choice` | PARTIAL | `test-036`<br>`test-026` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `admin.whatsapp_session` | FAILING | `test-011`<br>`audit.admin-navigation-flow`<br>`test-001`<br>`audit.admin-login-lockout`<br>`audit.admin-tokenized-login` | `test-001` | Ao menos uma capability participante possui teste falhando. |
| `admin.web_session` | PARTIAL | `test-001`<br>`audit.admin-login-lockout`<br>`audit.admin-tokenized-login`<br>`test-016` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `admin.web_event_workspace` | FAILING | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-003`<br>`test-008`<br>`test-009`<br>`audit.admin-event-creation-flow`<br>`test-006`<br>`test-014`<br>`test-002`<br>`audit.admin-event-edit-duplicate`<br>`test-004`<br>`test-005`<br>`test-017`<br>`test-040` | `test-009`<br>`test-002`<br>`test-005`<br>`test-017`<br>`test-040` | Ao menos uma capability participante possui teste falhando. |
| `admin.whatsapp_event_management` | FAILING | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-003`<br>`test-008`<br>`test-009`<br>`audit.admin-event-creation-flow`<br>`test-006`<br>`test-014`<br>`test-002`<br>`audit.admin-event-edit-duplicate`<br>`test-013`<br>`test-015` | `test-009`<br>`test-002`<br>`test-015` | Ao menos uma capability participante possui teste falhando. |
| `admin.combo_management` | FAILING | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-004`<br>`test-019`<br>`test-021` | `test-019` | Ao menos uma capability participante possui teste falhando. |
| `admin.courtesy_management` | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-courtesies`<br>`test-031` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `admin.user_management` | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-users-flow`<br>`audit.admin-login-lockout` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `admin.reporting` | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-orders-tickets`<br>`audit.admin-reports` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `admin.operational_dashboard` | PARTIAL | `test-016`<br>`audit.admin-tokenized-login`<br>`test-010`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-012` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `gate.access_management` | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `gate.ticket_admission` | PARTIAL | `audit.gate-phone-checkin`<br>`audit.gate-wrong-event` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `kitchen.session_prepare` | PARTIAL | `test-022` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `kitchen.combo_redemption` | PARTIAL | `test-036`<br>`audit.combo-redemption-security` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `table_map.calibration` | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-026` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `whatsapp.inbound_dispatch` | FAILING | `audit.rate-limit`<br>`test-033`<br>`test-039`<br>`test-025`<br>`test-042`<br>`test-043`<br>`test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure` | `test-025` | Ao menos uma capability participante possui teste falhando. |
| `ticket.payment_confirmation` | PARTIAL | `audit.rate-limit`<br>`audit.mercado-pago-security`<br>`test-027`<br>`test-028`<br>`test-036`<br>`test-037`<br>`audit.seatmap-qr-image`<br>`test-041` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `combo.payment_confirmation` | PARTIAL | `audit.rate-limit`<br>`test-022`<br>`test-027`<br>`test-028`<br>`test-041` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `reservation.expiration` | PARTIAL | `audit.reservation-expiration-cancel`<br>`audit.admin-navigation-flow` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `combo.offer_distribution` | FAILING | `test-019`<br>`test-020`<br>`test-021`<br>`test-036` | `test-019` | Ao menos uma capability participante possui teste falhando. |
| `whatsapp.batch_processing` | FAILING | `test-038`<br>`test-023` | `test-038` | Ao menos uma capability participante possui teste falhando. |
| `event.auto_finish` | UNCOVERED | NENHUM | NENHUMA | Nenhum teste associado às capabilities do flow. |
| `gate.combo_release` | PARTIAL | `audit.gate-wrong-event` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |
| `event.program_import` | UNCOVERED | NENHUM | NENHUMA | Nenhum teste associado às capabilities do flow. |
| `blackhouse.maintenance` | UNCOVERED | NENHUM | NENHUMA | Nenhum teste associado às capabilities do flow. |
| `codex.automation` | UNCOVERED | NENHUM | NENHUMA | Nenhum teste associado às capabilities do flow. |
| `platform.edge_request_protection` | PARTIAL | `audit.rate-limit` | NENHUMA | Há evidência parcial/isolada, sem cobertura ponta a ponta. |

## Métricas

| Métrica | Valor |
| --- | ---: |
| Flows com teste | 30 |
| Flows sem teste | 4 |
| Flows com teste falhando | 8 |

Os quatro arquivos não executados na Etapa 3 continuam identificados em [tests-inventory.md](tests-inventory.md): três exigem banco real e um grava fixtures/imagens em `.tmp`. A Etapa 4 não reexecutou testes nem alterou os resultados de 296 casos (276 aprovados, 20 falhas).
