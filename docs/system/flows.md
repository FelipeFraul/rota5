> **Current Baseline 2.7.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.1 flow reconciliation

The affected flows are `gate.combo_release`, `kitchen.session_prepare`, `kitchen.combo_redemption` and `combo.delivery_choice`. Database state transitions are serialized; external direct notifications can still race before consolidation and are tracked independently.

# Baseline 2.1.0 scoped active-brand flow projection

The finding is RESOLVED for the documented active surfaces. `ticket.purchase` and `whatsapp.public_discovery` retain PARCIAL status because their independent flow evidence did not change.

# Baseline 2.0.1 HIGH #1 flow runtime state

`gate.access_management`, `gate.ticket_admission` and `kitchen.combo_redemption` retain their conservative catalog statuses, while the HIGH #1 authorization behavior is validated on FINAL_DB. Gates A-I and strict ticket/combo runtime passed.

# Flow Catalog — Etapa 4

**Baseline AS-IS:** 11/09/2026. **Flows:** 34. **Passos:** 169. **Transições de estado:** 66.

Este catálogo reconstrói cadeias comprováveis do código local. CONFIRMADO significa que os elos estruturais existem; não afirma execução em produção ou validação de serviços externos. Status funcional e cobertura de testes são independentes. Branches do mesmo objetivo permanecem no flow principal.

## Método e validação

A descoberta foi executada entrypoint-first sobre 56 entradas, capability-first sobre 140 capabilities e depois por lifecycles, módulos, testes, SQL, routes, serviços, webhooks, cron e scripts. Uma segunda passagem bottom-up tentou encontrar entrypoints funcionais, capabilities e módulos sem representação. Resultado: 0 entrypoints funcionais sem flow/justificativa, 136 capabilities em flows, 4 standalone e 0 sem classificação. Nenhuma capability tardia foi adicionada.

## Índice por tipo

| Tipo | Quantidade |
| --- | ---: |
| USER_JOURNEY | 8 |
| ADMIN_JOURNEY | 14 |
| SYSTEM_PROCESS | 9 |
| OPERATIONAL_PROCESS | 3 |

## `whatsapp.public_discovery` — Descoberta pública por WhatsApp

- **Tipo/status:** USER_JOURNEY / PARCIAL
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Iniciar ou navegar uma conversa até consultar evento, oferta ou mapa.
- **Capabilities:** `brand.present_individual_offers`, `messaging.start`, `messaging.help`, `messaging.close`, `catalog.search`, `catalog.list`, `catalog.details`, `catalog.offers`, `catalog.seat_map`
- **Terminais:** `RESULT_SHOWN`, `CONVERSATION_CLOSED`, `FAILURE`
- **Teste:** FAILING; `test-033`, `audit.whatsapp-intent-100`, `audit.whatsapp-intent-gate`, `test-032`, `audit.buy-flow`, `audit.whatsapp-santana-search`, `test-029`, `test-030`, `test-035`, `audit.seatmap-qr-image`
- **Dados:** `ticket_prices`, `venue_sections`, `conversations`, `events`, `event_sessions`, `event_aliases`, `venues`, `session_seats`, `seats`; funções `search_public_events_ranked`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Exibir apenas a oferta selecionada por preço e ocultar tipos free e setores mesa/bistrô. (`brand.present_individual_offers`)
2. Primeiro contato e comandos de reentrada produzem abertura e estado inicial. (`messaging.start`)
3. AJUDA recebe termos, pagina resultados, responde tópico e permite voltar ao contexto anterior. (`messaging.help`)
4. SAIR encerra o contexto público; reentrada reinicia o atendimento. (`messaging.close`)
5. Retornar sessões relevantes usando busca ranqueada com fallback de consultas. (`catalog.search`)
6. TODOS lista eventos elegíveis com informações, fotos e opções distribuídas em mensagens. (`catalog.list`)
7. Mais informações preserva evento escolhido e oferece compra apenas se disponível. (`catalog.details`)
8. Apresentar ofertas por sessão com preço, taxa, janela de vendas e capacidade. (`catalog.offers`)
9. Renderizar assentos disponíveis/ocupados durante escolha e emissão de cortesia. (`catalog.seat_map`)

**Branches e erros**

- Comando inicial abre/reusa conversa e mostra opções.
- Busca, listagem, detalhe, ajuda, nova pesquisa e encerramento seguem ramos do router.
- Entrada inválida volta a ajuda/opções.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

**Notas:** Ajuda está PARCIAL e possui teste falhando; comandos são validados no router, não por documentação histórica.

## `ticket.purchase` — Reserva de ingresso pela conversa

- **Tipo/status:** USER_JOURNEY / PARCIAL
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Converter seleção pública em reserva, pedido e checkout.
- **Capabilities:** `customer.identify`, `customer.limit_reservations`, `catalog.enforce_visibility`, `catalog.offers`, `reservation.cart`, `reservation.create`, `reservation.resume`, `reservation.cancel`, `table_map.reserve`, `payment.checkout_create`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.buyer-anti-abuse`, `test-031`, `test-030`, `audit.buy-flow`, `test-034`, `audit.seatmap-qr-image`, `audit.admin-orders-tickets`, `audit.cancel-pending-reservation-rpc`, `audit.reservation-expiration-cancel`, `test-026`, `audit.mercado-pago-security`
- **Dados:** `customers`, `buyer_risk_events`, `event_sessions`, `events`, `venue_sections`, `session_seats`, `ticket_prices`, `conversations`, `reservations`, `reservation_items`, `orders`, `seats`, `payments`, `official_table_map_reservations`; funções `reserve_ticket_cart`, `reserve_seats`, `cancel_pending_reservation`, `reserve_official_table_map_place`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Normalizar telefone e localizar ou criar identidade do comprador. (`customer.identify`)
2. Avaliar frequência, quantidade e histórico antes de reservar e registrar sinais. (`customer.limit_reservations`)
3. Aplicar finalidade compra/oferta/ingresso e horário de corte local de sessão. (`catalog.enforce_visibility`)
4. Apresentar ofertas por sessão com preço, taxa, janela de vendas e capacidade. (`catalog.offers`)
5. Escolher setores, quantidades e lugares, adicionar itens e revisar antes de reservar. (`reservation.cart`)
6. Criar reserva temporária e pedido com valores congelados; carrinho é consumidor atual, helpers simples não têm chamador de produção. (`reservation.create`)
7. Reutilizar pendência ativa e obter link sem criar nova reserva simultânea. (`reservation.resume`)
8. Cancelar por cliente ou operador autorizado, rejeitando pedidos já pagos. (`reservation.cancel`)
9. Reservar lugar compatível com quantidade e sessão; entrada normal está desabilitada pela flag Rota5. (`table_map.reserve`)
10. Gerar/reutilizar checkout associado a reserva válida e registrar referência externa. (`payment.checkout_create`)

**Branches e erros**

- Cliente seleciona evento/sessão/setor/tipo/assento conforme disponibilidade.
- Reserva ativa pode ser retomada ou cancelada.
- Mapa oficial é branch parcial; reserva comum permanece estruturalmente presente.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `ticket.checkout` — Pagamento Pix de ingresso pelo checkout

- **Tipo/status:** USER_JOURNEY / CONFIRMADO
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `page-checkout`, `http-checkout-mp`, `http-checkout-pay`, `http-checkout-status`, `page-checkout-success`, `page-checkout-pending`, `page-checkout-failure`
- **Objetivo/happy path:** Abrir pedido reservado, iniciar Pix e observar estado do pagamento.
- **Capabilities:** `customer.limit_checkout`, `payment.checkout_view`, `payment.pay_pix`, `payment.status`, `payment.return_notice`, `analytics.track_click`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.buyer-anti-abuse`, `test-018`, `audit.mercado-pago-security`
- **Dados:** `buyer_risk_events`, `customers`, `orders`, `reservations`, `reservation_items`, `venue_sections`, `payments`, `tickets`, `combo_orders`; funções `confirm_paid_ticket_order`; integrações `integration-supabase`, `integration-zapi`, `integration-mercado-pago`

