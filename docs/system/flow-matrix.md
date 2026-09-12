# Flow Matrix — Etapa 4

| Flow | Tipo | Ator | Trigger | Capabilities | Status | Test status | Resultado/terminais |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `whatsapp.public_discovery` | USER_JOURNEY | customer | USER_ACTION | `brand.present_individual_offers`<br>`messaging.start`<br>`messaging.help`<br>`messaging.close`<br>`catalog.search`<br>`catalog.list`<br>`catalog.details`<br>`catalog.offers`<br>`catalog.seat_map` | PARCIAL | FAILING | RESULT_SHOWN, CONVERSATION_CLOSED, FAILURE |
| `ticket.purchase` | USER_JOURNEY | customer | USER_ACTION | `customer.identify`<br>`customer.limit_reservations`<br>`catalog.enforce_visibility`<br>`catalog.offers`<br>`reservation.cart`<br>`reservation.create`<br>`reservation.resume`<br>`reservation.cancel`<br>`table_map.reserve`<br>`payment.checkout_create` | PARCIAL | PARTIAL | SUCCESS, FAILURE |
| `ticket.checkout` | USER_JOURNEY | customer | USER_ACTION | `customer.limit_checkout`<br>`payment.checkout_view`<br>`payment.pay_pix`<br>`payment.status`<br>`payment.return_notice`<br>`analytics.track_click` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `ticket.delivery` | USER_JOURNEY | customer | USER_ACTION | `messaging.protect_delivery`<br>`ticket.deliver`<br>`ticket.delivery_choice`<br>`ticket.assign_participants`<br>`ticket.claim_participant`<br>`ticket.resend` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `ticket.view` | USER_JOURNEY | customer | HTTP_REQUEST | `ticket.view`<br>`catalog.enforce_visibility` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `courtesy.public` | USER_JOURNEY | customer | USER_ACTION | `courtesy.public_issue` | PARCIAL | PARTIAL | SUCCESS, FAILURE |
| `combo.purchase` | USER_JOURNEY | customer | USER_ACTION | `combo.checkout_view`<br>`combo.pay_pix`<br>`combo.status`<br>`analytics.track_click` | CONFIRMADO | PARTIAL | WAITING_EXTERNAL, SUCCESS, FAILURE, EXPIRED |
| `combo.delivery_choice` | USER_JOURNEY | customer | USER_ACTION | `combo.delivery_choose`<br>`table_map.reserve` | PARCIAL | PARTIAL | CHOICE_RECORDED, WAITING_USER, FAILURE |
| `admin.whatsapp_session` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `messaging.navigate_admin`<br>`admin.login`<br>`admin.logout` | CONFIRMADO | FAILING | AUTHENTICATED, LOCKED, LOGGED_OUT, FAILURE |
| `admin.web_session` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.login`<br>`admin.web_session`<br>`admin.lockout` | CONFIRMADO | PARTIAL | AUTHENTICATED, LOCKED, FAILURE |
| `admin.web_event_workspace` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`event.list`<br>`event.inspect`<br>`event.create`<br>`event.edit`<br>`event.publish`<br>`event.change_status`<br>`event.cancel`<br>`event.duplicate`<br>`combo.list`<br>`analytics.general_dashboard`<br>`analytics.event_dashboard`<br>`analytics.contacts` | PARCIAL | FAILING | API_SUCCESS, FAILURE |
| `admin.whatsapp_event_management` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`event.list`<br>`event.inspect`<br>`event.create`<br>`event.edit`<br>`event.publish`<br>`event.change_status`<br>`event.duplicate`<br>`event.session_create`<br>`event.session_edit`<br>`event.section_create`<br>`event.section_edit`<br>`event.capacity_set`<br>`event.seats_create`<br>`event.seats_block`<br>`event.price_create`<br>`event.price_edit` | PARCIAL | FAILING | SUCCESS, FAILURE |
| `admin.combo_management` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`combo.list`<br>`combo.create`<br>`combo.edit`<br>`combo.scope`<br>`combo.schedule`<br>`combo.activate`<br>`combo.duplicate`<br>`combo.delete` | CONFIRMADO | FAILING | SUCCESS, FAILURE |
| `admin.courtesy_management` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`courtesy.issue`<br>`courtesy.list`<br>`courtesy.resend`<br>`courtesy.cancel`<br>`courtesy.section_limit` | PARCIAL | PARTIAL | SUCCESS, FAILURE |
| `admin.user_management` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`admin.users_list`<br>`admin.user_create`<br>`admin.role_change`<br>`admin.user_disable`<br>`admin.user_reactivate`<br>`admin.password_renew`<br>`admin.unlock` | CONFIRMADO | PARTIAL | SUCCESS, FORBIDDEN, FAILURE |
| `admin.reporting` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`ticket.admin_lookup`<br>`analytics.sales`<br>`analytics.division`<br>`analytics.settle`<br>`analytics.general_report`<br>`analytics.section_sales`<br>`analytics.pending_orders`<br>`analytics.expired_reservations`<br>`analytics.gate_checkins`<br>`analytics.ticket_usage`<br>`analytics.courtesies` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `admin.operational_dashboard` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.web_session`<br>`admin.authorize`<br>`analytics.operational` | CONFIRMADO | PARTIAL | SUCCESS, UNAUTHORIZED, FAILURE |
| `gate.access_management` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`gate.access_create`<br>`gate.access_list`<br>`gate.access_pause`<br>`gate.fixed_create`<br>`gate.fixed_list`<br>`gate.fixed_revoke` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `gate.ticket_admission` | ADMIN_JOURNEY | gate_operator | ADMIN_ACTION | `gate.open`<br>`gate.consult`<br>`gate.admit` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `kitchen.session_prepare` | ADMIN_JOURNEY | kitchen_operator | ADMIN_ACTION | `combo.kitchen_open`<br>`combo.prepare` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `kitchen.combo_redemption` | ADMIN_JOURNEY | kitchen_operator | ADMIN_ACTION | `combo.delivery_prompt`<br>`combo.redeem` | QUEBRADO | PARTIAL | WAITING_USER, DENIED, FAILURE |
| `table_map.calibration` | ADMIN_JOURNEY | admin | ADMIN_ACTION | `admin.authorize`<br>`table_map.preview`<br>`table_map.calibrate` | PARCIAL | PARTIAL | SUCCESS, FAILURE |
| `whatsapp.inbound_dispatch` | SYSTEM_PROCESS | Z-API | WEBHOOK | `platform.limit_requests`<br>`messaging.receive`<br>`customer.identify`<br>`messaging.respond`<br>`admin.authorize` | CONFIRMADO | FAILING | SUCCESS, FAILURE |
| `ticket.payment_confirmation` | SYSTEM_PROCESS | Mercado Pago | WEBHOOK | `platform.limit_requests`<br>`payment.confirm`<br>`ticket.deliver`<br>`ticket.delivery_choice`<br>`messaging.protect_delivery`<br>`table_map.sync_status` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `combo.payment_confirmation` | SYSTEM_PROCESS | Mercado Pago | WEBHOOK | `platform.limit_requests`<br>`combo.confirm`<br>`combo.deliver_qr`<br>`messaging.protect_delivery` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `reservation.expiration` | SYSTEM_PROCESS | cron | CRON | `reservation.expire`<br>`table_map.sync_status`<br>`background.notify_expiry`<br>`background.remind_interest`<br>`background.expire_admin` | CONFIRMADO | PARTIAL | SUCCESS, FAILURE |
| `combo.offer_distribution` | SYSTEM_PROCESS | cron | CRON | `combo.offer_send`<br>`combo.checkout_create`<br>`combo.expire` | CONFIRMADO | FAILING | SUCCESS, FAILURE |
| `whatsapp.batch_processing` | SYSTEM_PROCESS | cron | CRON | `background.cancel_batches`<br>`background.close_inactive` | CONFIRMADO | FAILING | SUCCESS, FAILURE |
| `event.auto_finish` | SYSTEM_PROCESS | internal scheduler check | INTERNAL_EVENT | `event.auto_finish` | CONFIRMADO | UNCOVERED | FINISHED, NO_CHANGE, FAILURE |
| `gate.combo_release` | SYSTEM_PROCESS | database-backed gate scan | INTERNAL_EVENT | `gate.admit`<br>`combo.kitchen_release` | CONFIRMADO | PARTIAL | RELEASED, NOT_APPLICABLE, FAILURE |
| `event.program_import` | OPERATIONAL_PROCESS | operational_script | SCRIPT | `event.import_program` | CONFIRMADO | UNCOVERED | SUCCESS, FAILURE |
| `blackhouse.maintenance` | OPERATIONAL_PROCESS | operational_script | SCRIPT | `event.legacy_rename`<br>`event.legacy_split`<br>`event.legacy_update` | CONFIRMADO | UNCOVERED | APPLIED, NO_CHANGE, FAILURE |
| `codex.automation` | OPERATIONAL_PROCESS | admin_and_local_operator | ADMIN_ACTION | `automation.request`<br>`automation.issue`<br>`automation.list`<br>`automation.execute`<br>`automation.notify` | CONFIRMADO | UNCOVERED | SUCCESS, FAILURE |
| `platform.edge_request_protection` | SYSTEM_PROCESS | edge_runtime | HTTP_REQUEST | `platform.limit_requests` | CONFIRMADO | PARTIAL | CONTINUE, RATE_LIMITED |

## Cobertura bottom-up

| Métrica | Valor |
| --- | ---: |
| Capabilities em flows | 136 |
| Capabilities standalone | 4 |
| Capabilities sem classificação | 0 |
| Entradas funcionais sem flow/justificativa | 0 |

Standalone: `ticket.validation_history` — Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.; `gate.session_revoke` — Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.; `courtesy.event_limit` — Implementação catalogada sem trigger/caller confirmado; não forma flow ativo.; `gate.sessions_list` — Implementação catalogada sem trigger/caller confirmado; não forma flow ativo..
