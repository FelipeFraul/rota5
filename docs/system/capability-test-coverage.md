# Cobertura de testes por capability

Foram inspecionados 43 arquivos `test-*.mjs`, 3 scripts `audit-*.mjs` e 21 ferramentas `.tools/audit_*.mjs`. A associação usa conteúdo de assertivas, chamadas e fixtures, e não apenas o nome do arquivo. Inventário canônico: `capabilities.json.test_inventory`; IDs `test-001` a `test-043` são os da Etapa 1. Os IDs `audit.*` são extensões locais deste catálogo, com paths explícitos.

## Execução desta etapa

**39 arquivos; 296 casos; 276 aprovados; 20 falhas em 12 arquivos.** Execução individual com `node --experimental-loader=./.tmp/typescript-alias-loader.mjs --test --test-reporter=tap <arquivo>`. Casos dentro de scripts sem node:test contam como o processo de teste reportado pelo runner. Nenhum teste foi editado.

Três testes exigem banco real e podem mutá-lo: `test-013`, `test-020`, `test-034`. O `test-026` foi apenas inspecionado porque escreve fixtures/artefatos no workspace; seu resultado não foi atualizado nesta execução. As 24 auditorias foram apenas lidas. Não se executou `npm test` integral nem build; o parser TypeScript confirmou cinco diagnósticos no modal de criação em `CreateEventModal.tsx:19` sem emitir arquivos.

Os resultados antigos da Etapa 1 foram mantidos como observação histórica. Houve nova falha em `test-whatsapp-batch-compat.mjs`: o contrato textual espera literal antigo e o finalizador atual usa `TICKET_MESSAGES.conversationClosed`. A alteração preexistente em messages.ts faz parte do snapshot, sem atribuição especulativa de causalidade.

## Interpretação

- COVERED: há assertiva direta para comportamento principal; não representa cobertura percentual completa.
- PARTIAL: proteção de partes/contratos de fonte/helpers ou sem execução integral do comportamento.
- UNCOVERED: nenhum teste/auditoria diretamente relacionado localizado.
- FAILING: pelo menos um caso diretamente associado falhou nesta execução.
- UNKNOWN: apenas auditoria/teste real não executado sustenta a associação.

Uma falha de regex pode refletir extração de componente ou mudança de contrato; não transforma a capability inteira em QUEBRADA. Falhas são atribuídas ao caso, evitando contaminar toda capacidade citada no mesmo arquivo. Testes de grant/search_path e lazy loading continuam classificados como técnicos.

## Resultado por arquivo