**Sequência comprovada**

1. Recusar checkout temporariamente quando limites do comprador forem excedidos. (`customer.limit_checkout`)
2. Validar token e exibir pedido, valor, formulário e dados Pix no cliente web. (`payment.checkout_view`)
3. Validar e-mail/documento e gerar cobrança Pix com idempotência e QR. (`payment.pay_pix`)
4. Consultar estado; polling pode buscar aprovação no provedor, confirmar e entregar ingresso. (`payment.status`)
5. Renderizar páginas informativas estáticas de sucesso/pendência/falha; elas não consultam nem confirmam pagamento. (`payment.return_notice`)
6. Persistir instante de abertura e contagem de cliques nos metadados do checkout de ingresso ou combo. (`analytics.track_click`)

**Branches e erros**

- Pedido expirado ou inválido falha antes do pagamento.
- Status pode continuar pendente, confirmar pagamento ou mostrar retorno success/pending/failure.
- Criação Pix aplica rate limit e validações de comprador.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `ticket.delivery` — Distribuição e reenvio de ingressos

- **Tipo/status:** USER_JOURNEY / CONFIRMADO
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Entregar QR ao comprador ou distribuir ingressos entre participantes.
- **Capabilities:** `messaging.protect_delivery`, `ticket.deliver`, `ticket.delivery_choice`, `ticket.assign_participants`, `ticket.claim_participant`, `ticket.resend`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-028`, `test-041`, `test-027`, `test-036`, `test-037`, `audit.mercado-pago-security`, `audit.seatmap-qr-image`
- **Dados:** `whatsapp_outbound_deliveries`, `tickets`, `customers`, `orders`, `conversations`, `whatsapp_messages`; funções `claim_whatsapp_outbound_delivery`, `mark_buyer_ticket_qr_delivered`, `assign_participant_contacts_to_order_tickets`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Reivindicar cada entrega por chave idempotente e persistir sent/failed; nova tentativa depende de novo consumidor. (`messaging.protect_delivery`)
2. Enviar resumo e imagem assinada; marcar primeiro QR somente após envio aceito. (`ticket.deliver`)
3. Em compra múltipla, oferecer entrega ao comprador ou contatos de participantes. (`ticket.delivery_choice`)
4. Validar telefones/quantidade, reservar ingresso do comprador e associar participantes atomicamente. (`ticket.assign_participants`)
5. Participante solicita seus ingressos por telefone; envio exitoso marca entrega. (`ticket.claim_participant`)
6. REENVIAR lista grupos e devolve QR elegível respeitando titularidade e janela pública. (`ticket.resend`)

**Branches e erros**

- Comprador pode manter ingressos, escolher distribuição ou reenviar.
- Participante pode reivindicar ingresso reservado ao contato.
- Outbox evita entregas duplicadas e registra falha para retry.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `ticket.view` — Visualização pública do ingresso

- **Tipo/status:** USER_JOURNEY / CONFIRMADO
- **Ator/trigger:** customer / HTTP_REQUEST
- **Entradas:** `page-ticket`
- **Objetivo/happy path:** Exibir ingresso associado a token público válido.
- **Capabilities:** `ticket.view`, `catalog.enforce_visibility`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-031`
- **Dados:** `tickets`, `orders`, `event_sessions`, `events`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Verificar assinatura e exibir ingresso válido com QR e dados públicos reduzidos. (`ticket.view`)
2. Aplicar finalidade compra/oferta/ingresso e horário de corte local de sessão. (`catalog.enforce_visibility`)

**Branches e erros**

- Token inválido/ausente termina em erro ou conteúdo indisponível.
- Ingresso válido renderiza dados e QR conforme estado.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `courtesy.public` — Emissão pública de ingresso gratuito

