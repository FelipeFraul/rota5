> **Current Baseline 2.7.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Matriz e auditoria de cobertura de capabilities

Fonte canônica: [capabilities.json](../../system-knowledge/capabilities.json). Revisão independente local realizada após o primeiro agrupamento, por confronto dos inventários com código. Não houve delegação nem uso de documentação como prova única.

## Matriz funcional

| ID | Domain | Tipo | Implementação | Teste | Entrada | Marca |
| --- | --- | --- | --- | --- | --- | --- |
| platform.limit_requests | domain.platform-runtime | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| brand.present_individual_offers | domain.brand-presentation | USER_FACING | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | ROTA5 |
| messaging.receive | domain.whatsapp-conversations | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| messaging.respond | domain.whatsapp-conversations | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| messaging.start | domain.whatsapp-conversations | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| messaging.close | domain.whatsapp-conversations | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| messaging.help | domain.whatsapp-conversations | USER_FACING | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| messaging.navigate_admin | domain.whatsapp-conversations | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| messaging.protect_delivery | domain.whatsapp-conversations | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| customer.identify | domain.customer-risk | SYSTEM | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | COMMON |
| customer.limit_reservations | domain.customer-risk | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| customer.limit_checkout | domain.customer-risk | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| catalog.search | domain.event-catalog | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| catalog.list | domain.event-catalog | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| catalog.details | domain.event-catalog | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| catalog.offers | domain.event-catalog | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| catalog.seat_map | domain.event-catalog | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| catalog.enforce_visibility | domain.event-catalog | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| event.list | domain.event-administration | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.inspect | domain.event-administration | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.create | domain.event-administration | ADMIN | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.edit | domain.event-administration | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.publish | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.change_status | domain.event-administration | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| event.cancel | domain.event-administration | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| event.duplicate | domain.event-administration | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.session_create | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.session_edit | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.section_create | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.section_edit | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.capacity_set | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.seats_create | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.seats_block | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.price_create | domain.event-administration | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| event.price_edit | domain.event-administration | ADMIN | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| event.auto_finish | domain.event-administration | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| event.import_program | domain.event-administration | OPERATIONAL | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | COMMON |
| event.legacy_rename | domain.event-administration | OPERATIONAL | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | BLACK_HOUSE |
| event.legacy_split | domain.event-administration | OPERATIONAL | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | BLACK_HOUSE |
| event.legacy_update | domain.event-administration | OPERATIONAL | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | BLACK_HOUSE |
| reservation.cart | domain.reservation-inventory | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| reservation.create | domain.reservation-inventory | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| reservation.resume | domain.reservation-inventory | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| reservation.cancel | domain.reservation-inventory | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| reservation.expire | domain.reservation-inventory | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| payment.checkout_create | domain.orders-payments | USER_FACING | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| payment.checkout_view | domain.orders-payments | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| payment.pay_pix | domain.orders-payments | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| payment.status | domain.orders-payments | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| payment.confirm | domain.orders-payments | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| ticket.deliver | domain.ticketing-delivery | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| ticket.delivery_choice | domain.ticketing-delivery | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| ticket.assign_participants | domain.ticketing-delivery | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| ticket.claim_participant | domain.ticketing-delivery | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| ticket.resend | domain.ticketing-delivery | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| ticket.view | domain.ticketing-delivery | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| ticket.admin_lookup | domain.ticketing-delivery | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| ticket.validation_history | domain.ticketing-delivery | ADMIN | ÓRFÃ | UNCOVERED | NONE_CONFIRMED | COMMON |
| admin.login | domain.admin-identity-access | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| admin.web_session | domain.admin-identity-access | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| admin.logout | domain.admin-identity-access | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| admin.authorize | domain.admin-identity-access | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| admin.lockout | domain.admin-identity-access | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| admin.users_list | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.user_create | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.role_change | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.user_disable | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.user_reactivate | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.password_renew | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| admin.unlock | domain.admin-identity-access | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.access_create | domain.gate-admission | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.access_list | domain.gate-admission | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.access_pause | domain.gate-admission | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.fixed_create | domain.gate-admission | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| gate.fixed_list | domain.gate-admission | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| gate.fixed_revoke | domain.gate-admission | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| gate.open | domain.gate-admission | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.consult | domain.gate-admission | ADMIN | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | COMMON |
| gate.admit | domain.gate-admission | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.session_revoke | domain.gate-admission | ADMIN | ÓRFÃ | UNCOVERED | NONE_CONFIRMED | COMMON |
| courtesy.issue | domain.courtesy | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| courtesy.list | domain.courtesy | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| courtesy.resend | domain.courtesy | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| courtesy.cancel | domain.courtesy | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| courtesy.section_limit | domain.courtesy | ADMIN | PARCIAL | COVERED | CONDITIONAL_OR_HIDDEN | COMMON |
| courtesy.event_limit | domain.courtesy | ADMIN | ÓRFÃ | UNCOVERED | NONE_CONFIRMED | COMMON |
| courtesy.public_issue | domain.courtesy | USER_FACING | PARCIAL | PARTIAL | CONDITIONAL_OR_HIDDEN | COMMON |
| combo.list | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.create | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.edit | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.scope | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.schedule | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.activate | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.duplicate | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.delete | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.offer_send | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.checkout_create | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.checkout_view | domain.combo-commerce-fulfillment | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.pay_pix | domain.combo-commerce-fulfillment | USER_FACING | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.status | domain.combo-commerce-fulfillment | USER_FACING | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.confirm | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.deliver_qr | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.expire | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.kitchen_open | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.kitchen_release | domain.combo-commerce-fulfillment | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| combo.prepare | domain.combo-commerce-fulfillment | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.delivery_prompt | domain.combo-commerce-fulfillment | ADMIN | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.delivery_choose | domain.combo-commerce-fulfillment | USER_FACING | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| combo.redeem | domain.combo-commerce-fulfillment | ADMIN | PARCIAL | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| table_map.preview | domain.table-map | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| table_map.calibrate | domain.table-map | ADMIN | PARCIAL | PARTIAL | CONDITIONAL_OR_HIDDEN | COMMON |
| table_map.reserve | domain.table-map | USER_FACING | PARCIAL | PARTIAL | CONDITIONAL_OR_HIDDEN | COMMON |
| table_map.sync_status | domain.table-map | SYSTEM | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | COMMON |
| analytics.sales | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.division | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.settle | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.general_dashboard | domain.analytics-reporting | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| analytics.event_dashboard | domain.analytics-reporting | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| analytics.contacts | domain.analytics-reporting | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| analytics.operational | domain.analytics-reporting | ADMIN | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| analytics.track_click | domain.analytics-reporting | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| background.notify_expiry | domain.background-processing | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| background.remind_interest | domain.background-processing | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| background.expire_admin | domain.background-processing | SYSTEM | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| background.close_inactive | domain.background-processing | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| background.cancel_batches | domain.background-processing | SYSTEM | CONFIRMADA | PARTIAL | STRUCTURALLY_REACHABLE | COMMON |
| automation.request | domain.codex-automation | ADMIN | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| automation.issue | domain.codex-automation | SYSTEM | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| automation.list | domain.codex-automation | OPERATIONAL | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| automation.execute | domain.codex-automation | OPERATIONAL | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| automation.notify | domain.codex-automation | OPERATIONAL | CONFIRMADA | COVERED | STRUCTURALLY_REACHABLE | COMMON |
| payment.return_notice | domain.orders-payments | USER_FACING | CONFIRMADA | UNCOVERED | STRUCTURALLY_REACHABLE | BLACK_HOUSE |
| analytics.general_report | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.section_sales | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.pending_orders | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.expired_reservations | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.gate_checkins | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.ticket_usage | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| analytics.courtesies | domain.analytics-reporting | ADMIN | CONFIRMADA | UNKNOWN | STRUCTURALLY_REACHABLE | COMMON |
| gate.sessions_list | domain.gate-admission | ADMIN | ÓRFÃ | UNCOVERED | NONE_CONFIRMED | COMMON |