| ID | Arquivo | Execução | Pass / fail | Capabilities |
| --- | --- | --- | --- | --- |
| test-001 | scripts/test-admin-auth-pending-cancel.mjs | FAIL | 7 / 1 | admin.login, admin.logout, admin.lockout |
| test-002 | scripts/test-admin-event-artist-name-leak.mjs | FAIL | 6 / 1 | event.create, event.duplicate |
| test-003 | scripts/test-admin-events-editor-card-memoization.mjs | PASS | 4 / 0 | event.list |
| test-004 | scripts/test-admin-events-editor-combo-section-extraction.mjs | PASS | 5 / 0 | combo.list, combo.create, combo.edit |
| test-005 | scripts/test-admin-events-editor-dashboard-section-extraction.mjs | FAIL | 1 / 4 | analytics.general_dashboard, analytics.event_dashboard |
| test-006 | scripts/test-admin-events-editor-event-modal-extraction.mjs | PASS | 4 / 0 | event.inspect, event.create, event.edit |
| test-007 | scripts/test-admin-events-editor-lazy-modals.mjs | PASS | 2 / 0 | Teste técnico |
| test-008 | scripts/test-admin-events-editor-toolbar-extraction.mjs | PASS | 3 / 0 | event.list |
| test-009 | scripts/test-admin-events-fast-mode.mjs | FAIL | 4 / 1 | event.list |
| test-010 | scripts/test-admin-events-fast-rpc.mjs | PASS | 5 / 0 | event.list, admin.authorize |
| test-011 | scripts/test-admin-navigation.mjs | PASS | 1 / 0 | messaging.navigate_admin |
| test-012 | scripts/test-admin-operational-dashboard.mjs | PASS | 4 / 0 | analytics.operational |
| test-013 | scripts/test-admin-section-capacity-rpc-real.mjs | NOT_RUN | — | event.capacity_set |
| test-014 | scripts/test-admin-slow-endpoints-optimized.mjs | PASS | 3 / 0 | event.inspect, analytics.general_dashboard |
| test-015 | scripts/test-admin-ticket-price-label-edit.mjs | FAIL | 0 / 1 | event.price_edit |
| test-016 | scripts/test-admin-web-auth-fast.mjs | PASS | 5 / 0 | admin.web_session, admin.authorize |
| test-017 | scripts/test-admin-whatsapp-outbound-status.mjs | FAIL | 3 / 3 | analytics.contacts |
| test-018 | scripts/test-checkout-pix-requirements.mjs | PASS | 1 / 0 | payment.pay_pix, combo.pay_pix |
| test-019 | scripts/test-combo-offer-priority.mjs | FAIL | 4 / 3 | combo.schedule, combo.duplicate, combo.offer_send |
| test-020 | scripts/test-combo-offer-priority-real.mjs | NOT_RUN | — | combo.offer_send |
| test-021 | scripts/test-combo-offer-qr-delivery-policy.mjs | PASS | 8 / 0 | combo.schedule, combo.offer_send |
| test-022 | scripts/test-combo-qr-image-template.mjs | PASS | 9 / 0 | combo.deliver_qr, combo.prepare |
| test-023 | scripts/test-conversation-inactivity.mjs | PASS | 1 / 0 | background.close_inactive |
| test-024 | scripts/test-function-search-path-hardening.mjs | PASS | 3 / 0 | Teste técnico |
| test-025 | scripts/test-message-mojibake.mjs | FAIL | 0 / 1 | messaging.respond |
| test-026 | scripts/test-official-table-map.mjs | NOT_RUN | — | table_map.preview, table_map.calibrate, table_map.reserve |
| test-027 | scripts/test-paid-delivery-conversation-fallback.mjs | PASS | 4 / 0 | ticket.deliver, combo.deliver_qr |
| test-028 | scripts/test-paid-delivery-outbound-idempotency.mjs | PASS | 10 / 0 | messaging.protect_delivery, ticket.deliver, combo.deliver_qr |
| test-029 | scripts/test-public-all-events-formatting.mjs | PASS | 11 / 0 | catalog.list |
| test-030 | scripts/test-public-availability-classification.mjs | FAIL | 20 / 1 | catalog.details, catalog.offers |
| test-031 | scripts/test-public-event-visibility-policy.mjs | PASS | 8 / 0 | catalog.enforce_visibility, ticket.view, courtesy.resend, courtesy.public_issue, combo.checkout_view |
| test-032 | scripts/test-public-help-flow.mjs | FAIL | 6 / 2 | messaging.help |
| test-033 | scripts/test-public-initial-flow.mjs | PASS | 24 / 0 | messaging.receive, messaging.start, messaging.close, catalog.search, catalog.list |
| test-034 | scripts/test-reservation-load-safe.mjs | NOT_RUN | — | reservation.create |
| test-035 | scripts/test-single-event-more-info-buy-context.mjs | PASS | 2 / 0 | catalog.details |
| test-036 | scripts/test-ticket-delivery-distribution.mjs | PASS | 79 / 0 | ticket.deliver, ticket.delivery_choice, ticket.assign_participants, ticket.claim_participant, ticket.resend, combo.offer_send, combo.checkout_create, combo.delivery_prompt, combo.delivery_choose |
| test-037 | scripts/test-ticket-qr-image-template.mjs | PASS | 1 / 0 | ticket.deliver |
| test-038 | scripts/test-whatsapp-batch-compat.mjs | FAIL | 6 / 1 | background.close_inactive, background.cancel_batches |
| test-039 | scripts/test-whatsapp-messaging-regressions.mjs | PASS | 6 / 0 | messaging.receive, messaging.respond |
| test-040 | scripts/test-whatsapp-operational-outbound-null-conversation.mjs | FAIL | 5 / 1 | analytics.contacts |
| test-041 | scripts/test-whatsapp-outbound-delivery-security.mjs | PASS | 5 / 0 | messaging.protect_delivery |
| test-042 | scripts/test-whatsapp-outbound-metadata-contract.mjs | PASS | 4 / 0 | messaging.respond |
| test-043 | scripts/test-whatsapp-output-sanitization.mjs | PASS | 2 / 0 | messaging.respond |
| audit.admin-courtesies | .tools/audit_admin_courtesies.mjs | NOT_RUN | — | courtesy.issue, courtesy.list, courtesy.resend, courtesy.cancel |
| audit.admin-event-creation-flow | .tools/audit_admin_event_creation_flow.mjs | NOT_RUN | — | event.list, event.create, event.publish, event.session_create, event.section_create, event.seats_create |
| audit.admin-event-edit-duplicate | .tools/audit_admin_event_edit_duplicate.mjs | NOT_RUN | — | event.edit, event.duplicate, event.session_edit, event.section_edit, event.capacity_set, event.seats_create, event.seats_block, event.price_create, event.price_edit |
| audit.admin-login-lockout | .tools/audit_admin_login_lockout.mjs | NOT_RUN | — | admin.login, admin.lockout, admin.unlock |
| audit.admin-navigation-flow | .tools/audit_admin_navigation_flow.mjs | NOT_RUN | — | messaging.navigate_admin, admin.logout, background.expire_admin |
| audit.admin-orders-tickets | .tools/audit_admin_orders_tickets.mjs | NOT_RUN | — | reservation.cancel, ticket.admin_lookup |
| audit.admin-profiles-permissions | .tools/audit_admin_profiles_permissions.mjs | NOT_RUN | — | event.list, event.edit, admin.authorize, admin.users_list |
| audit.admin-reports | .tools/audit_admin_reports.mjs | NOT_RUN | — | analytics.sales, analytics.division, analytics.settle, analytics.general_report, analytics.section_sales, analytics.pending_orders, analytics.expired_reservations, analytics.gate_checkins, analytics.ticket_usage, analytics.courtesies |
| audit.admin-tokenized-login | .tools/audit_admin_tokenized_login.mjs | NOT_RUN | — | admin.login, admin.web_session |
| audit.admin-users-flow | .tools/audit_admin_users_flow.mjs | NOT_RUN | — | admin.users_list, admin.user_create, admin.role_change, admin.user_disable, admin.user_reactivate, admin.password_renew |
| audit.buyer-anti-abuse | .tools/audit_buyer_anti_abuse.mjs | NOT_RUN | — | customer.limit_reservations, customer.limit_checkout, reservation.create, payment.checkout_create |
| audit.buy-flow | .tools/audit_buy_flow.mjs | NOT_RUN | — | catalog.search, catalog.offers, reservation.cart, reservation.create, reservation.resume, payment.checkout_create |
| audit.cancel-pending-reservation-rpc | .tools/audit_cancel_pending_reservation_rpc.mjs | NOT_RUN | — | reservation.cancel |
| audit.combo-redemption-security | .tools/audit_combo_redemption_security.mjs | NOT_RUN | — | combo.redeem |
| audit.gate-phone-checkin | .tools/audit_gate_phone_checkin.mjs | NOT_RUN | — | admin.authorize, gate.access_create, gate.access_list, gate.access_pause, gate.open |
| audit.gate-wrong-event | .tools/audit_gate_wrong_event.mjs | NOT_RUN | — | gate.open, gate.admit |
| audit.mercado-pago-security | .tools/audit_mercado_pago_security.mjs | NOT_RUN | — | payment.checkout_create, payment.pay_pix, payment.confirm, ticket.deliver |
| audit.rate-limit | .tools/audit_rate_limit.mjs | NOT_RUN | — | platform.limit_requests |
| audit.reservation-expiration-cancel | .tools/audit_reservation_expiration_cancel.mjs | NOT_RUN | — | reservation.cancel, reservation.expire, background.notify_expiry |
| audit.seatmap-qr-image | .tools/audit_seatmap_qr_image.mjs | NOT_RUN | — | catalog.seat_map, reservation.create, ticket.deliver |
| audit.system-closure | .tools/audit_system_closure.mjs | NOT_RUN | — | admin.authorize, admin.user_create |
| audit.whatsapp-intent-100 | scripts/audit-whatsapp-intent-100.mjs | NOT_RUN | — | messaging.start, catalog.search |
| audit.whatsapp-intent-gate | scripts/audit-whatsapp-intent-gate.mjs | NOT_RUN | — | messaging.start, catalog.search |
| audit.whatsapp-santana-search | scripts/audit-whatsapp-santana-search.mjs | NOT_RUN | — | catalog.search |