- **Tipo/status:** USER_JOURNEY / PARCIAL
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Emitir ingresso gratuito público quando preço/regra permitem.
- **Capabilities:** `courtesy.public_issue`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-031`
- **Dados:** `tickets`, `orders`, `reservations`, `courtesy_section_limits`; funções `issue_public_free_ticket_order`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Validar reserva de valor zero e limites antes de emitir; apresentação oculta tipo free, podendo haver ofertas não-free de valor zero. (`courtesy.public_issue`)

**Branches e erros**

- Evento/preço invisível ou inelegível nega emissão.
- RPC cria pedido pago e ticket sem pagamento externo.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `combo.purchase` — Compra de combo pelo checkout

- **Tipo/status:** USER_JOURNEY / CONFIRMADO
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `page-combo-checkout`, `http-combo-pay`, `http-combo-status`
- **Objetivo/happy path:** Abrir checkout de combo, iniciar Pix e consultar estado.
- **Capabilities:** `combo.checkout_view`, `combo.pay_pix`, `combo.status`, `analytics.track_click`
- **Terminais:** `WAITING_EXTERNAL`, `SUCCESS`, `FAILURE`, `EXPIRED`
- **Teste:** PARTIAL; `test-031`, `test-018`
- **Dados:** `combo_orders`, `combo_offers`, `customers`, `event_sessions`, `combo_payments`, `payments`; integrações `integration-supabase`, `integration-mercado-pago`

**Sequência comprovada**

1. Validar token/janela e mostrar produto, preço e formulário Pix. (`combo.checkout_view`)
2. Solicitar Pix ao provedor e reutilizar tentativa conforme estado/idempotência. (`combo.pay_pix`)
3. Consultar situação mediante token; não equivale à reconciliação de ingresso. (`combo.status`)
4. Persistir instante de abertura e contagem de cliques nos metadados do checkout de ingresso ou combo. (`analytics.track_click`)

**Branches e erros**

- Token/pedido inválido ou expirado falha.
- Pagamento fica pendente até confirmação externa; status pode reconciliar.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.
- Estados de espera/expiração permanecem explícitos nos terminais e transições.

## `combo.delivery_choice` — Escolha de entrega do combo por WhatsApp

- **Tipo/status:** USER_JOURNEY / PARCIAL
- **Ator/trigger:** customer / USER_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Registrar resposta de entrega após solicitação da cozinha.
- **Capabilities:** `combo.delivery_choose`, `table_map.reserve`
- **Terminais:** `CHOICE_RECORDED`, `WAITING_USER`, `FAILURE`
- **Teste:** PARTIAL; `test-036`, `test-026`
- **Dados:** `combo_redemptions`, `official_table_map_reservations`, `combo_redemption_events`, `reservations`, `orders`; funções `reserve_official_table_map_place`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. OK/1 confirma escolha e local após revalidar compra e mesa; mantém ingresso de combo emitido. (`combo.delivery_choose`)
2. Reservar lugar compatível com quantidade e sessão; entrada normal está desabilitada pela flag Rota5. (`table_map.reserve`)

**Branches e erros**

- Resposta OK/1 usa reserva de mesa válida; outras respostas permanecem no contexto.
- Ausência de reserva/estado esperado impede conclusão.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.
- Estados de espera/expiração permanecem explícitos nos terminais e transições.

## `admin.whatsapp_session` — Sessão administrativa via WhatsApp

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Autenticar e navegar comandos administrativos na conversa.
- **Capabilities:** `messaging.navigate_admin`, `admin.login`, `admin.logout`
- **Terminais:** `AUTHENTICATED`, `LOCKED`, `LOGGED_OUT`, `FAILURE`
- **Teste:** FAILING; `test-011`, `audit.admin-navigation-flow`, `test-001`, `audit.admin-login-lockout`, `audit.admin-tokenized-login`
- **Dados:** `conversations`, `admin_users`, `admin_login_challenges`, `admin_auth_attempts`, `admin_sessions`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Preservar pilha administrativa e restaurar submenu anterior. (`messaging.navigate_admin`)
2. Emitir link temporário, validar segredo, consumir código e abrir sessão administrativa. (`admin.login`)
3. Revogar sessão ativa e cancelar autenticação pendente ao sair. (`admin.logout`)

**Branches e erros**

- Senha/challenge inválido registra tentativa e pode bloquear.
- Logout cancela estado administrativo pendente.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.web_session` — Sessão administrativa web por link

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `page-admin-login`, `http-admin-login`, `http-admin-open`
- **Objetivo/happy path:** Validar token/senha, consumir link e criar cookies administrativos.
- **Capabilities:** `admin.login`, `admin.web_session`, `admin.lockout`
- **Terminais:** `AUTHENTICATED`, `LOCKED`, `FAILURE`
- **Teste:** PARTIAL; `test-001`, `audit.admin-login-lockout`, `audit.admin-tokenized-login`, `test-016`
- **Dados:** `admin_users`, `admin_login_challenges`, `admin_auth_attempts`, `admin_sessions`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Emitir link temporário, validar segredo, consumir código e abrir sessão administrativa. (`admin.login`)
2. Consumir link/challenge, gravar cookies de sessão/CSRF e abrir área autorizada. (`admin.web_session`)
3. Persistir falhas e aplicar bloqueios temporários/administrativos na autenticação. (`admin.lockout`)

**Branches e erros**

- Tentativas inválidas acumulam lockout.
- Link válido cria sessão e CSRF; expirado/consumido falha.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.web_event_workspace` — Workspace web de eventos, combos e dashboards

- **Tipo/status:** ADMIN_JOURNEY / PARCIAL
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `page-admin-events`, `http-admin-events`, `http-admin-event-id`, `http-admin-combos`, `http-admin-combo-id`
- **Objetivo/happy path:** Operar catálogo administrativo pela página web.
- **Capabilities:** `admin.authorize`, `event.list`, `event.inspect`, `event.create`, `event.edit`, `event.publish`, `event.change_status`, `event.cancel`, `event.duplicate`, `combo.list`, `analytics.general_dashboard`, `analytics.event_dashboard`, `analytics.contacts`
- **Terminais:** `API_SUCCESS`, `FAILURE`
- **Teste:** FAILING; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `test-003`, `test-008`, `test-009`, `audit.admin-event-creation-flow`, `test-006`, `test-014`, `test-002`, `audit.admin-event-edit-duplicate`, `test-004`, `test-005`, `test-017`, `test-040`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `event_sessions`, `venue_sections`, `ticket_prices`, `session_seats`, `venues`, `seats`, `combo_offer_scopes`, `combo_orders`, `whatsapp_messages`, `tickets`, `combo_redemptions`, `ticket_validation_events`, `customers`, `conversations`, `reservations`, `orders`; funções `list_admin_events_fast`, `get_admin_event_editor_payload`, `get_admin_general_dashboard_summary`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Consultar eventos por status/texto e escopo do administrador, incluindo modo rápido. (`event.list`)
3. Carregar configuração e inventário para edição. (`event.inspect`)
4. Criar evento e dados iniciais; formulário web atual tem erro de parse, caminho de serviço/WhatsApp existe. (`event.create`)
5. Alterar título, artista, descrição, imagem e local sob autorização. (`event.edit`)
6. Mudar estado para published; diálogo verifica inventário comprável, API aplica seu próprio contrato. (`event.publish`)
7. Alterar estado operacional do evento sem apagar dados de venda. (`event.change_status`)
8. DELETE grava status cancelled; não faz exclusão física nem estorno. (`event.cancel`)
9. Copiar configuração para novo draft e inventário próprio; não copiar pedidos/ingressos. (`event.duplicate`)
10. Consultar ofertas sob escopo administrativo com preço, estado e métricas. (`combo.list`)
11. Exibir séries e totais agregados; possui RPC resumida e agregação detalhada TypeScript. (`analytics.general_dashboard`)
12. Calcular vendas, ocupação, entradas e combos por período/evento. (`analytics.event_dashboard`)
13. Combinar atividade de clientes com compra/reserva e tentativas outbound; sem prova de leitura humana da mensagem. (`analytics.contacts`)

**Branches e erros**

- APIs validam sessão/CSRF e executam consultas/mutações.
- A página e o CreateEventModal compilam; a jornada permanece parcial por criação multi-entidade e testes source-contract falhos não relacionados ao parse.
- Chamadas diretas às APIs permanecem estruturalmente existentes.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.whatsapp_event_management` — Gestão completa de evento pelo WhatsApp

