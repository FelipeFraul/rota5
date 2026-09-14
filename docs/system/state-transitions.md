# State Transitions — Etapa 4

Foram catalogadas **68 transições** suportadas pelo código/migrations. Campo de origem ausente significa inserção de linha; o catálogo não inventa estado anterior não armazenado. Valores separados por `|` representam alternativas explicitamente aceitas.

| ID | Entidade | De | Para | Capability | Flow | Trigger | Implementação/status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `state.001` | `conversation` | inserção | open | `messaging.receive` | `whatsapp.inbound_dispatch` | WEBHOOK | create open conversation for inbound contact; OBSERVED |
| `state.002` | `event_session` | sales_open\|sales_closed | scheduled | `event.session_edit` | `admin.whatsapp_event_management` | ADMIN_ACTION | return session to scheduled; OBSERVED |
| `state.003` | `conversation` | open | closed | `background.close_inactive` | `whatsapp.batch_processing` | CRON | finalize inactive conversation; OBSERVED |
| `state.004` | `event` | inserção | draft | `event.create` | `admin.whatsapp_event_management` | ADMIN_ACTION | create event; OBSERVED |
| `state.005` | `event` | draft | published | `event.publish` | `admin.whatsapp_event_management` | ADMIN_ACTION | publish event; OBSERVED |
| `state.006` | `event` | draft\|published | cancelled | `event.cancel` | `admin.web_event_workspace` | ADMIN_ACTION | cancel event; OBSERVED |
| `state.007` | `event` | published | finished | `event.auto_finish` | `event.auto_finish` | INTERNAL_EVENT | finish elapsed event; OBSERVED |
| `state.008` | `event_session` | inserção | scheduled | `event.session_create` | `admin.whatsapp_event_management` | ADMIN_ACTION | create session; OBSERVED |
| `state.009` | `event_session` | scheduled\|sales_closed | sales_open | `event.session_edit` | `admin.whatsapp_event_management` | ADMIN_ACTION | open session sales; OBSERVED |
| `state.010` | `event_session` | scheduled\|sales_open | sales_closed | `event.session_edit` | `admin.whatsapp_event_management` | ADMIN_ACTION | close session sales; OBSERVED |
| `state.011` | `session_seat` | available | reserved | `reservation.create` | `ticket.purchase` | USER_ACTION | reserve inventory; OBSERVED |
| `state.012` | `session_seat` | reserved | sold | `payment.confirm` | `ticket.payment_confirmation` | WEBHOOK | confirm paid ticket; OBSERVED |
| `state.013` | `session_seat` | reserved | available | `reservation.cancel` | `ticket.purchase` | USER_ACTION | release cancelled hold; OBSERVED |
| `state.014` | `session_seat` | reserved | available | `reservation.expire` | `reservation.expiration` | CRON | release expired hold; OBSERVED |
| `state.015` | `seat` | active | blocked | `event.seats_block` | `admin.whatsapp_event_management` | ADMIN_ACTION | block seat; OBSERVED |
| `state.016` | `ticket_price` | active | inactive | `event.price_edit` | `admin.whatsapp_event_management` | ADMIN_ACTION | disable price; OBSERVED |
| `state.017` | `reservation` | inserção | active | `reservation.create` | `ticket.purchase` | USER_ACTION | create hold; OBSERVED |
| `state.018` | `reservation` | active | paid | `payment.confirm` | `ticket.payment_confirmation` | WEBHOOK | confirm order; OBSERVED |
| `state.019` | `reservation` | active | cancelled | `reservation.cancel` | `ticket.purchase` | USER_ACTION | cancel hold; OBSERVED |
| `state.020` | `reservation` | active | expired | `reservation.expire` | `reservation.expiration` | CRON | expire hold; OBSERVED |
| `state.021` | `order` | inserção | pending_payment | `payment.checkout_create` | `ticket.purchase` | USER_ACTION | create order; OBSERVED |
| `state.022` | `order` | pending_payment | paid | `payment.confirm` | `ticket.payment_confirmation` | WEBHOOK | confirm payment; OBSERVED |
| `state.023` | `order` | draft\|pending_payment | cancelled | `reservation.cancel` | `ticket.purchase` | USER_ACTION | cancel pending order; OBSERVED |
| `state.024` | `order` | pending_payment | expired | `reservation.expire` | `reservation.expiration` | CRON | expire pending order; OBSERVED |
| `state.025` | `payment` | inserção | pending | `payment.pay_pix` | `ticket.checkout` | HTTP_REQUEST | create Pix; OBSERVED |
| `state.026` | `payment` | pending | approved | `payment.confirm` | `ticket.payment_confirmation` | WEBHOOK | approve provider payment; OBSERVED |
| `state.027` | `payment` | pending | rejected | `payment.pay_pix` | `ticket.checkout` | HTTP_REQUEST | persist provider rejection during Pix creation; OBSERVED |
| `state.028` | `event_session` | scheduled\|sales_open\|sales_closed | cancelled | `event.session_edit` | `admin.whatsapp_event_management` | ADMIN_ACTION | cancel session without deleting sales data; OBSERVED |
| `state.029` | `ticket` | inserção | issued | `payment.confirm` | `ticket.payment_confirmation` | WEBHOOK | issue paid ticket; OBSERVED |
| `state.030` | `ticket` | issued | used | `gate.admit` | `gate.ticket_admission` | ADMIN_ACTION | consume admission; OBSERVED |
| `state.031` | `ticket` | issued | cancelled | `courtesy.cancel` | `admin.courtesy_management` | ADMIN_ACTION | cancel courtesy ticket; OBSERVED |
| `state.032` | `ticket.participant_delivery` | inserção | awaiting_participant_request | `ticket.assign_participants` | `ticket.delivery` | USER_ACTION | reserve for participant; OBSERVED |
| `state.033` | `ticket.participant_delivery` | awaiting_participant_request | delivered | `ticket.claim_participant` | `ticket.delivery` | USER_ACTION | claim participant ticket; OBSERVED |
| `state.034` | `whatsapp_outbound_delivery` | inserção | pending | `messaging.protect_delivery` | `ticket.delivery` | INTERNAL_EVENT | create idempotent delivery record; OBSERVED |
| `state.035` | `whatsapp_outbound_delivery` | pending | sending | `messaging.protect_delivery` | `ticket.delivery` | INTERNAL_EVENT | claim delivery before provider call; OBSERVED |
| `state.036` | `whatsapp_outbound_delivery` | sending | sent | `ticket.deliver` | `ticket.delivery` | INTERNAL_EVENT | mark delivery sent; OBSERVED |
| `state.037` | `gate_access` | inserção | active | `gate.access_create` | `gate.access_management` | ADMIN_ACTION | create credential; OBSERVED |
| `state.038` | `gate_access` | active | paused | `gate.access_pause` | `gate.access_management` | ADMIN_ACTION | pause credential; OBSERVED |
| `state.039` | `fixed_gate_access` | inserção | active | `gate.fixed_create` | `gate.access_management` | ADMIN_ACTION | create fixed credential; OBSERVED |
| `state.040` | `fixed_gate_access` | active | revoked | `gate.fixed_revoke` | `gate.access_management` | ADMIN_ACTION | revoke fixed credential; OBSERVED |
| `state.041` | `gate_session` | inserção | active | `gate.open` | `gate.ticket_admission` | ADMIN_ACTION | open reader session; OBSERVED |
| `state.042` | `combo_offer` | inserção | active | `combo.create` | `admin.combo_management` | ADMIN_ACTION | create WhatsApp offer with database default active; OBSERVED |
| `state.043` | `combo_offer` | paused | active | `combo.activate` | `admin.combo_management` | ADMIN_ACTION | activate offer; OBSERVED |
| `state.044` | `combo_offer` | active | paused | `combo.activate` | `admin.combo_management` | ADMIN_ACTION | pause offer; OBSERVED |
| `state.045` | `combo_offer` | active\|paused | deleted | `combo.delete` | `admin.combo_management` | ADMIN_ACTION | logical delete; OBSERVED |
| `state.046` | `combo_order` | inserção | pending_payment | `combo.checkout_create` | `combo.offer_distribution` | CRON | create offered checkout; OBSERVED |
| `state.047` | `combo_order` | pending_payment | paid | `combo.confirm` | `combo.payment_confirmation` | WEBHOOK | confirm combo; OBSERVED |
| `state.048` | `combo_order` | pending_payment | expired | `combo.expire` | `combo.offer_distribution` | CRON | expire checkout; OBSERVED |
| `state.049` | `combo_payment` | inserção | pending | `combo.pay_pix` | `combo.purchase` | HTTP_REQUEST | create Pix; OBSERVED |
| `state.050` | `combo_payment` | pending | approved | `combo.confirm` | `combo.payment_confirmation` | WEBHOOK | approve combo payment; OBSERVED |
| `state.051` | `combo_redemption` | inserção | issued | `combo.confirm` | `combo.payment_confirmation` | WEBHOOK | issue redemption QR; OBSERVED |
| `state.052` | `combo_redemption` | issued | used | `combo.redeem` | `kitchen.combo_redemption` | ADMIN_ACTION | consume via validate_combo_redemption after confirmed delivery choice and completed preparation; OBSERVED |
| `state.053` | `combo_offer` | inserção | paused | `combo.create` | `admin.combo_management` | ADMIN_ACTION | create web offer initially paused; OBSERVED |
| `state.054` | `whatsapp_message_batch` | collecting | processing | `background.cancel_batches` | `whatsapp.batch_processing` | CRON | claim due batch; OBSERVED |
| `state.055` | `whatsapp_message_batch` | processing | failed | `background.cancel_batches` | `whatsapp.batch_processing` | CRON | fail batch after retry limit; OBSERVED |
| `state.056` | `whatsapp_message_batch` | processing | cancelled | `background.cancel_batches` | `whatsapp.batch_processing` | CRON | cancel while reply pipeline is disabled; OBSERVED |
| `state.057` | `whatsapp_message_batch` | processing | collecting | `background.cancel_batches` | `whatsapp.batch_processing` | CRON | reschedule retry; OBSERVED |
| `state.058` | `official_table_map_reservation` | inserção | active | `table_map.reserve` | `ticket.purchase` | USER_ACTION | reserve place; OBSERVED |
| `state.059` | `official_table_map_reservation` | active | paid | `table_map.sync_status` | `ticket.payment_confirmation` | DATABASE_TRIGGER | sync paid reservation; OBSERVED |
| `state.060` | `official_table_map_reservation` | active | cancelled\|expired | `table_map.sync_status` | `reservation.expiration` | DATABASE_TRIGGER | sync terminal reservation; OBSERVED |
| `state.061` | `whatsapp_outbound_delivery` | sending | failed | `ticket.deliver` | `ticket.delivery` | INTERNAL_EVENT | mark delivery failed after claimed send; OBSERVED |
| `state.062` | `event_session` | scheduled\|sales_open\|sales_closed | finished | `event.auto_finish` | `event.auto_finish` | INTERNAL_EVENT | finish sessions of past event; OBSERVED |
| `state.063` | `admin_session` | inserção | active | `admin.web_session` | `admin.web_session` | ADMIN_ACTION | create authenticated web session; OBSERVED |
| `state.064` | `admin_session` | active | expired | `background.expire_admin` | `reservation.expiration` | CRON | expire and notify admin session; OBSERVED |
| `state.065` | `courtesy` | inserção | issued | `courtesy.issue` | `admin.courtesy_management` | ADMIN_ACTION | issue courtesy; OBSERVED |
| `state.066` | `courtesy` | issued | cancelled | `courtesy.cancel` | `admin.courtesy_management` | ADMIN_ACTION | cancel courtesy; OBSERVED |