## Reconciliação top-down dos 17 domains

| Domain | Capabilities | Resultado |
| --- | --- | --- |
| domain.platform-runtime | 1 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.brand-presentation | 1 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.whatsapp-conversations | 7 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.customer-risk | 3 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.event-catalog | 6 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.event-administration | 22 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.reservation-inventory | 5 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.orders-payments | 6 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.ticketing-delivery | 8 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.admin-identity-access | 12 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.gate-admission | 11 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.courtesy | 7 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.combo-commerce-fulfillment | 22 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.table-map | 4 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.analytics-reporting | 15 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.background-processing | 5 | Ações verificadas no código; nenhuma marca foi promovida a domain. |
| domain.codex-automation | 5 | Ações verificadas no código; nenhuma marca foi promovida a domain. |

## Entrypoints — 56 de 56 classificados

| Entrada | Capabilities ou exclusão | Evidência/justificativa |
| --- | --- | --- |
| http-admin-open | admin.web_session | src/app/admin/eventos/abrir/[token]/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-combos | admin.authorize, combo.list, combo.create, combo.scope | src/app/api/admin/combo-offers/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-combo-id | admin.authorize, combo.edit, combo.scope, combo.schedule, combo.activate, combo.duplicate, combo.delete | src/app/api/admin/combo-offers/[offerId]/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-events | event.list, event.create, admin.authorize, combo.list, analytics.general_dashboard, analytics.contacts | src/app/api/admin/events/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-event-id | event.inspect, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, event.session_edit, event.section_create, event.section_edit, event.capacity_set, event.price_edit, admin.authorize, courtesy.section_limit, analytics.event_dashboard, analytics.contacts | src/app/api/admin/events/[eventId]/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-login | admin.login, admin.lockout | src/app/api/admin/login/verify/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-ops | admin.authorize, analytics.operational | src/app/api/admin/operational-dashboard/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-admin-map | admin.authorize, table_map.preview, table_map.calibrate | src/app/api/admin/table-map/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-checkout-mp | customer.limit_checkout, payment.checkout_create | src/app/api/checkout/mercado-pago/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-checkout-pay | platform.limit_requests, customer.limit_checkout, payment.pay_pix | src/app/api/checkout/mercado-pago/pay/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-checkout-status | messaging.protect_delivery, payment.status, payment.confirm, ticket.deliver | src/app/api/checkout/status/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-combo-pay | combo.pay_pix | src/app/api/combo-checkout/mercado-pago/pay/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-combo-status | combo.status | src/app/api/combo-checkout/status/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-cron-expire | reservation.expire, combo.offer_send, combo.checkout_create, combo.expire, table_map.sync_status, background.notify_expiry, background.remind_interest, background.expire_admin | src/app/api/cron/expire-reservations/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-cron-batches | background.close_inactive, background.cancel_batches | src/app/api/cron/process-whatsapp-batches/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-gate-consult | gate.consult | src/app/api/gate/session/consult/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-gate-scan | platform.limit_requests, gate.admit, combo.kitchen_release | src/app/api/gate/session/scan/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-gate-validate | gate.open | src/app/api/gate/session/validate/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-health | INFRASTRUCTURE | src/app/api/health/route.ts — Health check do processo, infraestrutura; não verifica compra ou integração fim a fim. |
| http-kitchen-open | combo.kitchen_open | src/app/api/kitchen/session/open/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-kitchen-prepare | combo.prepare | src/app/api/kitchen/session/prepare/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-kitchen-scan | combo.delivery_prompt, combo.redeem | src/app/api/kitchen/session/scan/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-kitchen-validate | combo.kitchen_open | src/app/api/kitchen/session/validate/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-mp-webhook | platform.limit_requests, messaging.protect_delivery, payment.confirm, ticket.deliver, ticket.delivery_choice, combo.confirm, combo.deliver_qr, table_map.sync_status | src/app/api/webhook/payment/mercado-pago/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| http-zapi-webhook | platform.limit_requests, brand.present_individual_offers, messaging.receive, messaging.respond, messaging.start, messaging.close, messaging.help, messaging.navigate_admin, messaging.protect_delivery, customer.identify, customer.limit_reservations, customer.limit_checkout, catalog.search, catalog.list, catalog.details, catalog.offers, catalog.seat_map, catalog.enforce_visibility, event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.duplicate, event.session_create, event.session_edit, event.section_create, event.section_edit, event.capacity_set, event.seats_create, event.seats_block, event.price_create, event.price_edit, event.auto_finish, reservation.cart, reservation.create, reservation.resume, reservation.cancel, payment.checkout_create, ticket.deliver, ticket.delivery_choice, ticket.assign_participants, ticket.claim_participant, ticket.resend, ticket.admin_lookup, admin.login, admin.web_session, admin.logout, admin.authorize, admin.lockout, admin.users_list, admin.user_create, admin.role_change, admin.user_disable, admin.user_reactivate, admin.password_renew, admin.unlock, gate.access_create, gate.access_list, gate.access_pause, gate.fixed_create, gate.fixed_list, gate.fixed_revoke, gate.open, courtesy.issue, courtesy.list, courtesy.resend, courtesy.cancel, courtesy.public_issue, combo.list, combo.create, combo.edit, combo.scope, combo.schedule, combo.activate, combo.duplicate, combo.delete, combo.kitchen_open, combo.delivery_choose, table_map.reserve, table_map.sync_status, analytics.sales, analytics.division, analytics.settle, automation.request, automation.issue, analytics.general_report, analytics.section_sales, analytics.pending_orders, analytics.expired_reservations, analytics.gate_checkins, analytics.ticket_usage, analytics.courtesies | src/app/api/webhook/zapi/route.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-root | INFRASTRUCTURE | src/app/page.tsx — Renderiza <main /> vazio; nenhum comportamento funcional do cliente. |
| page-admin-events | event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, event.session_edit, event.section_create, event.section_edit, event.capacity_set, event.price_edit, admin.web_session, combo.list, combo.create, combo.edit, combo.schedule, combo.activate, combo.duplicate, combo.delete, analytics.general_dashboard, analytics.event_dashboard, analytics.contacts | src/app/admin/eventos/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-admin-login | admin.login | src/app/admin/login/[token]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-admin-ops | admin.web_session, analytics.operational | src/app/admin/operacao/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-checkout | catalog.enforce_visibility, payment.checkout_view, payment.pay_pix, payment.status, analytics.track_click | src/app/checkout/[orderId]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-checkout-success | payment.return_notice | src/app/checkout/success/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-checkout-pending | payment.return_notice | src/app/checkout/pending/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-checkout-failure | payment.return_notice | src/app/checkout/failure/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-combo-checkout | catalog.enforce_visibility, combo.checkout_view, combo.pay_pix, combo.status, analytics.track_click | src/app/combo-checkout/[orderId]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-gate | gate.open, gate.consult, gate.admit | src/app/gate/session/[token]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-kitchen-access | combo.kitchen_open | src/app/kitchen/access/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-kitchen-session | combo.kitchen_open, combo.prepare | src/app/kitchen/session/[token]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-offer-reader | combo.kitchen_open, combo.delivery_prompt, combo.redeem | src/app/offer-reader/session/[token]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| page-ticket | catalog.enforce_visibility, ticket.view | src/app/tickets/[token]/page.tsx — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| proxy | platform.limit_requests | src/proxy.ts — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| npm-dev | INFRASTRUCTURE | next dev — Inicialização de servidor de desenvolvimento, toolchain. |
| npm-build | INFRASTRUCTURE | next build — Compilação/empacotamento, toolchain. |
| npm-test | INFRASTRUCTURE | package.json — Execução do inventário de testes, toolchain. |
| npm-start | INFRASTRUCTURE | next start — Inicialização de servidor de produção, infraestrutura. |
| npm-codex-requests | automation.list | scripts/list-codex-requests.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| npm-codex-runner | automation.execute, automation.notify | scripts/codex-local-runner.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-codex-runner | automation.execute, automation.notify | scripts/codex-local-runner.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-codex-list | automation.list | scripts/list-codex-requests.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-import | event.import_program | scripts/import-programacao-events.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-bh-rename | event.legacy_rename | scripts/rename-black-house-ticket-sections.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-bh-split | event.legacy_split | scripts/split-black-house-special-items.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| script-bh-update | event.legacy_update | scripts/update-black-house-sectors.mjs — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| trigger-cron-expire | reservation.expire, combo.offer_send, combo.checkout_create, combo.expire, background.notify_expiry, background.remind_interest, background.expire_admin | vercel.json — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| trigger-cron-batches | background.close_inactive, background.cancel_batches | vercel.json — Participa de capability, com guardas/limitações registradas. Métodos 405 não são operações independentes. |
| npm-lint | INFRASTRUCTURE | package.json — Verificação estática ESLint, toolchain. |
| npm-typecheck | INFRASTRUCTURE | package.json — Verificação TypeScript, toolchain. |