- **Tipo/status:** ADMIN_JOURNEY / PARCIAL
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Criar e manter evento, sessões, setores, assentos e preços por comandos administrativos.
- **Capabilities:** `admin.authorize`, `event.list`, `event.inspect`, `event.create`, `event.edit`, `event.publish`, `event.change_status`, `event.duplicate`, `event.session_create`, `event.session_edit`, `event.section_create`, `event.section_edit`, `event.capacity_set`, `event.seats_create`, `event.seats_block`, `event.price_create`, `event.price_edit`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** FAILING; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `test-003`, `test-008`, `test-009`, `audit.admin-event-creation-flow`, `test-006`, `test-014`, `test-002`, `audit.admin-event-edit-duplicate`, `test-013`, `test-015`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `event_sessions`, `venue_sections`, `ticket_prices`, `session_seats`, `venues`, `seats`, `reservations`, `tickets`; funções `list_admin_events_fast`, `get_admin_event_editor_payload`, `update_admin_section_capacity`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Consultar eventos por status/texto e escopo do administrador, incluindo modo rápido. (`event.list`)
3. Carregar configuração e inventário para edição. (`event.inspect`)
4. Criar evento e dados iniciais; formulário web atual tem erro de parse, caminho de serviço/WhatsApp existe. (`event.create`)
5. Alterar título, artista, descrição, imagem e local sob autorização. (`event.edit`)
6. Mudar estado para published; diálogo verifica inventário comprável, API aplica seu próprio contrato. (`event.publish`)
7. Alterar estado operacional do evento sem apagar dados de venda. (`event.change_status`)
8. Copiar configuração para novo draft e inventário próprio; não copiar pedidos/ingressos. (`event.duplicate`)
9. Cadastrar data, horário, timezone e estado de nova sessão. (`event.session_create`)
10. Editar sessão existente com checagens de utilização no consumidor. (`event.session_edit`)
11. Cadastrar setor e, conforme o caminho, associar oferta e inventário às sessões. (`event.section_create`)
12. Alterar metadados e ativação de setor existente. (`event.section_edit`)
13. Ajustar quantidade finita/ilimitada e inventário pela RPC que protege assentos em uso. (`event.capacity_set`)
14. Criar códigos/layout de lugares e completar inventário por sessão. (`event.seats_create`)
15. Alterar estado de assentos após checar uso operacional. (`event.seats_block`)
16. Cadastrar tipo, nome, preço, taxa e janela de venda. (`event.price_create`)
17. Alterar preço/taxa, label, início/fim e estado; contrato de UI de label falha. (`event.price_edit`)

**Branches e erros**

- Criação começa em draft e pode publicar.
- Edição percorre estados conversacionais e valida cada entidade.
- Preço tem evidência parcial e falhas intermediárias podem deixar draft/resíduos.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.combo_management` — Gestão de ofertas de combo

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`, `http-admin-combos`, `http-admin-combo-id`
- **Objetivo/happy path:** Listar, criar, configurar, ativar, duplicar e excluir logicamente ofertas.
- **Capabilities:** `admin.authorize`, `combo.list`, `combo.create`, `combo.edit`, `combo.scope`, `combo.schedule`, `combo.activate`, `combo.duplicate`, `combo.delete`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** FAILING; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `test-004`, `test-019`, `test-021`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `combo_offer_scopes`, `combo_orders`, `whatsapp_messages`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Consultar ofertas sob escopo administrativo com preço, estado e métricas. (`combo.list`)
3. Cadastrar produto, descrição, imagem, preço e configuração de oferta; web e WhatsApp possuem implementação distinta. (`combo.create`)
4. Alterar nome, descrição, imagem, preço original e preço cobrado. (`combo.edit`)
5. Configurar escopo por evento ou dias da semana. (`combo.scope`)
6. Definir disparo após QR/horário personalizado e prioridade por evento. (`combo.schedule`)
7. Alterar active/paused para controlar elegibilidade da oferta. (`combo.activate`)
8. Copiar oferta/escopos para novo registro pausado com vínculo de origem. (`combo.duplicate`)
9. Marcar deleted, preservando pedidos e histórico. (`combo.delete`)

**Branches e erros**

- Criação web inicia paused; ativação muda para active.
- Escopo e agenda podem falhar validação; exclusão usa estado deleted.
- WhatsApp e APIs são entradas alternativas.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.courtesy_management` — Gestão de cortesias

- **Tipo/status:** ADMIN_JOURNEY / PARCIAL
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`
- **Objetivo/happy path:** Definir limite por setor e emitir, listar, reenviar ou cancelar cortesias.
- **Capabilities:** `admin.authorize`, `courtesy.issue`, `courtesy.list`, `courtesy.resend`, `courtesy.cancel`, `courtesy.section_limit`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `audit.admin-courtesies`, `test-031`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `courtesies`, `tickets`, `orders`, `reservations`, `session_seats`, `customers`, `courtesy_section_limits`; funções `issue_admin_courtesy_order`, `issue_courtesy_order`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Validar limite/beneficiário, reservar lugares e emitir ingresso gratuito com identificação do emissor. (`courtesy.issue`)
3. Consultar cortesias emitidas e selecionar alvo para suporte. (`courtesy.list`)
4. Recompor e enviar QR da cortesia selecionada pelo operador. (`courtesy.resend`)
5. Cancelar cortesia específica, por beneficiário ou lote do evento e liberar inventário aplicável. (`courtesy.cancel`)
6. Persistir limites e labels por setor; aba visual está oculta por flag global. (`courtesy.section_limit`)

**Branches e erros**