## Lifecycles observados

- conversation: inserção em open pelo webhook e fechamento pelo finalizador de inatividade.
- event: draft → published/cancelled → finished; event_session aceita scheduled, sales_open, sales_closed e pode terminar em cancelled ou finished.
- seat/session_seat: assento-base active → blocked; inventário da sessão available → reserved → sold, com liberação para available.
- reservation/order/payment/ticket: active/pending → paid/approved/issued, ou cancelled/expired/rejected; ticket issued → used na portaria. A expiração de reserva não altera diretamente payments.
- ticket.participant_delivery: awaiting_participant_request → delivered.
- admin_session: active → expired pelo cron; gate_access, fixed_gate_access e gate_session mantêm lifecycles distintos.
- combo_offer/order/payment/redemption: criação active pelo WhatsApp ou paused pela API web; active/paused → deleted; pending_payment → paid/expired; pending → approved; issued → used. A última transição está bloqueada no leitor atual.
- whatsapp_outbound_delivery: pending → sending → sent/failed.
- whatsapp_message_batch: collecting → processing → cancelled, com retry para collecting ou falha terminal ao atingir o limite. O caminho processed existe na abstração, mas não é alcançado pelo cron atual e não foi contado.

## Gate de integridade

Quatro registros sem caminho executável no runtime atual foram substituídos por ramos observados dos mesmos lifecycles. Entidades, capabilities, verbos e evidências inexatas também foram reconciliados com o código-fonte. O total reproduzível permanece em **66**.
# Baseline 2.0.1 HIGH #1 transitions

The canonical catalog contains 68 transitions. `state.067` and `state.068` are OBSERVED on FINAL_DB: temporary pause and fixed revoke invalidated linked sessions, and subsequent use was rejected. Gates A-I and CONTRACT passed.