## Casos com falha e efeito na classificação

### test-001 — test-admin-auth-pending-cancel.mjs

- admin_auth_pending cancela login com logout sem executar outros ramos

Capabilities classificadas FAILING por estes casos: `admin.logout`.

### test-002 — test-admin-event-artist-name-leak.mjs

- duplicacao explicita nao herda artist_name do evento origem

Capabilities classificadas FAILING por estes casos: `event.duplicate`.

### test-005 — test-admin-events-editor-dashboard-section-extraction.mjs

- AdminDashboardSection owns general dashboard, event dashboard, contacts and fetches
- dashboard callbacks are memoized and errors flow back to the editor
- general contacts are cached by range outside the modal
- general dashboard has a dedicated lazy endpoint

Capabilities classificadas FAILING por estes casos: `analytics.general_dashboard`, `analytics.event_dashboard`.

### test-009 — test-admin-events-fast-mode.mjs

- fast payload keeps only list fields and empty metrics

Capabilities classificadas FAILING por estes casos: `event.list`.

### test-015 — test-admin-ticket-price-label-edit.mjs

- admin price ticket label remains independently editable

Capabilities classificadas FAILING por estes casos: `event.price_edit`.

### test-017 — test-admin-whatsapp-outbound-status.mjs

- admin panel labels outbound statuses without implying delivery or reading
- failed outbound attempts remain visible and visually distinct
- conversation history is scoped to displayed customers and includes paid outbound-only buyers