- Emissão usa RPC transacional e produz pedido/ticket pagos.
- Cancelamento invalida ticket/cortesia; reenvio reutiliza entrega.
- Limite por setor via workspace web é parcial.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.user_management` — Gestão de administradores

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Administrar usuários, perfis, ativação, senha e bloqueio.
- **Capabilities:** `admin.authorize`, `admin.users_list`, `admin.user_create`, `admin.role_change`, `admin.user_disable`, `admin.user_reactivate`, `admin.password_renew`, `admin.unlock`
- **Terminais:** `SUCCESS`, `FORBIDDEN`, `FAILURE`
- **Teste:** PARTIAL; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `audit.admin-users-flow`, `audit.admin-login-lockout`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `admin_auth_attempts`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Exibir usuários/perfis e tentativas bloqueadas para gestão. (`admin.users_list`)
3. Criar administrador por telefone com passphrase armazenada em hash. (`admin.user_create`)
4. Mudar permissões preservando último root e revogando sessões. (`admin.role_change`)
5. Desativar conta, preservar último root ativo e revogar sessões. (`admin.user_disable`)
6. Reativar registro administrativo existente. (`admin.user_reactivate`)
7. Substituir hash e invalidar sessões do usuário. (`admin.password_renew`)
8. Remover bloqueio administrativo por telefone sob autorização. (`admin.unlock`)

**Branches e erros**

- Autorização por perfil precede mutações.
- Usuário pode ser desativado/reativado; senha e lockout podem ser renovados.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.reporting` — Consultas e relatórios administrativos por WhatsApp

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Consultar pedidos/ingressos e gerar relatórios ou baixa de divisão.
- **Capabilities:** `admin.authorize`, `ticket.admin_lookup`, `analytics.sales`, `analytics.division`, `analytics.settle`, `analytics.general_report`, `analytics.section_sales`, `analytics.pending_orders`, `analytics.expired_reservations`, `analytics.gate_checkins`, `analytics.ticket_usage`, `analytics.courtesies`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `audit.admin-orders-tickets`, `audit.admin-reports`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `tickets`, `reservations`, `orders`, `customers`, `payments`, `session_seats`, `ticket_prices`, `event_sessions`, `division_settlements`, `courtesies`, `ticket_validation_events`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Apresentar vendas, ingresso e pendências ao operador autorizado. (`ticket.admin_lookup`)
3. Selecionar eventos/período e consolidar vendas, capacidade, entradas e cortesias do relatório sales_event. (`analytics.sales`)
4. Calcular valor recebido e divisão fixa registrada no relatório. (`analytics.division`)
5. Marcar período como pago com snapshot de valor e administrador; não transfere dinheiro. (`analytics.settle`)
6. Agregar receita, vendas e ocupação em relatório geral por período. (`analytics.general_report`)
7. Opção sales_section agrega ingressos, valores, gratuidades e ocupação por setor. (`analytics.section_sales`)
8. Opção pending_payments lista reservas/pedidos aguardando pagamento no período. (`analytics.pending_orders`)
9. Opção expired_cancelled_reservations lista perdas e liberações de reserva por período. (`analytics.expired_reservations`)
10. Opção gate_checkins apresenta entradas permitidas e tentativas recusadas por período. (`analytics.gate_checkins`)
11. Opção ticket_usage compara utilização de ingressos emitidos no período. (`analytics.ticket_usage`)
12. Ramo final do relatório apresenta cortesias e beneficiários conforme período. (`analytics.courtesies`)

**Branches e erros**

- Filtros escolhem relatório e evento/período.
- Baixa depende do cálculo de divisão.
- Sem dados ou permissão retorna terminal informativo/erro.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `admin.operational_dashboard` — Dashboard operacional web

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `page-admin-ops`, `http-admin-ops`
- **Objetivo/happy path:** Carregar painel operacional autenticado.
- **Capabilities:** `admin.web_session`, `admin.authorize`, `analytics.operational`
- **Terminais:** `SUCCESS`, `UNAUTHORIZED`, `FAILURE`
- **Teste:** PARTIAL; `test-016`, `audit.admin-tokenized-login`, `test-010`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `test-012`
- **Dados:** `admin_users`, `admin_sessions`, `admin_login_challenges`, `events`, `combo_offers`, `whatsapp_messages`, `customers`, `reservations`, `orders`, `payments`, `combo_orders`, `tickets`; funções `get_admin_intelligence_dashboard`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Consumir link/challenge, gravar cookies de sessão/CSRF e abrir área autorizada. (`admin.web_session`)
2. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
3. Consultar RPC e renderizar indicadores, séries e alertas operacionais. (`analytics.operational`)

**Branches e erros**

- Página exige sessão; API agrega métricas por RPC.
- Sessão inválida redireciona ou retorna 401/403.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `gate.access_management` — Gestão de credenciais de portaria

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Criar, listar, pausar ou revogar credenciais de acesso à portaria.
- **Capabilities:** `admin.authorize`, `gate.access_create`, `gate.access_list`, `gate.access_pause`, `gate.fixed_create`, `gate.fixed_list`, `gate.fixed_revoke`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `gate_accesses`, `event_sessions`, `fixed_gate_accesses`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Cadastrar validador com telefone/senha e escopo de evento/sessão. (`gate.access_create`)
3. Consultar operadores e acessos existentes. (`gate.access_list`)
4. Pausar autorização de acesso por evento; não revoga automaticamente sessões de leitor já emitidas. (`gate.access_pause`)
5. Cadastrar acesso por telefone/senha ligado ao administrador proprietário. (`gate.fixed_create`)
6. Exibir acessos fixos do proprietário. (`gate.fixed_list`)
7. Revogar credencial fixa; não altera sessões de leitor já emitidas. (`gate.fixed_revoke`)

**Branches e erros**

- Acesso temporário pode ficar active, paused ou revoked.
- Credencial fixa pode ficar active ou revoked.
- Pausar/revogar credencial não revoga gate_sessions já emitidas.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `gate.ticket_admission` — Consulta e entrada de ingresso na portaria

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** gate_operator / ADMIN_ACTION
- **Entradas:** `page-gate`, `http-gate-validate`, `http-gate-consult`, `http-gate-scan`
- **Objetivo/happy path:** Abrir leitor, consultar ingresso e consumi-lo na entrada.
- **Capabilities:** `gate.open`, `gate.consult`, `gate.admit`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.gate-phone-checkin`, `audit.gate-wrong-event`
- **Dados:** `gate_sessions`, `gate_accesses`, `fixed_gate_accesses`, `event_sessions`, `events`, `tickets`, `ticket_validation_events`; funções `validate_ticket_entry`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Emitir link opaco, verificar sessão e carregar resumo do leitor no escopo autorizado. (`gate.open`)
2. Consultar código/QR e situação do ingresso sem marcar usado. (`gate.consult`)
3. Validar assinatura, evento, sessão e uso anterior; consumir ingresso atomicamente e registrar tentativa. (`gate.admit`)

**Branches e erros**

- Token/dispositivo inválido impede leitor.
- Consult apenas lê; scan chama validate_ticket_entry.
- Ticket issued no escopo passa a used; usado/cancelado/fora do evento é negado.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `kitchen.session_prepare` — Sessão da cozinha e preparo de combo

- **Tipo/status:** ADMIN_JOURNEY / CONFIRMADO
- **Ator/trigger:** kitchen_operator / ADMIN_ACTION
- **Entradas:** `page-kitchen-access`, `page-kitchen-session`, `http-kitchen-open`, `http-kitchen-validate`, `http-kitchen-prepare`
- **Objetivo/happy path:** Vincular dispositivo à sessão de cozinha, listar pedidos e registrar preparo.
- **Capabilities:** `combo.kitchen_open`, `combo.prepare`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-022`
- **Dados:** `gate_sessions`, `combo_redemptions`, `combo_redemption_events`, `event_sessions`, `whatsapp_messages`, `conversations`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Autenticar token de cozinha, vincular cookie do dispositivo e retornar pedidos/histórico. (`combo.kitchen_open`)
2. Mudar estado de cozinha, rotacionar token e notificar cliente sobre retirada. (`combo.prepare`)

