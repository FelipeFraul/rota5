> **Current Baseline 2.5.3 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on unchanged repository source `e931d66d03a620d5e26588c8f6c8714c62ef5d1d` (fingerprint `6483294a8c2a4e758fdb965f2f9dc41bef5c539b064b9d727239a3ccd6059954`, 379 files, 83 migrations). Atomicity and admin location consistency remain **RESOLVED**. Findings and health are unchanged: 45 total, 13 RESOLVED, 21 ACTIVE, 6 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers; PRODUCT_HEALTH and INFRASTRUCTURE_HEALTH are **DEGRADED**. Quality remains 257/257 Node, 2/2 PostgreSQL 16 and Quality Gate 34898804387 PASS. Production `dpl_JKrBje3wTYvc1VBCcNKkVb8FV2mf` remains on application source `148b8200a44f4eeb49e004af45060a302bac9f20`; no runtime, database, deployment or functional change occurred.

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

## E2E risk decomposition — Baseline 2.4.2

The aggregate finding remains **ACTIVE/P2**. Component behavior coverage is not equivalent to a true end-to-end trace. No individual flow currently meets the canonical P1 release-blocker threshold based on demonstrated risk and present evidence.

| Flow | Runtime reachable | MVP relevance | Priority | Blocks release | Current coverage | Missing E2E proof |
|---|---|---|---:|---:|---|---|
| `whatsapp.public_discovery` | YES | HIGH | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: initial/reentry, help, search/list formatting, visibility and availability branches execute in the default suite. | No single live WhatsApp-to-database trace proves every terminal and provider failure/retry branch. |
| `ticket.purchase` | YES | CRITICAL | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: reservation/risk audits, signed checkout isolation, payment status reconciliation and idempotency, payment confirmation contract, ticket generation contracts, delivery/distribution/retry behavior and public visibility are covered across current tests and audits. | TRUE_END_TO_END_COVERED = NO. No single non-destructive trace currently joins selection -> real reservation transaction -> provider approval -> real confirm_paid_ticket_order -> ticket generation -> outbound delivery, including cross-boundary failure recovery. |
| `courtesy.public` | CONDITIONAL | MEDIUM | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: visibility/eligibility contracts and zero-value issuance path are covered; related section-limit authorization/mutation tests pass. | No complete eligible reservation -> issuance RPC -> ticket/inventory terminal trace with rollback/failure branches. |
| `combo.delivery_choice` | CONDITIONAL | MEDIUM | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: state/prerequisite handling, OK/1 responses, paid-item release and replay/idempotency branches are tested. | No complete kitchen request -> customer response -> table reservation -> fulfillment trace across live integrations. |
| `admin.whatsapp_event_management` | YES | HIGH | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: authentication/permissions, create/edit/duplicate/status/cancel behavior and multiple workspace contracts are covered. | No full conversational trace proves every multi-entity terminal and cleanup after each intermediate failure. |
| `admin.courtesy_management` | YES_WITH_HIDDEN_WEB_SUBSURFACE | MEDIUM | P2 | NAO | COMPONENT_BEHAVIOR_COVERED: authorization, section-limit mutation, issue/list/resend/cancel contracts and inventory behavior have partial/direct evidence. | No single authorized issue -> ticket -> resend/cancel -> inventory release trace across the real database and delivery integration. |
| `table_map.calibration` | HIDDEN_OR_OPERATOR_CONDITIONAL | LOW | P3 | NAO | COMPONENT_BEHAVIOR_COVERED: 14 default-suite tests cover catalog, persistence validation, editor/API reload, renderer parity, assets and invalid-image behavior. | No browser-level operator session exercises the hidden calibration UI through persistence and final render. |

### ticket.purchase

- COMPONENT_BEHAVIOR_COVERED: **SIM** — reservation/risk evidence, signed checkout isolation, payment status reconciliation and idempotency, confirmation contract, ticket generation contracts, delivery/distribution/retry and visibility are covered across tests and audits.
- TRUE_END_TO_END_COVERED: **NAO** — there is no single non-destructive trace joining selection, real reservation transaction, provider approval, real confirmation RPC, ticket generation and outbound delivery with cross-boundary recovery.
- Priority: **P2**. The missing unified trace is important MVP hardening, but current component evidence and absence of a demonstrated defect do not justify a release-blocking P1.