Capabilities classificadas FAILING por estes casos: `analytics.contacts`.

### test-019 — test-combo-offer-priority.mjs

- combo offers have an editable delivery priority
- dedupe is by event and only successful WhatsApp sends count as delivered
- duplicated combo offers remain editable by the admin who duplicated them

Capabilities classificadas FAILING por estes casos: `combo.schedule`, `combo.duplicate`, `combo.offer_send`.

### test-025 — test-message-mojibake.mjs

- mensagens publicas e administrativas nao contem mojibake

Capabilities classificadas FAILING por estes casos: `messaging.respond`.

### test-030 — test-public-availability-classification.mjs

- more info continua disponivel para sold out e vendas encerradas

Capabilities classificadas FAILING por estes casos: `catalog.details`.

### test-032 — test-public-help-flow.mjs

- busca por topico retorna resultados e preserva publicHelp e step
- selecao numerica responde topico encontrado sem trocar contexto

Capabilities classificadas FAILING por estes casos: `messaging.help`.

### test-038 — test-whatsapp-batch-compat.mjs

- cron finalizes inactive open conversations without duplicating finalizers

Capabilities classificadas FAILING por estes casos: `background.close_inactive`.

### test-040 — test-whatsapp-operational-outbound-null-conversation.mjs

- admin analytics can include outbound without conversation when includeAllContacts is true and keeps paid-conversation filter otherwise

