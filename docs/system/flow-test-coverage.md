> **Current Baseline 2.4.0 (2026-09-14):** canonical HEAD `67845326088eac47452224b00ef1e866036e86f1`; source fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0` across 368 files and 79 migrations. **DEFAULT_NODE_SUITE 236/236 PASS**; **POSTGRES_INTEGRATION_SUITE 1/1 PASS** on PostgreSQL 16 with real `sync_official_table_map_reservation_status`; **QUALITY_GATE run 34867214724 PASS**. Coverage: 21/21 MUST, 0 MUST gaps, 2/2 high-risk flows, 0 high-risk flow gaps, 0 skip, 0 todo, 0 regressions. Finding `gap.critical-capability-and-flow-coverage` is **RESOLVED**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 9. Product health remains BROKEN by the canonical release-blocker rule; infrastructure health remains DEGRADED. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; current HEAD deployed: **NAO** (post-runtime changes are test/tooling/CI only).

# Flow behavioral test coverage

The high-risk flows `event.auto_finish` and `codex.automation` are behaviorally covered. High-risk flows without coverage: **0**. The two gross uncovered flows (`event.program_import` and `blackhouse.maintenance`) are historical/operational and outside current high-risk scope.

| Flow | Type | Behavioral coverage | Evidence |
|---|---|---:|---|
| `whatsapp.public_discovery` | USER_JOURNEY | PARTIAL | `test-033`<br>`audit.whatsapp-intent-100`<br>`audit.whatsapp-intent-gate`<br>`test-032`<br>`audit.buy-flow`<br>`audit.whatsapp-santana-search`<br>`test-029`<br>`test-030`<br>`test-035`<br>`audit.seatmap-qr-image` |
| `ticket.purchase` | USER_JOURNEY | PARTIAL | `audit.buyer-anti-abuse`<br>`test-031`<br>`test-030`<br>`audit.buy-flow`<br>`test-034`<br>`audit.seatmap-qr-image`<br>`audit.admin-orders-tickets`<br>`audit.cancel-pending-reservation-rpc`<br>`audit.reservation-expiration-cancel`<br>`test-026`<br>`audit.mercado-pago-security` |
| `ticket.checkout` | USER_JOURNEY | PARTIAL | `audit.buyer-anti-abuse`<br>`test-018`<br>`audit.mercado-pago-security` |
| `ticket.delivery` | USER_JOURNEY | PARTIAL | `test-028`<br>`test-041`<br>`test-027`<br>`test-036`<br>`test-037`<br>`audit.mercado-pago-security`<br>`audit.seatmap-qr-image` |
| `ticket.view` | USER_JOURNEY | PARTIAL | `test-031` |
| `courtesy.public` | USER_JOURNEY | PARTIAL | `test-031` |
| `combo.purchase` | USER_JOURNEY | PARTIAL | `test-031`<br>`test-018` |
| `combo.delivery_choice` | USER_JOURNEY | PARTIAL | `test-036`<br>`test-026` |
| `admin.whatsapp_session` | ADMIN_JOURNEY | PARTIAL | `test-011`<br>`audit.admin-navigation-flow`<br>`test-001`<br>`audit.admin-login-lockout`<br>`audit.admin-tokenized-login` |
| `admin.web_session` | ADMIN_JOURNEY | PARTIAL | `test-001`<br>`audit.admin-login-lockout`<br>`audit.admin-tokenized-login`<br>`test-016` |
| `admin.web_event_workspace` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-003`<br>`test-008`<br>`test-009`<br>`audit.admin-event-creation-flow`<br>`test-006`<br>`test-014`<br>`test-002`<br>`audit.admin-event-edit-duplicate`<br>`test-004`<br>`test-005`<br>`test-017`<br>`test-040` |
| `admin.whatsapp_event_management` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-003`<br>`test-008`<br>`test-009`<br>`audit.admin-event-creation-flow`<br>`test-006`<br>`test-014`<br>`test-002`<br>`audit.admin-event-edit-duplicate`<br>`test-013`<br>`test-015` |
| `admin.combo_management` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-004`<br>`test-019`<br>`test-021` |
| `admin.courtesy_management` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-courtesies`<br>`test-031` |
| `admin.user_management` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-users-flow`<br>`audit.admin-login-lockout` |
| `admin.reporting` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`audit.admin-orders-tickets`<br>`audit.admin-reports` |
| `admin.operational_dashboard` | ADMIN_JOURNEY | PARTIAL | `test-016`<br>`audit.admin-tokenized-login`<br>`test-010`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-012` |
| `gate.access_management` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-044`<br>`test-046`<br>`test-047` |
| `gate.ticket_admission` | ADMIN_JOURNEY | PARTIAL | `audit.gate-phone-checkin`<br>`audit.gate-wrong-event`<br>`test-044`<br>`test-046`<br>`test-047` |
| `kitchen.session_prepare` | ADMIN_JOURNEY | PARTIAL | `test-022` |
| `kitchen.combo_redemption` | ADMIN_JOURNEY | PARTIAL | `test-036`<br>`audit.combo-redemption-security`<br>`test-044`<br>`test-046`<br>`test-047` |
| `table_map.calibration` | ADMIN_JOURNEY | PARTIAL | `test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure`<br>`test-026` |
| `whatsapp.inbound_dispatch` | SYSTEM_PROCESS | PARTIAL | `audit.rate-limit`<br>`test-033`<br>`test-039`<br>`test-025`<br>`test-042`<br>`test-043`<br>`test-010`<br>`test-016`<br>`audit.admin-profiles-permissions`<br>`audit.gate-phone-checkin`<br>`audit.system-closure` |
| `ticket.payment_confirmation` | SYSTEM_PROCESS | PARTIAL | `audit.rate-limit`<br>`audit.mercado-pago-security`<br>`test-027`<br>`test-028`<br>`test-036`<br>`test-037`<br>`audit.seatmap-qr-image`<br>`test-041` |
| `combo.payment_confirmation` | SYSTEM_PROCESS | PARTIAL | `audit.rate-limit`<br>`test-022`<br>`test-027`<br>`test-028`<br>`test-041` |
| `reservation.expiration` | SYSTEM_PROCESS | PARTIAL | `audit.reservation-expiration-cancel`<br>`audit.admin-navigation-flow` |
| `combo.offer_distribution` | SYSTEM_PROCESS | PARTIAL | `test-019`<br>`test-020`<br>`test-021`<br>`test-036` |
| `whatsapp.batch_processing` | SYSTEM_PROCESS | PARTIAL | `test-038`<br>`test-023` |
| `event.auto_finish` | SYSTEM_PROCESS | COVERED | `scripts/test-event-lifecycle-critical.mjs` |
| `gate.combo_release` | SYSTEM_PROCESS | PARTIAL | `audit.gate-wrong-event` |
| `event.program_import` | OPERATIONAL_PROCESS | UNCOVERED | — |
| `blackhouse.maintenance` | OPERATIONAL_PROCESS | UNCOVERED | — |
| `codex.automation` | OPERATIONAL_PROCESS | COVERED | `scripts/test-codex-automation-contract.mjs` |
| `platform.edge_request_protection` | SYSTEM_PROCESS | PARTIAL | `audit.rate-limit` |
