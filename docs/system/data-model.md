# Baseline 2.0.1 HIGH #1 final data model

FINAL_DB requires `gate_sessions.source_kind`, permits `legacy_unattributed`, `admin_direct`, `temporary_gate_access` and `fixed_gate_access`, enforces matching source links, and rejects source mutation. Historical source-null count changed from 1 to 0 through preserved `legacy_unattributed` classification.

# Data model AS-IS — Etapa 5

Referência: commit `a141c6004421fb8442f95493de3ca4ec4d4c997b`. O schema local resultante foi reconstruído em ordem sobre 77 migrations; não é uma cópia de um único arquivo histórico. O PostgREST remoto confirmou as 44 tabelas e os nomes de suas colunas. Constraints, índices, triggers, RLS, policies e grants remotos não são expostos por essa superfície e permanecem `NOT_VALIDATED`.

## Resultado

- 44 tabelas locais e 44 remotas: **MATCH** para nomes de tabelas e colunas.
- 44 tabelas com RLS habilitado localmente; zero `CREATE POLICY` encontrado.
- 39 funções SQL, 36 triggers e 155 índices reconstruídos localmente.
- O runtime principal usa service role, portanto a autorização das APIs é aplicada antes do acesso e esse cliente contorna RLS.
- Acesso anon por HEAD: 7 tabelas aceitaram a consulta e 37 negaram/indisponibilizaram. Aceite não prova leitura de linhas.

## Tabelas

| Tabela | Domain | Colunas | PKs | FKs | Índices | RLS local | Local × remoto |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `admin_auth_attempts` | domain.admin-identity-access | 12 | 1 | 1 | 2 | ON | MATCH |
| `admin_login_challenges` | domain.admin-identity-access | 15 | 1 | 1 | 4 | ON | MATCH |
| `admin_sessions` | domain.admin-identity-access | 8 | 1 | 1 | 4 | ON | MATCH |
| `admin_users` | domain.admin-identity-access | 12 | 1 | 0 | 3 | ON | MATCH |
| `buyer_risk_events` | domain.customer-risk | 14 | 1 | 5 | 5 | ON | MATCH |
| `combo_offer_event_locks` | domain.combo-commerce-fulfillment | 6 | 1 | 2 | 0 | ON | MATCH |
| `combo_offer_scopes` | domain.combo-commerce-fulfillment | 7 | 1 | 2 | 5 | ON | MATCH |
| `combo_offers` | domain.combo-commerce-fulfillment | 18 | 1 | 2 | 3 | ON | MATCH |
| `combo_orders` | domain.combo-commerce-fulfillment | 20 | 1 | 5 | 6 | ON | MATCH |
| `combo_payments` | domain.combo-commerce-fulfillment | 12 | 1 | 1 | 3 | ON | MATCH |
| `combo_redemption_events` | domain.combo-commerce-fulfillment | 12 | 1 | 3 | 3 | ON | MATCH |
| `combo_redemptions` | domain.combo-commerce-fulfillment | 16 | 1 | 4 | 3 | ON | MATCH |
| `conversations` | domain.whatsapp-conversations | 7 | 1 | 1 | 3 | ON | MATCH |
| `courtesies` | domain.courtesy | 17 | 1 | 6 | 4 | ON | MATCH |
| `courtesy_limits` | domain.courtesy | 4 | 1 | 1 | 0 | ON | MATCH |
| `courtesy_section_limits` | domain.courtesy | 7 | 1 | 2 | 2 | ON | MATCH |
| `customers` | domain.customer-risk | 7 | 1 | 0 | 0 | ON | MATCH |
| `division_settlements` | domain.analytics-reporting | 16 | 1 | 1 | 2 | ON | MATCH |
| `event_aliases` | domain.event-catalog | 4 | 1 | 1 | 2 | ON | MATCH |
| `event_sessions` | domain.event-catalog | 9 | 1 | 2 | 4 | ON | MATCH |
| `events` | domain.event-catalog | 15 | 1 | 1 | 11 | ON | MATCH |
| `fixed_gate_accesses` | domain.gate-admission | 10 | 1 | 2 | 3 | ON | MATCH |
| `gate_accesses` | domain.gate-admission | 13 | 1 | 4 | 4 | ON | MATCH |
| `gate_sessions` | domain.gate-admission | 14 | 1 | 2 | 5 | ON | MATCH |
| `official_table_map_places` | domain.table-map | 4 | 1 | 0 | 0 | ON | MATCH |
| `official_table_map_reservations` | domain.table-map | 11 | 1 | 4 | 5 | ON | MATCH |
| `orders` | domain.orders-payments | 10 | 1 | 2 | 3 | ON | MATCH |
| `payment_events` | domain.orders-payments | 8 | 1 | 0 | 3 | ON | MATCH |
| `payments` | domain.orders-payments | 13 | 1 | 1 | 6 | ON | MATCH |
| `rate_limit_events` | domain.platform-runtime | 8 | 1 | 0 | 1 | ON | MATCH |
| `reservation_items` | domain.reservation-inventory | 12 | 1 | 5 | 4 | ON | MATCH |
| `reservations` | domain.reservation-inventory | 11 | 1 | 3 | 5 | ON | MATCH |
| `seat_map_renders` | domain.table-map | 9 | 1 | 2 | 3 | ON | MATCH |
| `seats` | domain.event-catalog | 11 | 1 | 2 | 4 | ON | MATCH |
| `session_seats` | domain.reservation-inventory | 10 | 1 | 3 | 5 | ON | MATCH |
| `ticket_prices` | domain.event-catalog | 13 | 1 | 2 | 4 | ON | MATCH |
| `ticket_validation_events` | domain.ticketing-delivery | 9 | 1 | 1 | 5 | ON | MATCH |
| `tickets` | domain.ticketing-delivery | 20 | 1 | 6 | 7 | ON | MATCH |
| `venue_sections` | domain.event-catalog | 11 | 1 | 1 | 2 | ON | MATCH |
| `venues` | domain.event-catalog | 9 | 1 | 0 | 3 | ON | MATCH |
| `whatsapp_message_batch_messages` | domain.whatsapp-conversations | 4 | 1 | 2 | 1 | ON | MATCH |
| `whatsapp_message_batches` | domain.whatsapp-conversations | 17 | 1 | 1 | 3 | ON | MATCH |
| `whatsapp_messages` | domain.whatsapp-conversations | 9 | 1 | 2 | 5 | ON | MATCH |
| `whatsapp_outbound_deliveries` | domain.whatsapp-conversations | 16 | 1 | 2 | 5 | ON | MATCH |