`GET/POST` que somente retorna 405 não representa outra capability. As 67 entradas de testes/auditorias estão reconciliadas ao final desta matriz e no inventário de testes. `layout.tsx`, config Next, TS, ESLint e assets são infraestrutura; não URLs de produto independentes.

## Modules — 66 de 66 classificados

| Module ID | Capabilities ou exclusão | Justificativa |
| --- | --- | --- |
| platform.env | INFRASTRUCTURE | Validação/configuração de ambiente compartilhada, sem ação funcional independente. |
| platform.supabase-client | INFRASTRUCTURE | Factory/cache de cliente de persistência; componente de capabilities que usam banco. |
| platform.logging | INFRASTRUCTURE | Log/máscara técnica para observabilidade, sem operação de produto independente comprovada. |
| platform.http | INFRASTRUCTURE | Wrappers de Response/erros HTTP; não têm identidade funcional própria. |
| platform.rate-limit | platform.limit_requests | Módulo participa dos caminhos de implementação citados no catálogo. |
| platform.edge-proxy | platform.limit_requests | Módulo participa dos caminhos de implementação citados no catálogo. |
| integration.zapi | messaging.respond | Módulo participa dos caminhos de implementação citados no catálogo. |
| integration.mercado-pago | payment.pay_pix, payment.confirm, combo.pay_pix, combo.confirm | Módulo participa dos caminhos de implementação citados no catálogo. |
| automation.github-issues | automation.issue | Módulo participa dos caminhos de implementação citados no catálogo. |
| brand.presentation | brand.present_individual_offers | Módulo participa dos caminhos de implementação citados no catálogo. |
| brand.shell-assets | ticket.view, combo.checkout_view, payment.return_notice | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.webhook | messaging.receive, messaging.respond, ticket.claim_participant, automation.request, automation.issue | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.router | messaging.start, messaging.close, messaging.help, messaging.navigate_admin, catalog.search, catalog.list, catalog.details, catalog.seat_map, event.session_create, event.seats_create, event.seats_block, event.price_create, reservation.cart, reservation.create, reservation.resume, reservation.cancel, ticket.delivery_choice, ticket.assign_participants, ticket.claim_participant, ticket.resend, ticket.admin_lookup, admin.login, admin.logout, admin.users_list, admin.user_create, admin.role_change, admin.user_disable, admin.user_reactivate, admin.password_renew, admin.unlock, gate.access_create, gate.access_list, gate.access_pause, gate.fixed_create, gate.fixed_list, gate.fixed_revoke, courtesy.issue, courtesy.list, courtesy.resend, courtesy.cancel, courtesy.public_issue, combo.delivery_choose, table_map.reserve, analytics.sales, analytics.division, analytics.settle, analytics.general_report, analytics.section_sales, analytics.pending_orders, analytics.expired_reservations, analytics.gate_checkins, analytics.ticket_usage, analytics.courtesies | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.state | messaging.start, messaging.close, messaging.navigate_admin, reservation.cart, background.close_inactive | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.public-dialog | messaging.respond, messaging.start, messaging.help, catalog.list | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.customers | messaging.receive, customer.identify | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.conversations | messaging.receive, messaging.start, messaging.close | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.messages | messaging.receive, messaging.respond, combo.offer_send, background.notify_expiry | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.outbound-deliveries | messaging.protect_delivery, ticket.deliver, combo.deliver_qr | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.batches | background.cancel_batches | Módulo participa dos caminhos de implementação citados no catálogo. |
| messaging.finalizer | background.close_inactive | Módulo participa dos caminhos de implementação citados no catálogo. |
| catalog.events | catalog.search, catalog.list, catalog.details, catalog.enforce_visibility | Módulo participa dos caminhos de implementação citados no catálogo. |
| catalog.visibility | catalog.details, catalog.offers, catalog.enforce_visibility | Módulo participa dos caminhos de implementação citados no catálogo. |
| catalog.inventory-read | brand.present_individual_offers, catalog.offers, catalog.seat_map | Módulo participa dos caminhos de implementação citados no catálogo. |
| event-admin.service | event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, event.session_create, event.session_edit, event.section_create, event.section_edit, event.capacity_set, event.seats_create, event.seats_block, event.price_create, event.price_edit, event.auto_finish | Módulo participa dos caminhos de implementação citados no catálogo. |
| event-admin.api | event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, event.session_edit, event.section_create, event.capacity_set, event.price_edit, admin.authorize, courtesy.section_limit, combo.list, analytics.general_dashboard, analytics.event_dashboard, analytics.contacts | Módulo participa dos caminhos de implementação citados no catálogo. |
| event-admin.ui | event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, event.session_edit, event.section_create, event.capacity_set, event.price_edit, courtesy.section_limit | Módulo participa dos caminhos de implementação citados no catálogo. |
| event-admin.program-importer | event.import_program | Módulo participa dos caminhos de implementação citados no catálogo. |
| event-admin.black-house-maintenance | event.legacy_rename, event.legacy_split, event.legacy_update | Módulo participa dos caminhos de implementação citados no catálogo. |
| reservation.service | customer.limit_reservations, reservation.create, reservation.resume, reservation.cancel, table_map.sync_status | Módulo participa dos caminhos de implementação citados no catálogo. |
| reservation.expiry | reservation.expire, combo.offer_send, combo.expire, background.notify_expiry, background.remind_interest, background.expire_admin | Módulo participa dos caminhos de implementação citados no catálogo. |
| customer-risk.service | customer.limit_reservations, customer.limit_checkout | Módulo participa dos caminhos de implementação citados no catálogo. |
| payment.checkout | customer.limit_checkout, reservation.resume, payment.checkout_create, payment.checkout_view, payment.pay_pix, payment.status, payment.confirm, analytics.track_click | Módulo participa dos caminhos de implementação citados no catálogo. |
| payment.api-ui | payment.checkout_create, payment.checkout_view, payment.pay_pix, payment.status, payment.return_notice | Módulo participa dos caminhos de implementação citados no catálogo. |
| payment.webhook | payment.confirm, combo.confirm, table_map.sync_status | Módulo participa dos caminhos de implementação citados no catálogo. |
| payment.primitives | payment.checkout_create | Módulo participa dos caminhos de implementação citados no catálogo. |
| ticket.service | ticket.deliver, ticket.delivery_choice, ticket.assign_participants, ticket.claim_participant, ticket.resend, ticket.view | Módulo participa dos caminhos de implementação citados no catálogo. |
| ticket.delivery | messaging.protect_delivery, ticket.deliver, ticket.delivery_choice, ticket.claim_participant, ticket.resend | Módulo participa dos caminhos de implementação citados no catálogo. |
| ticket.qr | ticket.deliver, ticket.claim_participant, ticket.resend, courtesy.issue, courtesy.resend | Módulo participa dos caminhos de implementação citados no catálogo. |
| ticket.public-page | ticket.view | Módulo participa dos caminhos de implementação citados no catálogo. |
| ticket.free-issuance | courtesy.public_issue | Módulo participa dos caminhos de implementação citados no catálogo. |
| admin.ticket-operations | reservation.cancel, ticket.admin_lookup, ticket.validation_history | Módulo participa dos caminhos de implementação citados no catálogo. |
| admin.auth | admin.login, admin.web_session, admin.logout, admin.authorize, admin.lockout, admin.user_create, admin.password_renew, background.expire_admin, automation.request | Módulo participa dos caminhos de implementação citados no catálogo. |
| admin.users | admin.users_list, admin.user_create, admin.role_change, admin.user_disable, admin.user_reactivate, admin.password_renew, admin.unlock | Módulo participa dos caminhos de implementação citados no catálogo. |
| admin.login-ui-api | admin.login, admin.web_session | Módulo participa dos caminhos de implementação citados no catálogo. |
| gate.access-session | gate.access_create, gate.access_list, gate.access_pause, gate.fixed_create, gate.fixed_list, gate.fixed_revoke, gate.open, gate.admit, gate.session_revoke, combo.kitchen_open, gate.sessions_list | Módulo participa dos caminhos de implementação citados no catálogo. |
| gate.validation | gate.consult, gate.admit, combo.kitchen_release | Módulo participa dos caminhos de implementação citados no catálogo. |
| gate.ui-api | gate.open, gate.consult, gate.admit | Módulo participa dos caminhos de implementação citados no catálogo. |
| courtesy.service | event.auto_finish, courtesy.issue, courtesy.list, courtesy.resend, courtesy.cancel, courtesy.section_limit, courtesy.event_limit, courtesy.public_issue | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.offers | messaging.protect_delivery, combo.list, combo.create, combo.edit, combo.scope, combo.schedule, combo.activate, combo.duplicate, combo.delete, combo.offer_send, combo.checkout_create, combo.checkout_view, combo.pay_pix, combo.status, combo.confirm, combo.deliver_qr, combo.expire, analytics.track_click | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.checkout-ui-api | combo.checkout_create, combo.checkout_view, combo.pay_pix, combo.status | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.redemption | combo.kitchen_open, combo.kitchen_release, combo.prepare, combo.delivery_prompt, combo.delivery_choose, combo.redeem | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.qr | combo.deliver_qr, combo.prepare | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.kitchen-reader-ui-api | combo.kitchen_open, combo.prepare, combo.delivery_prompt, combo.redeem | Módulo participa dos caminhos de implementação citados no catálogo. |
| combo.admin-ui | admin.authorize, combo.list, combo.create, combo.edit, combo.scope, combo.schedule, combo.activate, combo.duplicate, combo.delete | Módulo participa dos caminhos de implementação citados no catálogo. |
| table-map.catalog-render | catalog.seat_map, table_map.preview, table_map.calibrate, table_map.reserve | Módulo participa dos caminhos de implementação citados no catálogo. |
| table-map.reservation | table_map.reserve, table_map.sync_status | Módulo participa dos caminhos de implementação citados no catálogo. |
| table-map.admin-ui-api | table_map.preview, table_map.calibrate | Módulo participa dos caminhos de implementação citados no catálogo. |
| analytics.reports | analytics.sales, analytics.division, analytics.settle, analytics.general_report, analytics.section_sales, analytics.pending_orders, analytics.expired_reservations, analytics.gate_checkins, analytics.ticket_usage, analytics.courtesies | Módulo participa dos caminhos de implementação citados no catálogo. |
| analytics.contacts | analytics.contacts | Módulo participa dos caminhos de implementação citados no catálogo. |
| analytics.operational-dashboard | analytics.operational | Módulo participa dos caminhos de implementação citados no catálogo. |
| analytics.admin-dashboard-ui | analytics.general_dashboard, analytics.event_dashboard, analytics.contacts | Módulo participa dos caminhos de implementação citados no catálogo. |
| background.expire-cron | reservation.expire, combo.offer_send, background.notify_expiry, background.remind_interest, background.expire_admin | Módulo participa dos caminhos de implementação citados no catálogo. |
| background.batch-cron | background.close_inactive, background.cancel_batches | Módulo participa dos caminhos de implementação citados no catálogo. |
| automation.codex-requests | automation.request, automation.issue, automation.execute | Módulo participa dos caminhos de implementação citados no catálogo. |
| automation.local-runner | automation.list, automation.execute, automation.notify | Módulo participa dos caminhos de implementação citados no catálogo. |