Capabilities classificadas FAILING por estes casos: `analytics.contacts`.

## Matriz capability → proteção

| Capability | test_status | Testes/auditorias | Falhas associadas |
| --- | --- | --- | --- |
| platform.limit_requests | UNKNOWN | audit.rate-limit | — |
| brand.present_individual_offers | UNCOVERED | — | — |
| messaging.receive | PARTIAL | test-033, test-039 | — |
| messaging.respond | FAILING | test-025, test-039, test-042, test-043 | test-025 |
| messaging.start | COVERED | test-033, audit.whatsapp-intent-100, audit.whatsapp-intent-gate | — |
| messaging.close | COVERED | test-033 | — |
| messaging.help | FAILING | test-032 | test-032 |
| messaging.navigate_admin | COVERED | test-011, audit.admin-navigation-flow | — |
| messaging.protect_delivery | PARTIAL | test-028, test-041 | — |
| customer.identify | UNCOVERED | — | — |
| customer.limit_reservations | UNKNOWN | audit.buyer-anti-abuse | — |
| customer.limit_checkout | UNKNOWN | audit.buyer-anti-abuse | — |
| catalog.search | PARTIAL | test-033, audit.buy-flow, audit.whatsapp-intent-100, audit.whatsapp-intent-gate, audit.whatsapp-santana-search | — |
| catalog.list | PARTIAL | test-029, test-033 | — |
| catalog.details | FAILING | test-030, test-035 | test-030 |
| catalog.offers | PARTIAL | test-030, audit.buy-flow | — |
| catalog.seat_map | UNKNOWN | audit.seatmap-qr-image | — |
| catalog.enforce_visibility | COVERED | test-031 | — |
| event.list | FAILING | test-003, test-008, test-009, test-010, audit.admin-event-creation-flow, audit.admin-profiles-permissions | test-009 |
| event.inspect | PARTIAL | test-006, test-014 | — |
| event.create | PARTIAL | test-002, test-006, audit.admin-event-creation-flow | — |
| event.edit | PARTIAL | test-006, audit.admin-event-edit-duplicate, audit.admin-profiles-permissions | — |
| event.publish | UNKNOWN | audit.admin-event-creation-flow | — |
| event.change_status | UNCOVERED | — | — |
| event.cancel | UNCOVERED | — | — |
| event.duplicate | FAILING | test-002, audit.admin-event-edit-duplicate | test-002 |
| event.session_create | UNKNOWN | audit.admin-event-creation-flow | — |
| event.session_edit | UNKNOWN | audit.admin-event-edit-duplicate | — |
| event.section_create | UNKNOWN | audit.admin-event-creation-flow | — |
| event.section_edit | UNKNOWN | audit.admin-event-edit-duplicate | — |
| event.capacity_set | UNKNOWN | test-013, audit.admin-event-edit-duplicate | — |
| event.seats_create | UNKNOWN | audit.admin-event-creation-flow, audit.admin-event-edit-duplicate | — |
| event.seats_block | UNKNOWN | audit.admin-event-edit-duplicate | — |
| event.price_create | UNKNOWN | audit.admin-event-edit-duplicate | — |
| event.price_edit | FAILING | test-015, audit.admin-event-edit-duplicate | test-015 |
| event.auto_finish | UNCOVERED | — | — |
| event.import_program | UNCOVERED | — | — |
| event.legacy_rename | UNCOVERED | — | — |
| event.legacy_split | UNCOVERED | — | — |
| event.legacy_update | UNCOVERED | — | — |
| reservation.cart | UNKNOWN | audit.buy-flow | — |
| reservation.create | UNKNOWN | test-034, audit.buyer-anti-abuse, audit.buy-flow, audit.seatmap-qr-image | — |
| reservation.resume | UNKNOWN | audit.buy-flow | — |
| reservation.cancel | UNKNOWN | audit.admin-orders-tickets, audit.cancel-pending-reservation-rpc, audit.reservation-expiration-cancel | — |
| reservation.expire | UNKNOWN | audit.reservation-expiration-cancel | — |
| payment.checkout_create | UNKNOWN | audit.buyer-anti-abuse, audit.buy-flow, audit.mercado-pago-security | — |
| payment.checkout_view | UNCOVERED | — | — |
| payment.pay_pix | PARTIAL | test-018, audit.mercado-pago-security | — |
| payment.status | UNCOVERED | — | — |
| payment.confirm | UNKNOWN | audit.mercado-pago-security | — |
| ticket.deliver | PARTIAL | test-027, test-028, test-036, test-037, audit.mercado-pago-security, audit.seatmap-qr-image | — |
| ticket.delivery_choice | PARTIAL | test-036 | — |
| ticket.assign_participants | COVERED | test-036 | — |
| ticket.claim_participant | COVERED | test-036 | — |
| ticket.resend | COVERED | test-036 | — |
| ticket.view | PARTIAL | test-031 | — |
| ticket.admin_lookup | UNKNOWN | audit.admin-orders-tickets | — |
| ticket.validation_history | UNCOVERED | — | — |
| admin.login | PARTIAL | test-001, audit.admin-login-lockout, audit.admin-tokenized-login | — |
| admin.web_session | PARTIAL | test-016, audit.admin-tokenized-login | — |
| admin.logout | FAILING | test-001, audit.admin-navigation-flow | test-001 |
| admin.authorize | PARTIAL | test-010, test-016, audit.admin-profiles-permissions, audit.gate-phone-checkin, audit.system-closure | — |
| admin.lockout | PARTIAL | test-001, audit.admin-login-lockout | — |
| admin.users_list | UNKNOWN | audit.admin-profiles-permissions, audit.admin-users-flow | — |
| admin.user_create | UNKNOWN | audit.admin-users-flow, audit.system-closure | — |
| admin.role_change | UNKNOWN | audit.admin-users-flow | — |
| admin.user_disable | UNKNOWN | audit.admin-users-flow | — |
| admin.user_reactivate | UNKNOWN | audit.admin-users-flow | — |
| admin.password_renew | UNKNOWN | audit.admin-users-flow | — |
| admin.unlock | UNKNOWN | audit.admin-login-lockout | — |
| gate.access_create | UNKNOWN | audit.gate-phone-checkin | — |
| gate.access_list | UNKNOWN | audit.gate-phone-checkin | — |
| gate.access_pause | UNKNOWN | audit.gate-phone-checkin | — |
| gate.fixed_create | UNCOVERED | — | — |
| gate.fixed_list | UNCOVERED | — | — |
| gate.fixed_revoke | UNCOVERED | — | — |
| gate.open | UNKNOWN | audit.gate-phone-checkin, audit.gate-wrong-event | — |
| gate.consult | UNCOVERED | — | — |
| gate.admit | UNKNOWN | audit.gate-wrong-event | — |
| gate.session_revoke | UNCOVERED | — | — |
| courtesy.issue | UNKNOWN | audit.admin-courtesies | — |
| courtesy.list | UNKNOWN | audit.admin-courtesies | — |
| courtesy.resend | PARTIAL | test-031, audit.admin-courtesies | — |
| courtesy.cancel | UNKNOWN | audit.admin-courtesies | — |
| courtesy.section_limit | UNCOVERED | — | — |
| courtesy.event_limit | UNCOVERED | — | — |
| courtesy.public_issue | PARTIAL | test-031 | — |
| combo.list | PARTIAL | test-004 | — |
| combo.create | PARTIAL | test-004 | — |
| combo.edit | PARTIAL | test-004 | — |
| combo.scope | UNCOVERED | — | — |
| combo.schedule | FAILING | test-019, test-021 | test-019 |
| combo.activate | UNCOVERED | — | — |
| combo.duplicate | FAILING | test-019 | test-019 |
| combo.delete | UNCOVERED | — | — |
| combo.offer_send | FAILING | test-019, test-020, test-021, test-036 | test-019 |
| combo.checkout_create | PARTIAL | test-036 | — |
| combo.checkout_view | PARTIAL | test-031 | — |
| combo.pay_pix | PARTIAL | test-018 | — |
| combo.status | UNCOVERED | — | — |
| combo.confirm | UNCOVERED | — | — |
| combo.deliver_qr | COVERED | test-022, test-027, test-028 | — |
| combo.expire | UNCOVERED | — | — |
| combo.kitchen_open | UNCOVERED | — | — |
| combo.kitchen_release | UNCOVERED | — | — |
| combo.prepare | PARTIAL | test-022 | — |
| combo.delivery_prompt | PARTIAL | test-036 | — |
| combo.delivery_choose | PARTIAL | test-036 | — |
| combo.redeem | PARTIAL | test-036, audit.combo-redemption-security | — |
| table_map.preview | PARTIAL | test-026 | — |
| table_map.calibrate | PARTIAL | test-026 | — |
| table_map.reserve | PARTIAL | test-026 | — |
| table_map.sync_status | UNCOVERED | — | — |
| analytics.sales | UNKNOWN | audit.admin-reports | — |
| analytics.division | UNKNOWN | audit.admin-reports | — |
| analytics.settle | UNKNOWN | audit.admin-reports | — |
| analytics.general_dashboard | FAILING | test-005, test-014 | test-005 |
| analytics.event_dashboard | FAILING | test-005 | test-005 |
| analytics.contacts | FAILING | test-017, test-040 | test-017, test-040 |
| analytics.operational | PARTIAL | test-012 | — |
| analytics.track_click | UNCOVERED | — | — |
| background.notify_expiry | UNKNOWN | audit.reservation-expiration-cancel | — |
| background.remind_interest | UNCOVERED | — | — |
| background.expire_admin | UNKNOWN | audit.admin-navigation-flow | — |
| background.close_inactive | FAILING | test-023, test-038 | test-038 |
| background.cancel_batches | PARTIAL | test-038 | — |
| automation.request | UNCOVERED | — | — |
| automation.issue | UNCOVERED | — | — |
| automation.list | UNCOVERED | — | — |
| automation.execute | UNCOVERED | — | — |
| automation.notify | UNCOVERED | — | — |
| payment.return_notice | UNCOVERED | — | — |
| analytics.general_report | UNKNOWN | audit.admin-reports | — |
| analytics.section_sales | UNKNOWN | audit.admin-reports | — |
| analytics.pending_orders | UNKNOWN | audit.admin-reports | — |
| analytics.expired_reservations | UNKNOWN | audit.admin-reports | — |
| analytics.gate_checkins | UNKNOWN | audit.admin-reports | — |
| analytics.ticket_usage | UNKNOWN | audit.admin-reports | — |
| analytics.courtesies | UNKNOWN | audit.admin-reports | — |
| gate.sessions_list | UNCOVERED | — | — |

## Lacunas quantificadas

| Métrica | Quantidade |
| --- | --- |
| Com referência de teste/auditoria | 103 |
| Sem referência de teste | 37 |
| Com falha diretamente relacionada | 14 |
| Sem teste executado na Etapa 3 | 89 |
| UNKNOWN | 49 |
| UNCOVERED | 37 |
| PARTIAL | 32 |
| FAILING | 14 |
| COVERED | 8 |

`combo.redeem` possui cinco testes comportamentais locais no test-036; a auditoria real da RPC não foi executada.