Os detalhes completos de colunas, defaults, constraints, consumidores, functions, triggers, state transitions e evidências estão em `system-knowledge/data-model.json`. Relações tipadas estão em `database-relations.json`; quando a operação não pôde ser inferida com segurança, a relação preserva apenas o vínculo estrutural.

## Lifecycle

As 68 transições canônicas de `state-transitions.json` foram cruzadas com tabelas e colunas de status. Referências foram resolvidas sem inconsistência de entidade/coluna encontrada. Nenhum lifecycle novo foi inferido para tabelas sem estado explícito. Estados permitidos continuam definidos por checks, lógica SQL e serviços; estados observados no código não foram promovidos a runtime remoto sem evidência.

## Limites

Tipos remotos vieram do OpenAPI e foram mantidos ao lado do tipo SQL local. Acesso anon observado mede aceitação da consulta, não conteúdo retornado. A descrição de propósito deriva do domínio e dos consumidores; não altera o modelo.

### Resumo estruturado do lifecycle

O catálogo machine-readable registra, para cada tabela com transição canônica, coluna e tipo de status, checks relacionados, estados, capabilities criadoras/mutadoras/finalizadoras e as transições observadas. Transições impossíveis ou nunca usadas ficaram `NOT_VALIDATED`, pois não podem ser concluídas apenas pelo grafo local.

## Correção do gate da Etapa 5

A primeira contagem informou 17 tabelas stateful porque usou singularização simples e não resolveu aliases como gate_access, whatsapp_outbound_delivery, whatsapp_message_batch e courtesy. O gate substituiu essa regra por um mapa explícito e tratou ticket.participant_delivery como um segundo lifecycle da tabela tickets, na coluna participant_delivery_status. O resultado correto é 22 tabelas, 23 entidades e 68 transições, sem transição sem tabela, coluna ou estado local correspondente.