**Branches e erros**

- Token/dispositivo inválido impede acesso.
- Prepare registra metadata/evento e pode notificar cliente.
- Validate retorna sessão/pedidos, sem consumir resgate.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `kitchen.combo_redemption` — Leitura e resgate de combo

- **Tipo/status:** ADMIN_JOURNEY / PARCIAL
- **Ator/trigger:** kitchen_operator / ADMIN_ACTION
- **Entradas:** `page-offer-reader`, `http-kitchen-scan`
- **Objetivo/happy path:** Validar QR e concluir consumo do combo preparado.
- **Capabilities:** `combo.delivery_prompt`, `combo.redeem`
- **Terminais:** `SUCCESS`, `ALREADY_USED`, `WAITING_USER`, `DENIED`, `FAILURE`
- **Teste:** PARTIAL; `test-036`, `audit.combo-redemption-security`
- **Dados:** `combo_redemptions`, `official_table_map_reservations`, `conversations`, `whatsapp_messages`, `combo_redemption_events`; funções `validate_combo_redemption`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. QR válido com mesa paga solicita escolha no WhatsApp sem consumir resgate; ingresso individual sem mesa é negado. (`combo.delivery_prompt`)
2. Após escolha confirmada e preparo concluído, validar e consumir atomicamente pela RPC validate_combo_redemption. (`combo.redeem`)

**Branches e erros**

- QR inválido/escopo incorreto é negado.
- Caso paid + issued válido entra no ramo de escolha/mesa e retorna antes da RPC.
- Resgates confirmados e prontos alcançam validate_combo_redemption; equivalência remota permanece não validada.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `table_map.calibration` — Prévia e calibração do mapa oficial

- **Tipo/status:** ADMIN_JOURNEY / PARCIAL
- **Ator/trigger:** admin / ADMIN_ACTION
- **Entradas:** `http-admin-map`
- **Objetivo/happy path:** Ler catálogo/coordenadas, renderizar prévia e persistir calibração.
- **Capabilities:** `admin.authorize`, `table_map.preview`, `table_map.calibrate`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`, `test-026`
- **Dados:** `admin_users`, `admin_sessions`, `events`, `combo_offers`, `official_table_map_places`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)
2. Ler coordenadas persistidas e renderizar preview pelo mesmo renderizador do WhatsApp. (`table_map.preview`)
3. Validar metadados fixos e persistir coordenadas; componente visual existe, aba está oculta. (`table_map.calibrate`)

**Branches e erros**

- GET renderiza/lê; POST valida e persiste coordenadas.
- Assets/estado visual e execução browser não foram integralmente validados.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `whatsapp.inbound_dispatch` — Recepção e despacho de mensagem WhatsApp

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** Z-API / WEBHOOK
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Receber webhook, persistir contexto, rotear intenção e enviar resposta.
- **Capabilities:** `platform.limit_requests`, `messaging.receive`, `customer.identify`, `messaging.respond`, `admin.authorize`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** FAILING; `audit.rate-limit`, `test-033`, `test-039`, `test-025`, `test-042`, `test-043`, `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`
- **Dados:** `rate_limit_events`, `customers`, `conversations`, `whatsapp_messages`, `admin_users`, `admin_sessions`, `events`, `combo_offers`; funções `consume_rate_limit`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar janela de requisições e responder 429 quando excedida. (`platform.limit_requests`)
2. Autenticar webhook, ignorar grupo/eco, identificar cliente e persistir inbound com chave de mensagem. (`messaging.receive`)
3. Normalizar telefone e localizar ou criar identidade do comprador. (`customer.identify`)
4. Enviar respostas imediatas do router, separar imagem/texto e registrar resultado do provedor. (`messaging.respond`)
5. Aplicar permissões, escopo de proprietário e CSRF nas mutações web. (`admin.authorize`)

**Branches e erros**

- Assinatura/origem/rate limit inválidos são rejeitados.
- Mensagem identifica cliente/conversa e chama router.
- Resposta usa outbox e Z-API; erros são registrados.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `ticket.payment_confirmation` — Confirmação e emissão pós-pagamento de ingresso

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** Mercado Pago / WEBHOOK
- **Entradas:** `http-mp-webhook`, `http-checkout-status`
- **Objetivo/happy path:** Reconciliar pagamento aprovado, marcar pedido/reserva e emitir/entregar tickets.
- **Capabilities:** `platform.limit_requests`, `payment.confirm`, `ticket.deliver`, `ticket.delivery_choice`, `messaging.protect_delivery`, `table_map.sync_status`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.rate-limit`, `audit.mercado-pago-security`, `test-027`, `test-028`, `test-036`, `test-037`, `audit.seatmap-qr-image`, `test-041`
- **Dados:** `rate_limit_events`, `payment_events`, `payments`, `orders`, `reservations`, `tickets`, `session_seats`, `customers`, `conversations`, `whatsapp_messages`, `whatsapp_outbound_deliveries`, `official_table_map_reservations`; funções `consume_rate_limit`, `confirm_paid_ticket_order`, `mark_buyer_ticket_qr_delivered`, `claim_whatsapp_outbound_delivery`, `sync_official_table_map_reservation_status`; integrações `integration-supabase`, `integration-zapi`, `integration-mercado-pago`

**Sequência comprovada**

1. Aplicar janela de requisições e responder 429 quando excedida. (`platform.limit_requests`)
2. Autenticar notificação, consultar provedor e confirmar com validação de referência/valor e RPC idempotente. (`payment.confirm`)
3. Enviar resumo e imagem assinada; marcar primeiro QR somente após envio aceito. (`ticket.deliver`)
4. Em compra múltipla, oferecer entrega ao comprador ou contatos de participantes. (`ticket.delivery_choice`)
5. Reivindicar cada entrega por chave idempotente e persistir sent/failed; nova tentativa depende de novo consumidor. (`messaging.protect_delivery`)
6. Trigger acompanha mudança de estado da reserva e atualiza status da mesa correspondente. (`table_map.sync_status`)

**Branches e erros**

- Webhook valida assinatura e idempotência por payment_events.
- Consulta de status é caminho alternativo de reconciliação.
- RPC confirm_paid_ticket_order converte pedido/reserva e emite tickets; entrega pode aguardar escolha.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.
- Webhook e consulta de status são caminhos distintos de reconciliação quando catalogados.