## Funções/RPCs — 33 nomes revisados

As 78 declarações CREATE FUNCTION e suas substituições foram inventariadas nas migrations; o agrupamento é por nome, sem tratar overload histórico como funcionalidade nova. Chamadas reais em TypeScript/SQL e consumidores delimitam as capabilities. Funções removidas por assinatura não foram promovidas a capacidade adicional. Nada nesta lista afirma instalação remota.

| Função | Capabilities | Classificação/justificativa | Última declaração por nome |
| --- | --- | --- | --- |
| set_updated_at | — | Auxiliar de timestamps; 32 triggers de manutenção, sem capability própria. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:2409](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L2409) |
| reserve_seats | reservation.create | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1683](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1683) |
| expire_reservations | reservation.expire | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:529](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L529) |
| confirm_paid_ticket_order | payment.status, payment.confirm | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:114](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L114) |
| validate_ticket_entry | gate.admit | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:2420](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L2420) |
| cancel_pending_reservation | reservation.cancel | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:4](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L4) |
| issue_courtesy_order | courtesy.issue | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:738](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L738) |
| consume_rate_limit | platform.limit_requests | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:447](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L447) |
| issue_public_free_ticket_order | courtesy.public_issue | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1041](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1041) |
| reserve_ticket_cart | reservation.create | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1989](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1989) |
| validate_combo_redemption | combo.redeem | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260629000300_require_combo_preparation_before_redemption.sql:1](../../supabase/migrations/20260629000300_require_combo_preparation_before_redemption.sql#L1) |
| normalize_event_search_text | catalog.search | Normalização auxiliar da busca ranqueada, coberta por catalog.search. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1662](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1662) |
| search_public_events_ranked | catalog.search | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260805000100_add_event_artist_icon.sql:16](../../supabase/migrations/20260805000100_add_event_artist_icon.sql#L16) |
| append_whatsapp_message_batch | — | Persistência/agregação técnica de mensagens; appendInboundMessageToBatch sem consumidor atual. Não demonstra resposta por lotes. | [supabase/migrations/20260720000200_fix_whatsapp_batch_append_ambiguity.sql:1](../../supabase/migrations/20260720000200_fix_whatsapp_batch_append_ambiguity.sql#L1) |
| claim_due_whatsapp_message_batches | background.cancel_batches | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql:1](../../supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql#L1) |
| finish_whatsapp_message_batch | background.cancel_batches | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260720000100_add_whatsapp_batch_retry_controls.sql:91](../../supabase/migrations/20260720000100_add_whatsapp_batch_retry_controls.sql#L91) |
| reschedule_whatsapp_message_batch | background.cancel_batches | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql:65](../../supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql#L65) |
| claim_whatsapp_outbound_delivery | messaging.protect_delivery | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql:13](../../supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql#L13) |
| enforce_one_active_reservation_per_customer | — | Função trigger declarada, sem CREATE TRIGGER correspondente encontrado. Não promovida a capability; reserva exclusiva existe pelas funções de lock chamadas pelas RPCs. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:515](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L515) |
| issue_admin_courtesy_order | courtesy.issue | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:616](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L616) |
| lock_and_validate_courtesy_limits | courtesy.issue | Auxiliar transacional de limites dentro da emissão de cortesia. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1280](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1280) |
| lock_customer_active_reservation_slot | reservation.create | Auxiliar de exclusão mútua por cliente nas RPCs de reserva. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1375](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1375) |
| lock_validate_and_record_reservation_buyer_risk | reservation.create, customer.limit_reservations | Auxiliar transacional de risco/limites chamado por reserve_seats. | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1408](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1408) |
| reserve_official_table_map_place | table_map.reserve | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260724000600_scope_official_table_map_reservations_by_session.sql:33](../../supabase/migrations/20260724000600_scope_official_table_map_reservations_by_session.sql#L33) |
| sync_official_table_map_reservation_status | table_map.sync_status | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260722000800_create_official_table_map_reservations.sql:164](../../supabase/migrations/20260722000800_create_official_table_map_reservations.sql#L164) |
| list_admin_events_fast | event.list | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql:1](../../supabase/migrations/20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql#L1) |
| get_admin_event_editor_payload | event.inspect | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260805000100_add_event_artist_icon.sql:128](../../supabase/migrations/20260805000100_add_event_artist_icon.sql#L128) |
| get_admin_general_dashboard_summary | analytics.general_dashboard | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260723000700_optimize_admin_event_detail_and_dashboard.sql:209](../../supabase/migrations/20260723000700_optimize_admin_event_detail_and_dashboard.sql#L209) |
| assign_participant_contacts_to_order_tickets | ticket.assign_participants | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql:1](../../supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql#L1) |
| get_admin_intelligence_dashboard | analytics.operational | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260725001000_create_admin_intelligence_dashboard_rpc.sql:1](../../supabase/migrations/20260725001000_create_admin_intelligence_dashboard_rpc.sql#L1) |
| mark_buyer_ticket_qr_delivered | ticket.deliver, combo.offer_send | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql:12](../../supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql#L12) |
| update_admin_section_capacity | event.capacity_set | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql:8](../../supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql#L8) |
| get_database_now | combo.offer_send, combo.checkout_create | Comportamento associado às capabilities referenciadas; RPC não é automaticamente capability. | [supabase/migrations/20260805000200_create_get_database_now_rpc.sql:1](../../supabase/migrations/20260805000200_create_get_database_now_rpc.sql#L1) |

## Triggers — 33 de 33 classificados

| Trigger | Função | Capability ou exclusão | Evidência |
| --- | --- | --- | --- |
| customers_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:418](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L418) |
| conversations_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:422](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L422) |
| venues_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:426](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L426) |
| venue_sections_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:430](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L430) |
| seats_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:434](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L434) |
| events_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:438](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L438) |
| event_sessions_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:442](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L442) |
| session_seats_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:446](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L446) |
| ticket_prices_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:450](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L450) |
| reservations_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:454](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L454) |
| orders_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:458](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L458) |
| payments_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:462](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L462) |
| tickets_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:466](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L466) |
| seat_map_renders_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000100_create_ticketing_schema.sql:470](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L470) |
| set_gate_sessions_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000600_create_gate_sessions.sql:41](../../supabase/migrations/20260522000600_create_gate_sessions.sql#L41) |
| set_admin_users_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260522000800_create_admin_users_and_sessions.sql:63](../../supabase/migrations/20260522000800_create_admin_users_and_sessions.sql#L63) |
| courtesy_limits_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260524002000_create_courtesies.sql:39](../../supabase/migrations/20260524002000_create_courtesies.sql#L39) |
| courtesies_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260524002000_create_courtesies.sql:43](../../supabase/migrations/20260524002000_create_courtesies.sql#L43) |
| set_gate_accesses_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260525000300_create_gate_accesses.sql:40](../../supabase/migrations/20260525000300_create_gate_accesses.sql#L40) |
| set_admin_auth_attempts_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260526000300_create_admin_auth_attempts.sql:30](../../supabase/migrations/20260526000300_create_admin_auth_attempts.sql#L30) |
| set_rate_limit_events_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260526000400_create_rate_limit_events.sql:21](../../supabase/migrations/20260526000400_create_rate_limit_events.sql#L21) |
| set_admin_login_challenges_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260526000500_create_admin_login_challenges.sql:50](../../supabase/migrations/20260526000500_create_admin_login_challenges.sql#L50) |
| set_division_settlements_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260624000100_create_division_settlements.sql:35](../../supabase/migrations/20260624000100_create_division_settlements.sql#L35) |
| set_combo_offers_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260624000200_create_combo_offers.sql:185](../../supabase/migrations/20260624000200_create_combo_offers.sql#L185) |
| set_combo_orders_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260624000200_create_combo_offers.sql:190](../../supabase/migrations/20260624000200_create_combo_offers.sql#L190) |
| set_combo_payments_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260624000200_create_combo_offers.sql:195](../../supabase/migrations/20260624000200_create_combo_offers.sql#L195) |
| set_combo_redemptions_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260624000200_create_combo_offers.sql:200](../../supabase/migrations/20260624000200_create_combo_offers.sql#L200) |
| courtesy_section_limits_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260714000100_create_courtesy_section_limits.sql:24](../../supabase/migrations/20260714000100_create_courtesy_section_limits.sql#L24) |
| set_fixed_gate_accesses_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260717000200_create_fixed_gate_accesses.sql:36](../../supabase/migrations/20260717000200_create_fixed_gate_accesses.sql#L36) |
| set_whatsapp_message_batches_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260718000200_create_whatsapp_message_batches.sql:40](../../supabase/migrations/20260718000200_create_whatsapp_message_batches.sql#L40) |
| official_table_map_reservations_set_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260722000800_create_official_table_map_reservations.sql:30](../../supabase/migrations/20260722000800_create_official_table_map_reservations.sql#L30) |
| reservations_sync_official_table_map_status | sync_official_table_map_reservation_status | table_map.sync_status | [supabase/migrations/20260722000800_create_official_table_map_reservations.sql:193](../../supabase/migrations/20260722000800_create_official_table_map_reservations.sql#L193) |
| set_combo_offer_event_locks_updated_at | set_updated_at | Mantém updated_at; não gera ação funcional independente. | [supabase/migrations/20260723000400_add_combo_offer_display_priority.sql:77](../../supabase/migrations/20260723000400_add_combo_offer_display_priority.sql#L77) |

Há 32 triggers técnicos de updated_at e um de sincronização de mesa. `enforce_one_active_reservation_per_customer` retorna trigger, mas não tem CREATE TRIGGER instalador identificado; não foi confundida com trigger ativo. A exclusividade de reserva também é protegida por chamadas transacionais de lock.

## Revarredura dos testes e auditorias — 67 de 67 classificados

| Teste/auditoria | Capabilities ou exclusão |
| --- | --- |
| test-001 | admin.login, admin.logout, admin.lockout |
| test-002 | event.create, event.duplicate |
| test-003 | event.list |
| test-004 | combo.list, combo.create, combo.edit |
| test-005 | analytics.general_dashboard, analytics.event_dashboard |
| test-006 | event.inspect, event.create, event.edit |
| test-007 | Testa lazy loading de modais; detalhe de implementação das telas, não capability separada. |
| test-008 | event.list |
| test-009 | event.list |
| test-010 | event.list, admin.authorize |
| test-011 | messaging.navigate_admin |
| test-012 | analytics.operational |
| test-013 | event.capacity_set |
| test-014 | event.inspect, analytics.general_dashboard |
| test-015 | event.price_edit |
| test-016 | admin.web_session, admin.authorize |
| test-017 | analytics.contacts |
| test-018 | payment.pay_pix, combo.pay_pix |
| test-019 | combo.schedule, combo.duplicate, combo.offer_send |
| test-020 | combo.offer_send |
| test-021 | combo.schedule, combo.offer_send |
| test-022 | combo.deliver_qr, combo.prepare |
| test-023 | background.close_inactive |
| test-024 | Testa search_path e grants SQL (test-024); requisito técnico transversal, não capability própria. |
| test-025 | messaging.respond |
| test-026 | table_map.preview, table_map.calibrate, table_map.reserve |
| test-027 | ticket.deliver, combo.deliver_qr |
| test-028 | messaging.protect_delivery, ticket.deliver, combo.deliver_qr |
| test-029 | catalog.list |
| test-030 | catalog.details, catalog.offers |
| test-031 | catalog.enforce_visibility, ticket.view, courtesy.resend, courtesy.public_issue, combo.checkout_view |
| test-032 | messaging.help |
| test-033 | messaging.receive, messaging.start, messaging.close, catalog.search, catalog.list |
| test-034 | reservation.create |
| test-035 | catalog.details |
| test-036 | ticket.deliver, ticket.delivery_choice, ticket.assign_participants, ticket.claim_participant, ticket.resend, combo.offer_send, combo.checkout_create, combo.delivery_prompt, combo.delivery_choose |
| test-037 | ticket.deliver |
| test-038 | background.close_inactive, background.cancel_batches |
| test-039 | messaging.receive, messaging.respond |
| test-040 | analytics.contacts |
| test-041 | messaging.protect_delivery |
| test-042 | messaging.respond |
| test-043 | messaging.respond |
| audit.admin-courtesies | courtesy.issue, courtesy.list, courtesy.resend, courtesy.cancel |
| audit.admin-event-creation-flow | event.list, event.create, event.publish, event.session_create, event.section_create, event.seats_create |
| audit.admin-event-edit-duplicate | event.edit, event.duplicate, event.session_edit, event.section_edit, event.capacity_set, event.seats_create, event.seats_block, event.price_create, event.price_edit |
| audit.admin-login-lockout | admin.login, admin.lockout, admin.unlock |
| audit.admin-navigation-flow | messaging.navigate_admin, admin.logout, background.expire_admin |
| audit.admin-orders-tickets | reservation.cancel, ticket.admin_lookup |
| audit.admin-profiles-permissions | event.list, event.edit, admin.authorize, admin.users_list |
| audit.admin-reports | analytics.sales, analytics.division, analytics.settle, analytics.general_report, analytics.section_sales, analytics.pending_orders, analytics.expired_reservations, analytics.gate_checkins, analytics.ticket_usage, analytics.courtesies |
| audit.admin-tokenized-login | admin.login, admin.web_session |
| audit.admin-users-flow | admin.users_list, admin.user_create, admin.role_change, admin.user_disable, admin.user_reactivate, admin.password_renew |
| audit.buyer-anti-abuse | customer.limit_reservations, customer.limit_checkout, reservation.create, payment.checkout_create |
| audit.buy-flow | catalog.search, catalog.offers, reservation.cart, reservation.create, reservation.resume, payment.checkout_create |
| audit.cancel-pending-reservation-rpc | reservation.cancel |
| audit.combo-redemption-security | combo.redeem |
| audit.gate-phone-checkin | admin.authorize, gate.access_create, gate.access_list, gate.access_pause, gate.open |
| audit.gate-wrong-event | gate.open, gate.admit |
| audit.mercado-pago-security | payment.checkout_create, payment.pay_pix, payment.confirm, ticket.deliver |
| audit.rate-limit | platform.limit_requests |
| audit.reservation-expiration-cancel | reservation.cancel, reservation.expire, background.notify_expiry |
| audit.seatmap-qr-image | catalog.seat_map, reservation.create, ticket.deliver |
| audit.system-closure | admin.authorize, admin.user_create |
| audit.whatsapp-intent-100 | messaging.start, catalog.search |
| audit.whatsapp-intent-gate | messaging.start, catalog.search |
| audit.whatsapp-santana-search | catalog.search |

## Candidatos aparentes revisados e rejeitados como capability própria

| Candidato | Evidência | Decisão |
| --- | --- | --- |
| createMercadoPagoPreference | [src/lib/mercado-pago/client.ts:201](../../src/lib/mercado-pago/client.ts#L201) | Adapter para criar preferência hospedada sem consumidor; não há orquestração de pedido/checkout hospedado atual comprovada. Componente órfão, não capability adicional por ser wrapper de integração. |
| appendInboundMessageToBatch | [src/lib/tickets/services/whatsappMessageBatches.ts:193](../../src/lib/tickets/services/whatsappMessageBatches.ts#L193) | Agregação técnica sem consumidor atual. Cron cancela lotes; não há capability de responder por batch comprovada. |
| createGateSessionForRegisteredValidator | [src/lib/tickets/services/gateSessions.ts:575](../../src/lib/tickets/services/gateSessions.ts#L575) | Rotação alternativa de sessão sem consumidor; mesma finalidade de gate.open, não novo ID. |
| buildSeatMapImageDataUrl | [src/lib/tickets/services/seats.ts:324](../../src/lib/tickets/services/seats.ts#L324) | Renderizador alternativo sem consumidor; catalog.seat_map utiliza PNG, não nova capability. |
| BrandLogo | [src/app/BrandLogo.tsx:1](../../src/app/BrandLogo.tsx#L1) | Componente visual sem importador confirmado; marca/apresentação não prova ação funcional independente. |
| seat_map_renders | [supabase/migrations/20260522000100_create_ticketing_schema.sql:1](../../supabase/migrations/20260522000100_create_ticketing_schema.sql#L1) | Tabela, trigger e variável de bucket sem consumidor de storage encontrado; não catalogar upload/armazenamento de mapas por migração apenas. |
| enforce_one_active_reservation_per_customer | [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:515](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L515) | Função RETURNS trigger sem instalação por CREATE TRIGGER nas migrations locais; invariantes ativas são chamadas por RPCs. |
| batch_reply | [src/app/api/cron/process-whatsapp-batches/route.ts:89](../../src/app/api/cron/process-whatsapp-batches/route.ts#L89) | Ramo processClaimedBatch cancela. Não existe motor de resposta assíncrona funcional acessível neste snapshot. |
| multi_tenancy | [src/lib/tickets/rota5Presentation.ts:1](../../src/lib/tickets/rota5Presentation.ts#L1) | Flags globais e textos de marcas não provam tenants, isolamento ou seleção de marca. |
| home_catalog | [src/app/page.tsx:1](../../src/app/page.tsx#L1) | Raiz retorna main vazio; não constitui catálogo web público. |
| auto_refund | [src/app/api/admin/events/[eventId]/route.ts:959](../../src/app/api/admin/events/[eventId]/route.ts#L959) | DELETE marca cancelled; não há ação de estorno provada neste caminho. |
| payout | [src/lib/tickets/services/adminReports.ts:617](../../src/lib/tickets/services/adminReports.ts#L617) | Baixa de divisão é registro contábil, sem transferência bancária. |

## Revisão de granularidade e descobertas de segunda passagem

- Os verbos criar, editar, publicar, cancelar, expirar, confirmar, emitir, reenviar, validar, revogar, preparar, importar e sincronizar serviram para localizar candidatos; funções, ramos, dados e consumidores decidiram a inclusão.
- A segunda passagem explicitou o encerramento de evento disparado por leitura, baixa de divisão sem payout, diferentes relatórios e as quatro implementações sem consumidor. Todos foram revisitados nas respectivas funções.
- Duplicidade de implementação foi mantida como caminhos de um ID, quando o resultado funcional é o mesmo. Ações de consentimento/entrega/preparo/consumo de combo foram separadas, pois seus resultados e bloqueios diferem.
- Código de teste/experimento não definiu capacidade de produto: scripts/audit e .tools são evidência auxiliar; cópias de deploy e caches em .tmp/.next/node_modules foram excluídos do sistema de produção auditado.
- O cruzamento é estrutural e não garante todos os cenários de dados/concorrência. As limitações estão no catálogo; nenhum item foi declarado funcional apenas por nome.
