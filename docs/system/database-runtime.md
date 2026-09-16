> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 combo metadata contract

Migration `20260915000500_serialize_combo_metadata_transitions.sql` adds six RPCs and replaces `validate_combo_redemption`, for 63 SQL functions total. The completed read-only re-audit found all seven functions applied remotely with row locks/current-state JSONB merge and minimal service-role-only grants. Two legacy issued redemptions retained `raw_metadata={}`; invalid invariants and combo outbox orphans were zero. This reconciliation did not query or mutate Supabase.

## Baseline 2.6.0 paid-delivery database state

The catalog now contains 87 migrations, 57 SQL functions and one dedicated `combo_redemption_code_seq`. Four 20260915 migrations add atomic durable intents, bounded recovery/dead-letter, versioned COMBO QR recovery, collision-safe codes and minimum sequence privilege. Historical redemption codes are unchanged.

# Baseline 2.0.1 HIGH #1 final database runtime

## Historical snapshot — Baseline 2.5.3 database state

Historical Baseline 2.5.3 state: 83 migrations, 45 tables, 44 SQL functions and 36 triggers. `admin_event_operations` was present; the administrative RPCs were `create_admin_event_catalog`, `update_admin_event_catalog` and `update_admin_event_location`, with historical `update_admin_event_venue` absent after migration 004.

EXPAND and CONTRACT are APPLIED_AND_VALIDATED. Remote history ends at `20260913000100_gate_credential_session_revocation_contract` with no pending migration. FINAL_DB is strict-only; `source_kind` is NOT NULL and immutable. OLD_APP is incompatible by design and is not a safe rollback target.

The rollout draft is preserved as historical source. The active migration `supabase/migrations/20260913000100_gate_credential_session_revocation_contract.sql` is APPLIED_AND_VALIDATED; migration history is complete with zero pending migrations.

# Database runtime — Etapa 5

## Migrations e objetos

A ordem lexicográfica das 83 migrations define a reconstrução local. Cada registro inclui objetos criados, alterados e removidos, dependência anterior, impacto e reversão manual. Foram considerados `CREATE OR REPLACE FUNCTION`, recriação de triggers, alterações de tabela e remoções; o resultado final local contém 45 tabelas, 44 funções, 36 triggers e 157 índices.