## `combo.payment_confirmation` — Confirmação e emissão pós-pagamento de combo

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** Mercado Pago / WEBHOOK
- **Entradas:** `http-mp-webhook`
- **Objetivo/happy path:** Confirmar pagamento de combo e entregar QR de resgate.
- **Capabilities:** `platform.limit_requests`, `combo.confirm`, `combo.deliver_qr`, `messaging.protect_delivery`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.rate-limit`, `test-022`, `test-027`, `test-028`, `test-041`
- **Dados:** `rate_limit_events`, `combo_orders`, `combo_payments`, `payment_events`, `combo_redemptions`, `whatsapp_messages`, `whatsapp_outbound_deliveries`; funções `consume_rate_limit`, `claim_whatsapp_outbound_delivery`; integrações `integration-supabase`, `integration-zapi`, `integration-mercado-pago`

**Sequência comprovada**

1. Aplicar janela de requisições e responder 429 quando excedida. (`platform.limit_requests`)
2. Validar referência/valor/vínculo e persistir pedido pago e pagamento aprovado em operações separadas. (`combo.confirm`)
3. Criar credencial de resgate e enviar resumo/imagem com controle idempotente por entrega. (`combo.deliver_qr`)
4. Reivindicar cada entrega por chave idempotente e persistir sent/failed; nova tentativa depende de novo consumidor. (`messaging.protect_delivery`)

**Branches e erros**

- Webhook distingue pagamento de ingresso e combo.
- Pagamento aprovado marca combo order/payment e cria redemption issued.
- Entrega usa proteção idempotente; falha fica registrada.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.
- Webhook e consulta de status são caminhos distintos de reconciliação quando catalogados.

## `reservation.expiration` — Expiração, lembretes e cancelamento temporal

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** cron / CRON
- **Entradas:** `trigger-cron-expire`, `http-cron-expire`
- **Objetivo/happy path:** Expirar reservas vencidas, liberar inventário e notificar.
- **Capabilities:** `reservation.expire`, `table_map.sync_status`, `background.notify_expiry`, `background.remind_interest`, `background.expire_admin`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** PARTIAL; `audit.reservation-expiration-cancel`, `audit.admin-navigation-flow`
- **Dados:** `reservations`, `orders`, `payments`, `session_seats`, `official_table_map_reservations`, `whatsapp_messages`, `conversations`, `admin_sessions`, `customers`; funções `expire_reservations`, `sync_official_table_map_reservation_status`; integrações `integration-supabase`, `integration-vercel`, `integration-zapi`

**Sequência comprovada**

1. Executar expiração transacional pelo banco. (`reservation.expire`)
2. Trigger acompanha mudança de estado da reserva e atualiza status da mesa correspondente. (`table_map.sync_status`)
3. Revisitar reservas expiradas recentes, evitar aviso já enviado e limpar contexto. (`background.notify_expiry`)
4. Selecionar conversas interessadas sem compra gerada e enviar lembrete deduplicado. (`background.remind_interest`)
5. Marcar sessões vencidas e restaurar contexto público após aviso. (`background.expire_admin`)

**Branches e erros**

- Cron autenticado chama expire_reservations.
- Reserva active vencida vira expired; pedido e assentos acompanham.
- Lembretes e estados administrativos pendentes são tratados conforme janela.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `combo.offer_distribution` — Distribuição automática de oferta de combo

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** cron / CRON
- **Entradas:** `trigger-cron-expire`, `http-cron-expire`
- **Objetivo/happy path:** Selecionar oferta agendada, criar checkout e enviar ao comprador elegível.
- **Capabilities:** `combo.offer_send`, `combo.checkout_create`, `combo.expire`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** FAILING; `test-019`, `test-020`, `test-021`, `test-036`
- **Dados:** `tickets`, `customers`, `combo_offers`, `combo_offer_scopes`, `combo_offer_event_locks`, `combo_orders`, `whatsapp_messages`, `event_sessions`; funções `mark_buyer_ticket_qr_delivered`, `get_database_now`; integrações `integration-supabase`, `integration-zapi`, `integration-vercel`

**Sequência comprovada**

1. Selecionar oferta elegível, respeitar atraso do QR, prioridade e dedupe; gerar pedido/link por destinatário. (`combo.offer_send`)
2. Criar pedido associado a ingresso/pedido origem ou renovar checkout pendente/expirado elegível. (`combo.checkout_create`)
3. Marcar pedidos pendentes vencidos como expired. (`combo.expire`)

**Branches e erros**

- Escopo, prioridade, janela e lock evitam duplicidade.
- Pedido pending_payment e token são criados antes do envio.
- Pedidos vencidos passam a expired.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `whatsapp.batch_processing` — Processamento de batches e fechamento de conversas

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** cron / CRON
- **Entradas:** `trigger-cron-batches`, `http-cron-batches`
- **Objetivo/happy path:** Reivindicar batches de WhatsApp e finalizar conversas inativas.
- **Capabilities:** `background.cancel_batches`, `background.close_inactive`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** FAILING; `test-038`, `test-023`
- **Dados:** `whatsapp_message_batches`, `whatsapp_message_batch_messages`, `conversations`, `customers`, `whatsapp_messages`; funções `claim_due_whatsapp_message_batches`, `finish_whatsapp_message_batch`, `reschedule_whatsapp_message_batch`; integrações `integration-supabase`, `integration-vercel`, `integration-zapi`

**Sequência comprovada**

1. Reclamar lotes e cancelar com customer_reply_pipeline_disabled; erros podem ser reagendados com limite. (`background.cancel_batches`)
2. Avisar encerramento e fechar/resetar conversa aberta inativa, com controle por mensagem finalizadora. (`background.close_inactive`)

**Branches e erros**

- Batch collecting pode ser claimed como processing.
- No código atual, reply cancela batches; falha pode reagendar/coletar novamente.
- Conversas open inativas passam a closed.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.
- Falha pode reagendar processing para collecting.

## `event.auto_finish` — Finalização automática de evento observado

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** internal scheduler check / INTERNAL_EVENT
- **Entradas:** `http-zapi-webhook`
- **Objetivo/happy path:** Marcar evento concluído quando sessões já terminaram durante processamento conversacional.
- **Capabilities:** `event.auto_finish`
- **Terminais:** `FINISHED`, `NO_CHANGE`, `FAILURE`
- **Teste:** UNCOVERED; nenhum teste associado
- **Dados:** `events`, `event_sessions`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Consulta de eventos para cortesias/portaria/relatórios pode persistir finished nos eventos publicados passados. (`event.auto_finish`)

**Branches e erros**

- A verificação interna roda no contexto do webhook.
- Evento elegível muda para finished; demais permanecem inalterados.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `gate.combo_release` — Liberação de preparo após entrada

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** database-backed gate scan / INTERNAL_EVENT
- **Entradas:** `http-gate-scan`
- **Objetivo/happy path:** Liberar combo associado depois da admissão válida do ingresso.
- **Capabilities:** `gate.admit`, `combo.kitchen_release`
- **Terminais:** `RELEASED`, `NOT_APPLICABLE`, `FAILURE`
- **Teste:** PARTIAL; `audit.gate-wrong-event`
- **Dados:** `tickets`, `ticket_validation_events`, `gate_sessions`, `combo_redemptions`, `whatsapp_messages`, `conversations`; funções `validate_ticket_entry`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Validar assinatura, evento, sessão e uso anterior; consumir ingresso atomicamente e registrar tentativa. (`gate.admit`)
2. Após entrada autorizada, tornar combos visíveis à cozinha e avisar comprador. (`combo.kitchen_release`)

**Branches e erros**

- Somente gate.admit allowed aciona a liberação.
- Redemption elegível recebe estado de cozinha em metadata/eventos; falhas não desfazem entrada.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `event.program_import` — Importação operacional de programação

- **Tipo/status:** OPERATIONAL_PROCESS / CONFIRMADO
- **Ator/trigger:** operational_script / SCRIPT
- **Entradas:** `script-import`
- **Objetivo/happy path:** Interpretar programacao.md e consultar ou aplicar catálogo/inventário.
- **Capabilities:** `event.import_program`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** UNCOVERED; nenhum teste associado
- **Dados:** `events`, `event_sessions`, `venues`, `venue_sections`, `ticket_prices`, `seats`, `session_seats`; integrações `integration-supabase`

**Sequência comprovada**

1. Ler programacao.md, produzir prévia/verificação e inserir programação com --apply. (`event.import_program`)

**Branches e erros**

- Sem --apply opera em verificação/dry run.
- Com --apply grava diretamente no Supabase.
- Entradas inválidas ou ambiente ausente abortam.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `blackhouse.maintenance` — Manutenção legada Black House

- **Tipo/status:** OPERATIONAL_PROCESS / CONFIRMADO
- **Ator/trigger:** operational_script / SCRIPT
- **Entradas:** `script-bh-rename`, `script-bh-split`, `script-bh-update`
- **Objetivo/happy path:** Executar renomeação, divisão e atualização de setores/eventos Black House.
- **Capabilities:** `event.legacy_rename`, `event.legacy_split`, `event.legacy_update`
- **Terminais:** `APPLIED`, `NO_CHANGE`, `FAILURE`
- **Teste:** UNCOVERED; nenhum teste associado
- **Dados:** `venue_sections`, `ticket_prices`, `seats`, `session_seats`, `reservation_items`, `reservations`; integrações `integration-supabase`

**Sequência comprovada**

1. Inspecionar e aplicar nomenclatura fixa da Black House mediante --apply. (`event.legacy_rename`)
2. Dividir configuração especial em setores/ofertas próprios com --apply. (`event.legacy_split`)
3. Reorganizar catálogo e inventário fixos de eventos Black House com --apply. (`event.legacy_update`)

**Branches e erros**

- Cada script é uma entrada alternativa com mutação própria.
- Validações/seletores podem encerrar sem mudança.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `codex.automation` — Pedido e execução operacional Codex

- **Tipo/status:** OPERATIONAL_PROCESS / CONFIRMADO
- **Ator/trigger:** admin_and_local_operator / ADMIN_ACTION
- **Entradas:** `http-zapi-webhook`, `npm-codex-requests`, `script-codex-list`, `npm-codex-runner`, `script-codex-runner`
- **Objetivo/happy path:** Registrar pedido aprovado, criar issue, listar, executar CLI local e notificar resultado.
- **Capabilities:** `automation.request`, `automation.issue`, `automation.list`, `automation.execute`, `automation.notify`
- **Terminais:** `SUCCESS`, `FAILURE`
- **Teste:** UNCOVERED; nenhum teste associado
- **Dados:** `whatsapp_messages`, `conversations`; integrações `integration-supabase`, `integration-zapi`, `integration-github`, `integration-codex-cli`

**Sequência comprovada**

1. Validar origem/segredo e persistir pedido aprovado com contexto de implantação. (`automation.request`)
2. Publicar solicitação aprovada como issue quando integração está configurada. (`automation.issue`)
3. Consultar pedidos por telefone/prefixo e imprimir lista operacional. (`automation.list`)
4. Polling lê pedidos aprovados, controla estado em arquivo e invoca codex exec no checkout local. (`automation.execute`)
5. Após execução, enviar resumo ao telefone do solicitante se disponível; ausência de credenciais Z-API retorna falha de configuração. (`automation.notify`)

**Branches e erros**

- WhatsApp registra pedido e pode criar issue GitHub.
- Listagem filtra pedidos aprovados por telefone.
- Runner faz polling, executa Codex e pode enviar resumo por WhatsApp.
- Entrada inválida, autorização negada ou falha de persistência/integração termina sem afirmar sucesso.

## `platform.edge_request_protection` — Proteção de requisições na borda

- **Tipo/status:** SYSTEM_PROCESS / CONFIRMADO
- **Ator/trigger:** edge_runtime / HTTP_REQUEST
- **Entradas:** `proxy`
- **Objetivo/happy path:** Aplicar headers de segurança e limitar origens/operações antes do destino.
- **Capabilities:** `platform.limit_requests`
- **Terminais:** `CONTINUE`, `RATE_LIMITED`
- **Teste:** PARTIAL; `audit.rate-limit`
- **Dados:** `rate_limit_events`; funções `consume_rate_limit`; integrações `integration-supabase`, `integration-zapi`

**Sequência comprovada**

1. Aplicar janela de requisições e responder 429 quando excedida. (`platform.limit_requests`)

**Branches e erros**

- Matcher seleciona as páginas cobertas.
- Limite excedido termina em 429.



## Validação bottom-up de módulos e banco

A segunda passagem cobriu os 66 módulos: 62 aparecem diretamente nos flows e quatro têm justificativa explícita de infraestrutura (`platform.env`, `platform.supabase-client`, `platform.logging`, `platform.http`).

Dos 44 objetos de tabela, 42 participam diretamente de flows. `courtesy_limits` pertence à capability standalone órfã `courtesy.event_limit`; `seat_map_renders` permanece um artefato sem consumidor funcional confirmado. Das 39 funções SQL, 26 aparecem diretamente; as sete restantes são componentes técnicos já justificados no Capability Catalog. Dos 36 triggers, um (`reservations_sync_official_table_map_status`) produz transição funcional explícita; os outros 32 mantêm `updated_at` por `set_updated_at`.

A passagem por routes, services, cron, webhooks, scripts e SQL não encontrou cadeia funcional adicional que exigisse novo flow ou capability. A auditoria de granularidade não encontrou flow duplicado, helper isolado promovido a journey ou agrupamento que ocultasse journeys independentes.