| Migration | Creates | Alters | Drops | Reversão |
| --- | ---: | ---: | ---: | --- |
| `20260522000100_create_ticketing_schema.sql` | 102 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000200_create_reserve_seats_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000300_create_expire_reservations_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000400_create_confirm_paid_ticket_order_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000500_add_whatsapp_inbound_message_id_unique_idx.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000600_create_gate_sessions.sql` | 7 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000700_create_validate_ticket_entry_rpc.sql` | 2 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000800_create_admin_users_and_sessions.sql` | 10 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260522000900_add_event_image_url.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260524001000_add_event_admin_ownership.sql` | 2 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260524002000_create_courtesies.sql` | 8 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260524002100_fix_courtesy_active_unique.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260524002200_admin_courtesy_limits.sql` | 0 | 1 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260524002300_add_admin_user_passphrase_hash.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260525000100_allow_multiple_ticket_offers_per_section.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260525000200_create_cancel_pending_reservation_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260525000300_create_gate_accesses.sql` | 5 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260525000400_restrict_admin_roles_to_profiles.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000100_create_issue_courtesy_order_rpc.sql` | 1 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000200_require_active_admin_passphrase_hash.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000300_create_admin_auth_attempts.sql` | 4 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000400_create_rate_limit_events.sql` | 4 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000500_create_admin_login_challenges.sql` | 6 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000600_create_buyer_risk_events.sql` | 6 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260526000700_enforce_gate_session_ticket_scope.sql` | 1 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260602000100_create_issue_public_free_ticket_order_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260612000100_restrict_public_table_access.sql` | 0 | 28 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260621000100_create_reserve_ticket_cart_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260624000100_create_division_settlements.sql` | 4 | 1 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260624000200_create_combo_offers.sql` | 23 | 5 | 4 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260625000100_add_combo_offer_image_url.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260625000200_create_combo_redemption_validation.sql` | 5 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260629000100_bind_kitchen_session_to_device.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260629000200_bind_kitchen_reader_session_to_device.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260629000300_require_combo_preparation_before_redemption.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260630000100_restrict_combo_redemption_rpc.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260714000100_create_courtesy_section_limits.sql` | 4 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260717000200_create_fixed_gate_accesses.sql` | 4 | 1 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260718000100_create_public_event_trigram_search.sql` | 7 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260718000200_create_whatsapp_message_batches.sql` | 8 | 2 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260720000100_add_whatsapp_batch_retry_controls.sql` | 4 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260720000200_fix_whatsapp_batch_append_ambiguity.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql` | 2 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260721000100_create_whatsapp_outbound_deliveries.sql` | 6 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260721000200_add_claim_whatsapp_outbound_delivery_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000100_restrict_whatsapp_outbound_deliveries_access.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000200_harden_whatsapp_outbound_delivery_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000300_harden_function_search_paths.sql` | 17 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000400_fully_qualify_hardened_function_references.sql` | 17 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000500_drop_legacy_whatsapp_batch_claim_rpc.sql` | 0 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000600_drop_legacy_whatsapp_batch_finish_rpc.sql` | 0 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000700_create_official_table_map_places.sql` | 1 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260722000800_create_official_table_map_reservations.sql` | 7 | 1 | 2 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000100_enable_rls_courtesy_section_limits.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000200_set_reserve_seats_search_path.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000300_drop_legacy_reserve_seats_overload.sql` | 0 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000400_add_combo_offer_display_priority.sql` | 3 | 4 | 3 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000500_allow_empty_combo_offer_description.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000600_create_list_admin_events_fast_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260723000700_optimize_admin_event_detail_and_dashboard.sql` | 2 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000100_add_ticket_metrics_to_admin_events_fast_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000200_fix_u2_cover_rio_artist_name.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000400_add_ticket_participant_delivery_fields.sql` | 2 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000500_add_combo_offer_original_price.sql` | 0 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260724000600_scope_official_table_map_reservations_by_session.sql` | 3 | 1 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260725000100_reserve_buyer_ticket_in_participant_distribution.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260725000200_fix_assign_participant_contacts_search_path.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260725000300_fix_assign_participant_contacts_nullif.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260725000400_scope_combo_order_offer_uniqueness_by_ticket.sql` | 0 | 0 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260725001000_create_admin_intelligence_dashboard_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260726000100_add_buyer_qr_delivered_at.sql` | 3 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260727000100_recalibrate_official_table_map_places.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260727000200_recalibrate_official_table_map_label_spaces.sql` | 0 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260803000100_create_update_admin_section_capacity_rpc.sql` | 1 | 1 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260805000100_add_event_artist_icon.sql` | 2 | 1 | 1 | MANUAL_ONLY_NO_DOWN_MIGRATION |
| `20260805000200_create_get_database_now_rpc.sql` | 1 | 0 | 0 | MANUAL_ONLY_NO_DOWN_MIGRATION |

## Supabase remoto

| Superfície | Evidência | Resultado |
| --- | --- | --- |
| Tabelas e colunas | REMOTE_SCHEMA / OpenAPI PostgREST | 45; MATCH local |
| Rotas RPC | REMOTE_SCHEMA / OpenAPI | 42 rotas medidas diretamente |
| Funções SQL internas | NOT_VALIDATED | OpenAPI só prova superfície RPC |
| Constraints, índices e triggers | NOT_VALIDATED | Sem conexão SQL read-only disponível |
| RLS, policies e grants | NOT_VALIDATED | Não inferidos do resultado anon |
| Migration history | NOT_VALIDATED | Sem acesso à tabela de histórico |
| Storage | REMOTE_CONFIG | zero buckets |
| Auth | NOT_VALIDATED | configuração não consultável pelas credenciais usadas |

Das 44 funções locais, 39 aparecem como rotas RPC. As cinco restantes são funções de trigger: `enforce_one_active_reservation_per_customer`, `prevent_gate_session_source_change`, `revoke_linked_gate_sessions_on_credential_change`, `set_updated_at` e `sync_official_table_map_reservation_status`. O remoto também expõe `show_limit`, `show_trgm` e `unaccent`, ligados a extensões e ausentes como funções próprias nas migrations. Isso é `PARTIAL_MATCH` da superfície RPC, não prova de drift do schema.

## Modos de acesso

- Service role: cliente servidor em `src/lib/supabase/admin.ts`, usado por APIs e serviços. Espera acesso privilegiado e contorna RLS.
- Anon/public: chave catalogada e usada em ferramentas de auditoria; não foi encontrado browser client funcional no produto.
- REST/RPC: SDK Supabase gera PostgREST e chamadas `.rpc()`.
- Proxy/admin: `src/proxy.ts` e login admin usam URL/service role para autorização de aplicação.
- Scripts: 11 pontos diretos de configuração Supabase identificados; quatro scripts operacionais reais permanecem catalogados nas etapas anteriores.

Nenhuma migration, DDL, escrita de dados, alteração de RLS ou grant foi executada.

## Análise da sequência

Não há timestamps duplicados, `DROP TABLE`, `DROP COLUMN`, `RENAME COLUMN` ou criação/alteração de policies. Foram removidos overloads antigos de quatro RPCs e índices que foram substituídos por novas regras de unicidade. Dezessete triggers usam o padrão explícito drop/recreate. Funções com várias definições preservam somente a última definição na visão resultante. Não foi identificada migration contraditória nem objeto final classificado como abandonado apenas pela sequência DDL.

## Revalidação nominal das RPCs

As 30 correspondências nominais são: append_whatsapp_message_batch, assign_participant_contacts_to_order_tickets, cancel_pending_reservation, claim_due_whatsapp_message_batches, claim_whatsapp_outbound_delivery, confirm_paid_ticket_order, consume_rate_limit, expire_reservations, finish_whatsapp_message_batch, get_admin_event_editor_payload, get_admin_general_dashboard_summary, get_admin_intelligence_dashboard, get_database_now, issue_admin_courtesy_order, issue_courtesy_order, issue_public_free_ticket_order, list_admin_events_fast, lock_and_validate_courtesy_limits, lock_customer_active_reservation_slot, lock_validate_and_record_reservation_buyer_risk, mark_buyer_ticket_qr_delivered, normalize_event_search_text, reschedule_whatsapp_message_batch, reserve_official_table_map_place, reserve_seats, reserve_ticket_cart, search_public_events_ranked, update_admin_section_capacity, validate_combo_redemption e validate_ticket_entry. A correspondência é somente nominal e de superfície OpenAPI. Ela não comprova assinatura, corpo SQL ou comportamento remoto equivalente; FUNCOES_SQL_REMOTE permanece NOT_VALIDATED.
