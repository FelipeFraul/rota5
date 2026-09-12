# Catálogo de capabilities — BASELINE V1, Etapa 3

Catálogo canônico: [capabilities.json](../../system-knowledge/capabilities.json). Relações: [capability-relations.json](../../system-knowledge/capability-relations.json). Data: 11/09/2026. Fonte: working tree baseado em `a141c6004421fb8442f95493de3ca4ec4d4c997b`, incluindo a alteração preexistente em `src/lib/tickets/messages.ts`.

Foram catalogadas **140 capacidades funcionais**, com **36 relações**, a partir da leitura de entradas, serviços, ramos do router, UI, comandos e chamadas de banco. `CONFIRMADA` significa caminho estrutural coerente; não significa validado em produção. A auditoria não executou operações contra banco/provedores nem corrigiu código. A Etapa 4 não foi iniciada.

## Método e critérios

- **Descoberta bottom-up:** Leitura de implementações src/ (handlers, router, serviços e UI), comandos operacionais, chamadas de banco e migrations, antes da comparação com os documentos anteriores.
- **Descoberta top-down:** Comparação com 17 domain IDs e 66 module IDs existentes; retorno aos símbolos, ramos de código e consumidores para confirmar candidatos.
- **Auditoria independente:** Segunda passagem local de reconciliação dos inventários e busca de consumidores/verbos. Independente do primeiro agrupamento, sem subagentes e sem inferir comportamento apenas de nomes/testes.
- **Dimensão de testes:** COVERED exige assertiva direta sobre comportamento principal; contratos de fonte/helpers são PARTIAL. Auditorias reais não executadas são UNKNOWN. FAILING é atribuído ao comportamento do caso com falha, não a todas as capabilities citadas no arquivo.
- **Contagem de testes:** Com teste = pelo menos uma referência de teste/auditoria diretamente relacionada, executada ou não. Sem teste = array tests vazio. NÃO_TESTADA não é atribuído automaticamente a implementação confirmada; ausência de proteção fica em test_status.
- **Marca:** COMMON indica ausência de ramificação de marca no caminho; não afirma tenancy. Textos/filtros explicitamente Rota5/Black House são anotados.

As referências de entrada e implementação apontam para código executável; as definições SQL complementam as chamadas, sem afirmar que foram aplicadas ao ambiente remoto. Múltiplas evidências de uma capability não formam automaticamente um fluxo único. O arquivo JSON preserva módulos, dados, funções, integrações, relações e todos os vínculos de testes.

`implementation_status` e `test_status` são independentes. Capabilities com implementação comprovada podem ser `CONFIRMADA/UNCOVERED`. Nenhuma recebeu `NÃO_TESTADA` apenas por faltar teste; essa ausência consta da dimensão específica. Quatro órfãs têm implementação aparente e nenhuma entrada confirmada. Flags e ramos condicionais são `PARCIAL`, quando limitam a capacidade, sem confundi-los com órfãos.

## Métricas

| Métrica | Quantidade |
| --- | --- |
| Capabilities | 140 |
| Com teste/auditoria relacionado | 103 |
| Sem teste | 37 |
| Com caso relacionado falhando | 14 |
| Órfãs / sem entrada | 4 |
| Quebradas | 1 |
| Status NÃO_TESTADA | 0 |
| Sem teste executado nesta etapa | 89 |
| Com integração externa (inclui Supabase) | 139 |
| Com integração externa além do banco | 114 |
| Relações | 36 |

### Por tipo

| Classificação | Quantidade |
| --- | --- |
| SYSTEM | 28 |
| USER_FACING | 29 |
| ADMIN | 76 |
| OPERATIONAL | 7 |

### Por status arquitetural

| Classificação | Quantidade |
| --- | --- |
| CONFIRMADA | 126 |
| PARCIAL | 9 |
| QUEBRADA | 1 |
| ÓRFÃ | 4 |
| NÃO_TESTADA | 0 |
| DESCONHECIDA | 0 |

### Por teste

| Classificação | Quantidade |
| --- | --- |
| UNKNOWN | 49 |
| UNCOVERED | 37 |
| PARTIAL | 32 |
| FAILING | 14 |
| COVERED | 8 |

### Por domain

| Classificação | Quantidade |
| --- | --- |
| domain.platform-runtime | 1 |
| domain.brand-presentation | 1 |
| domain.whatsapp-conversations | 7 |
| domain.customer-risk | 3 |
| domain.event-catalog | 6 |
| domain.event-administration | 22 |
| domain.reservation-inventory | 5 |
| domain.orders-payments | 6 |
| domain.ticketing-delivery | 8 |
| domain.admin-identity-access | 12 |
| domain.gate-admission | 11 |
| domain.courtesy | 7 |
| domain.combo-commerce-fulfillment | 22 |
| domain.table-map | 4 |
| domain.analytics-reporting | 15 |
| domain.background-processing | 5 |
| domain.codex-automation | 5 |

## Achados que alteram a leitura funcional

- **Consumo de combo bloqueado:** o leitor retorna para todo combo pago/emitido válido em `comboRedemptions.ts:1035–1231`. Mesmo após escolha confirmada, retorna em `:1079`; a RPC em `:1462` não é alcançada para concluir esse caso. `combo.redeem` é `QUEBRADA`, apesar de existir SQL funcional isolado.
- **Venda individual versus mesa:** ofertas programadas incluem ingressos individuais e participantes; a escolha de entrega exige mesa paga do mesmo cliente. A seleção normal de mesa está desabilitada globalmente. Não se presume que comprar combo implique conseguir consumi-lo.
- **Revogação de acesso não revoga sessão:** `pauseGateAccess` e `revokeFixedGateAccess` só alteram suas credenciais. `validateGateSessionToken` consulta a sessão/evento, sem revalidar a credencial de origem. Revogação por ID de sessão existe como serviço órfão.
- **Automação além da expiração:** o cron de reservas também lembra interesse sem compra, expira sessões administrativas e dispara ofertas de combo. A consulta administrativa de eventos pode marcar eventos/sessões passados como finished.
- **Batches não respondem clientes:** o webhook responde imediatamente. O cron reclama e cancela lotes; seus helpers não comprovam capacidade de resposta assíncrona ativa.
- **Criação web parcial:** `CreateEventModal.tsx:19` tem cinco diagnósticos de parse. O caminho API/WhatsApp permanece no catálogo; o erro não foi generalizado para o restante do sistema.

## Caminhos sobrepostos e granularidade

| Capability | Caminhos | Diferença |
| --- | --- | --- |
| payment.confirm | [src/app/api/webhook/payment/mercado-pago/route.ts:218](../../src/app/api/webhook/payment/mercado-pago/route.ts#L218); [src/lib/tickets/services/checkout.ts:1014](../../src/lib/tickets/services/checkout.ts#L1014) | Webhook autenticado e polling reconciliador chegam à mesma RPC confirm_paid_ticket_order. Webhook solicita distribuição de compras múltiplas; polling chama entrega diretamente. |
| combo.create | [src/app/api/admin/combo-offers/route.ts:233](../../src/app/api/admin/combo-offers/route.ts#L233); [src/lib/tickets/services/comboOffers.ts:394](../../src/lib/tickets/services/comboOffers.ts#L394) | Web insere diretamente oferta paused, escopo all_events e timing three_hours_before; WhatsApp usa createComboOffer com escopo/timing do diálogo e default do banco. Não consolidar como dois IDs. |
| event.list | [src/app/api/admin/events/route.ts:661](../../src/app/api/admin/events/route.ts#L661); [src/lib/tickets/services/adminEvents.ts:1046](../../src/lib/tickets/services/adminEvents.ts#L1046) | API fast usa RPC list_admin_events_fast; outros modos/WhatsApp consultam serviço e agregações. Payload e métricas diferem. |
| analytics.general_dashboard | [src/app/api/admin/events/route.ts:264](../../src/app/api/admin/events/route.ts#L264); [src/app/api/admin/events/route.ts:756](../../src/app/api/admin/events/route.ts#L756) | RPC get_admin_general_dashboard_summary e agregação TypeScript detalhada coexistem; não são prova de equivalência exata de métricas. |
| reservation.create | [src/lib/tickets/services/reservations.ts:689](../../src/lib/tickets/services/reservations.ts#L689); [src/lib/tickets/services/reservations.ts:436](../../src/lib/tickets/services/reservations.ts#L436); [src/lib/tickets/services/reservations.ts:561](../../src/lib/tickets/services/reservations.ts#L561) | Carrinho via reserve_ticket_cart é acessível pelo router. Reservas simples numeradas/não numeradas via reserve_seats permanecem sem consumidor src confirmado. RPC reserve_seats participa também da emissão administrativa em SQL. |
| messaging.respond | [src/lib/zapi/client.ts:58](../../src/lib/zapi/client.ts#L58); [scripts/codex-local-runner.mjs:292](../../scripts/codex-local-runner.mjs#L292) | Adapter de runtime e cliente próprio do executor enviam pelo mesmo provedor. Executor responde pedidos Codex e não grava whatsapp_messages; essa finalidade está em automation.notify. |
| gate.admit | [src/lib/tickets/services/gateValidation.ts:172](../../src/lib/tickets/services/gateValidation.ts#L172); [src/lib/tickets/services/gateValidation.ts:213](../../src/lib/tickets/services/gateValidation.ts#L213) | QR assinado e código manual convergem em validateTicketEntry/validate_ticket_entry; não há dois consumos independentes. |

Não há IDs distintos mantidos para a mesma ação apenas por haver dois arquivos ou endpoints. Foram separados relatórios independentes, criação/edição/status de catálogo e operações de acesso; renderizadores, hashes, factories, timestamps, wrappers e DTOs permanecem componentes. Candidatos rejeitados e todos os inventários reconciliados estão em [capability-matrix.md](capability-matrix.md).

## Correções factuais nas etapas anteriores

- 56 entradas: incluir npm-lint/npm-typecheck omitidos (antes 54). Corrigir /gate/session/validate para sessão/resumo e /kitchen/session/validate para sessão/pedidos, não consumo de ticket/combo. Arquivos: `system-knowledge/entrypoints.json`, `docs/system/entrypoints.md`. Evidência: [package.json:5](../../package.json#L5); [src/app/api/gate/session/validate/route.ts:48](../../src/app/api/gate/session/validate/route.ts#L48); [src/app/api/kitchen/session/validate/route.ts:66](../../src/app/api/kitchen/session/validate/route.ts#L66). 
- combo.redemption: CONFIRMADO -> PARCIALMENTE CONFIRMADO, responsabilidade esclarecida com bloqueio de consumo no leitor; ID mantido. Arquivos: `system-knowledge/modules.json`, `docs/system/modules.md`. Evidência: [src/lib/tickets/services/comboRedemptions.ts:1035](../../src/lib/tickets/services/comboRedemptions.ts#L1035); [src/lib/tickets/services/comboRedemptions.ts:1462](../../src/lib/tickets/services/comboRedemptions.ts#L1462). 
- Acrescentar resultados da execução da Etapa 3, preservando resultado histórico da suíte padrão; U-010 atualizado para validação parcial dos testes fora da suíte. Arquivos: `system-knowledge/tests.json`, `docs/system/tests-inventory.md`, `docs/system/unknowns.md`. Evidência: [system-knowledge/tests.json:1](../../system-knowledge/tests.json#L1). 39 arquivos, 296 casos, 276 aprovados, 20 falhas em 12 arquivos.

As observações anteriores de `npm test` foram preservadas como históricas. A execução desta etapa foi por arquivo: 39 arquivos, 296 casos, 276 aprovados e 20 falhas em 12 arquivos. Apenas os casos diretamente associados geram `FAILING` nas 14 capabilities relacionadas.

## Registros por domain

### domain.platform-runtime — Runtime e infraestrutura compartilhada

#### platform.limit_requests — Limitar requisições por origem e operação

Aplicar janela de requisições e responder 429 quando excedida.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `proxy`, `http-zapi-webhook`, `http-mp-webhook`, `http-checkout-pay`, `http-gate-scan`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `platform.rate-limit`, `platform.edge-proxy`.
- **Cadeia mínima:** proxy / http-zapi-webhook / http-mp-webhook / http-checkout-pay / http-gate-scan → consumeRateLimit / proxy → rate_limit_events, consume_rate_limit, integration-zapi → Aplicar janela de requisições e responder 429 quando excedida.
- **Testes:** `audit.rate-limit`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/security/rateLimit.ts:68](../../src/lib/security/rateLimit.ts#L68); [src/proxy.ts:153](../../src/proxy.ts#L153); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:447](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L447). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Dois caminhos técnicos: service via RPC e proxy via REST; mesma capacidade de limitar requisições.

### domain.brand-presentation — Marca e apresentação

#### brand.present_individual_offers — Apresentar ofertas individuais Rota5

Exibir apenas a oferta selecionada por preço e ocultar tipos free e setores mesa/bistrô.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNCOVERED / ROTA5.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `brand.presentation`, `catalog.inventory-read`.
- **Cadeia mínima:** http-zapi-webhook → filterPresentationTicketTypes / listAvailableSections → ticket_prices, venue_sections, integration-zapi → Exibir apenas a oferta selecionada por preço e ocultar tipos free e setores mesa/bistrô.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/sections.ts:99](../../src/lib/tickets/services/sections.ts#L99); [src/lib/tickets/services/sections.ts:197](../../src/lib/tickets/services/sections.ts#L197). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Constantes globais Rota5, sem seletor de tenant ou domain separado por marca.

### domain.whatsapp-conversations — Conversas e mensageria WhatsApp

#### messaging.receive — Receber mensagens WhatsApp sem duplicar entrada

Autenticar webhook, ignorar grupo/eco, identificar cliente e persistir inbound com chave de mensagem.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.webhook`, `messaging.messages`, `messaging.customers`, `messaging.conversations`.
- **Cadeia mínima:** http-zapi-webhook → POST / saveWhatsAppMessage → customers, conversations, whatsapp_messages, integration-zapi → Autenticar webhook, ignorar grupo/eco, identificar cliente e persistir inbound com chave de mensagem.
- **Testes:** `test-033`, `test-039`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/webhook/zapi/route.ts:832](../../src/app/api/webhook/zapi/route.ts#L832); [src/lib/tickets/services/messages.ts:116](../../src/lib/tickets/services/messages.ts#L116). Demais call sites e entradas no JSON canônico.

#### messaging.respond — Responder por texto e imagem no WhatsApp

Enviar respostas imediatas do router, separar imagem/texto e registrar resultado do provedor.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.webhook`, `integration.zapi`, `messaging.messages`, `messaging.public-dialog`.
- **Cadeia mínima:** http-zapi-webhook → sendOutboundMessage / sendZapiText / sendZapiImage → whatsapp_messages, integration-zapi → Enviar respostas imediatas do router, separar imagem/texto e registrar resultado do provedor.
- **Testes:** `test-025`, `test-039`, `test-042`, `test-043`; casos relacionados falhando: `test-025`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/webhook/zapi/route.ts:704](../../src/app/api/webhook/zapi/route.ts#L704); [src/lib/zapi/client.ts:58](../../src/lib/zapi/client.ts#L58); [src/lib/zapi/client.ts:124](../../src/lib/zapi/client.ts#L124). Demais call sites e entradas no JSON canônico.

#### messaging.start — Iniciar ou reiniciar atendimento público

Primeiro contato e comandos de reentrada produzem abertura e estado inicial.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.router`, `messaging.state`, `messaging.public-dialog`, `messaging.conversations`.
- **Cadeia mínima:** http-zapi-webhook → routeTicketMessage / buildInitialConversationState → conversations, integration-zapi → Primeiro contato e comandos de reentrada produzem abertura e estado inicial.
- **Testes:** `test-033`, `audit.whatsapp-intent-100`, `audit.whatsapp-intent-gate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204); [src/lib/tickets/conversationState.ts:680](../../src/lib/tickets/conversationState.ts#L680). Demais call sites e entradas no JSON canônico.

#### messaging.close — Encerrar atendimento por comando

SAIR encerra o contexto público; reentrada reinicia o atendimento.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.router`, `messaging.conversations`, `messaging.state`.
- **Cadeia mínima:** http-zapi-webhook → routeTicketMessage / updateConversationAfterMessage → conversations, integration-zapi → SAIR encerra o contexto público; reentrada reinicia o atendimento.
- **Testes:** `test-033`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204); [src/lib/tickets/services/conversations.ts:91](../../src/lib/tickets/services/conversations.ts#L91). Demais call sites e entradas no JSON canônico.

#### messaging.help — Pesquisar e consultar tópicos de ajuda

AJUDA recebe termos, pagina resultados, responde tópico e permite voltar ao contexto anterior.

- **Tipo / status / teste / marca:** USER_FACING / PARCIAL / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.router`, `messaging.public-dialog`.
- **Cadeia mínima:** http-zapi-webhook → handlePublicHelpMessage / buildPublicHelpSearchResponse / buildPublicHelpSelectedTopicResponse → conversations, integration-zapi → AJUDA recebe termos, pagina resultados, responde tópico e permite voltar ao contexto anterior.
- **Testes:** `test-032`; casos relacionados falhando: `test-032`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:2772](../../src/lib/tickets/router.ts#L2772); [src/lib/tickets/services/publicHelpFlow.ts:85](../../src/lib/tickets/services/publicHelpFlow.ts#L85); [src/lib/tickets/services/publicHelpFlow.ts:148](../../src/lib/tickets/services/publicHelpFlow.ts#L148). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Dois casos de busca/seleção falham na execução local. Estrutura de retorno existe; assertivas com texto esperado não comprovam falha de toda busca.

#### messaging.navigate_admin — Voltar entre telas do atendimento administrativo

Preservar pilha administrativa e restaurar submenu anterior.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.router`, `messaging.state`.
- **Cadeia mínima:** http-zapi-webhook → reconcileAdminNavigation / routeTicketMessage → conversations, integration-zapi → Preservar pilha administrativa e restaurar submenu anterior.
- **Testes:** `test-011`, `audit.admin-navigation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/adminNavigation.ts:127](../../src/lib/tickets/adminNavigation.ts#L127); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### messaging.protect_delivery — Evitar reenvio simultâneo de entregas pagas

Reivindicar cada entrega por chave idempotente e persistir sent/failed; nova tentativa depende de novo consumidor.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-mp-webhook`, `http-checkout-status`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.outbound-deliveries`, `ticket.delivery`, `combo.offers`.
- **Cadeia mínima:** http-mp-webhook / http-checkout-status / http-zapi-webhook → getOrCreateWhatsAppOutboundDelivery / claimWhatsAppOutboundDelivery / markWhatsAppOutboundDeliverySent / markWhatsAppOutboundDeliveryFailed → whatsapp_outbound_deliveries, claim_whatsapp_outbound_delivery, integration-zapi → Reivindicar cada entrega por chave idempotente e persistir sent/failed; nova tentativa depende de novo consumidor.
- **Testes:** `test-028`, `test-041`.
- **Requer / dependentes:** — / `ticket.deliver`, `combo.deliver_qr`.
- **Evidência:** [src/lib/tickets/services/whatsappOutboundDeliveries.ts:42](../../src/lib/tickets/services/whatsappOutboundDeliveries.ts#L42); [src/lib/tickets/services/whatsappOutboundDeliveries.ts:91](../../src/lib/tickets/services/whatsappOutboundDeliveries.ts#L91); [src/lib/tickets/services/whatsappOutboundDeliveries.ts:114](../../src/lib/tickets/services/whatsappOutboundDeliveries.ts#L114); [src/lib/tickets/services/whatsappOutboundDeliveries.ts:148](../../src/lib/tickets/services/whatsappOutboundDeliveries.ts#L148); [supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql:13](../../supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql#L13). Demais call sites e entradas no JSON canônico.

### domain.customer-risk — Cliente, telefone e risco do comprador

#### customer.identify — Reconhecer e cadastrar cliente pelo WhatsApp

Normalizar telefone e localizar ou criar identidade do comprador.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.customers`.
- **Cadeia mínima:** http-zapi-webhook → upsertCustomerFromWhatsApp → customers, integration-zapi → Normalizar telefone e localizar ou criar identidade do comprador.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/customers.ts:40](../../src/lib/tickets/services/customers.ts#L40). Demais call sites e entradas no JSON canônico.

#### customer.limit_reservations — Bloquear abuso na criação de reservas

Avaliar frequência, quantidade e histórico antes de reservar e registrar sinais.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `customer-risk.service`, `reservation.service`.
- **Cadeia mínima:** http-zapi-webhook → checkReservationRisk / recordReservationCreated → buyer_risk_events, customers, integration-zapi → Avaliar frequência, quantidade e histórico antes de reservar e registrar sinais.
- **Testes:** `audit.buyer-anti-abuse`.
- **Requer / dependentes:** — / `reservation.create`.
- **Evidência:** [src/lib/tickets/services/buyerRisk.ts:282](../../src/lib/tickets/services/buyerRisk.ts#L282); [src/lib/tickets/services/buyerRisk.ts:402](../../src/lib/tickets/services/buyerRisk.ts#L402). Demais call sites e entradas no JSON canônico.

#### customer.limit_checkout — Limitar tentativas abusivas de checkout

Recusar checkout temporariamente quando limites do comprador forem excedidos.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-checkout-mp`, `http-checkout-pay`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `customer-risk.service`, `payment.checkout`.
- **Cadeia mínima:** http-zapi-webhook / http-checkout-mp / http-checkout-pay → checkCheckoutRisk / createCheckoutForReservation → buyer_risk_events, customers, integration-zapi → Recusar checkout temporariamente quando limites do comprador forem excedidos.
- **Testes:** `audit.buyer-anti-abuse`.
- **Requer / dependentes:** — / `payment.checkout_create`.
- **Evidência:** [src/lib/tickets/services/buyerRisk.ts:434](../../src/lib/tickets/services/buyerRisk.ts#L434); [src/lib/tickets/services/checkout.ts:464](../../src/lib/tickets/services/checkout.ts#L464). Demais call sites e entradas no JSON canônico.

### domain.event-catalog — Catálogo e disponibilidade de eventos

#### catalog.search — Buscar eventos por texto, local e data

Retornar sessões relevantes usando busca ranqueada com fallback de consultas.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.events`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → searchEvents / searchEventsRankedInDatabase → events, event_sessions, event_aliases, venues, search_public_events_ranked, integration-zapi → Retornar sessões relevantes usando busca ranqueada com fallback de consultas.
- **Testes:** `test-033`, `audit.buy-flow`, `audit.whatsapp-intent-100`, `audit.whatsapp-intent-gate`, `audit.whatsapp-santana-search`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/events.ts:419](../../src/lib/tickets/services/events.ts#L419); [src/lib/tickets/services/events.ts:382](../../src/lib/tickets/services/events.ts#L382); [supabase/migrations/20260805000100_add_event_artist_icon.sql:16](../../supabase/migrations/20260805000100_add_event_artist_icon.sql#L16). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** RPC de ranking possui fallback TypeScript para indisponibilidade do caminho otimizado.

#### catalog.list — Listar programação pública em ordem de data

TODOS lista eventos elegíveis com informações, fotos e opções distribuídas em mensagens.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.events`, `messaging.public-dialog`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listAllPublicEventsByDate → events, event_sessions, venues, integration-zapi → TODOS lista eventos elegíveis com informações, fotos e opções distribuídas em mensagens.
- **Testes:** `test-029`, `test-033`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/events.ts:625](../../src/lib/tickets/services/events.ts#L625). Demais call sites e entradas no JSON canônico.

#### catalog.details — Consultar informações e situação de venda de evento

Mais informações preserva evento escolhido e oferece compra apenas se disponível.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.events`, `catalog.visibility`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildEventMoreInfoSelection / getCurrentPublicAvailabilityStatusForSession → events, event_sessions, session_seats, ticket_prices, integration-zapi → Mais informações preserva evento escolhido e oferece compra apenas se disponível.
- **Testes:** `test-030`, `test-035`; casos relacionados falhando: `test-030`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:1927](../../src/lib/tickets/router.ts#L1927); [src/lib/tickets/services/publicAvailability.ts:299](../../src/lib/tickets/services/publicAvailability.ts#L299). Demais call sites e entradas no JSON canônico.

#### catalog.offers — Consultar setores, preços e capacidade disponível

Apresentar ofertas por sessão com preço, taxa, janela de vendas e capacidade.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.inventory-read`, `catalog.visibility`.
- **Cadeia mínima:** http-zapi-webhook → listAvailableSections / listAvailableSeats → venue_sections, session_seats, ticket_prices, event_sessions, integration-zapi → Apresentar ofertas por sessão com preço, taxa, janela de vendas e capacidade.
- **Testes:** `test-030`, `audit.buy-flow`.
- **Requer / dependentes:** — / `reservation.create`.
- **Evidência:** [src/lib/tickets/services/sections.ts:197](../../src/lib/tickets/services/sections.ts#L197); [src/lib/tickets/services/seats.ts:124](../../src/lib/tickets/services/seats.ts#L124). Demais call sites e entradas no JSON canônico.

#### catalog.seat_map — Consultar mapa de assentos numerados

Renderizar assentos disponíveis/ocupados durante escolha e emissão de cortesia.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.inventory-read`, `table-map.catalog-render`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listSeatMap / buildSeatMapPngDataUrl → seats, session_seats, integration-zapi → Renderizar assentos disponíveis/ocupados durante escolha e emissão de cortesia.
- **Testes:** `audit.seatmap-qr-image`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/seats.ts:187](../../src/lib/tickets/services/seats.ts#L187); [src/lib/tickets/services/seatMapImage.ts:230](../../src/lib/tickets/services/seatMapImage.ts#L230). Demais call sites e entradas no JSON canônico.

#### catalog.enforce_visibility — Encerrar acesso público conforme janela da sessão

Aplicar finalidade compra/oferta/ingresso e horário de corte local de sessão.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`, `page-checkout`, `page-ticket`, `page-combo-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `catalog.visibility`, `catalog.events`.
- **Cadeia mínima:** http-zapi-webhook / page-checkout / page-ticket / page-combo-checkout → isPublicEventVisible / getValidatedEventSession → event_sessions, events, integration-zapi → Aplicar finalidade compra/oferta/ingresso e horário de corte local de sessão.
- **Testes:** `test-031`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/publicEventVisibility.ts:148](../../src/lib/tickets/services/publicEventVisibility.ts#L148); [src/lib/tickets/services/events.ts:731](../../src/lib/tickets/services/events.ts#L731). Demais call sites e entradas no JSON canônico.

### domain.event-administration — Administração de eventos

#### event.list — Buscar e listar eventos administrativos

Consultar eventos por status/texto e escopo do administrador, incluindo modo rápido.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-events`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-events / page-admin-events → listAdminEvents / GET → events, event_sessions, list_admin_events_fast, integration-zapi → Consultar eventos por status/texto e escopo do administrador, incluindo modo rápido.
- **Testes:** `test-003`, `test-008`, `test-009`, `test-010`, `audit.admin-event-creation-flow`, `audit.admin-profiles-permissions`; casos relacionados falhando: `test-009`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:1046](../../src/lib/tickets/services/adminEvents.ts#L1046); [src/app/api/admin/events/route.ts:661](../../src/app/api/admin/events/route.ts#L661); [supabase/migrations/20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql:1](../../supabase/migrations/20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql#L1). Demais call sites e entradas no JSON canônico.

#### event.inspect — Consultar detalhes administrativos de evento

Carregar configuração e inventário para edição.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → getAdminEventDetails / buildEventPayload → events, event_sessions, venue_sections, ticket_prices, session_seats, get_admin_event_editor_payload, integration-zapi → Carregar configuração e inventário para edição.
- **Testes:** `test-006`, `test-014`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:1311](../../src/lib/tickets/services/adminEvents.ts#L1311); [src/app/api/admin/events/[eventId]/route.ts:258](../../src/app/api/admin/events/[eventId]/route.ts#L258); [supabase/migrations/20260805000100_add_event_artist_icon.sql:128](../../supabase/migrations/20260805000100_add_event_artist_icon.sql#L128). Demais call sites e entradas no JSON canônico.

#### event.create — Criar evento com sessões e catálogo inicial

Criar evento e dados iniciais; formulário web atual tem erro de parse, caminho de serviço/WhatsApp existe.

- **Tipo / status / teste / marca:** ADMIN / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-events`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-events / page-admin-events → createAdminEvent / POST / handleAdminEventsFlow → events, event_sessions, venues, venue_sections, seats, session_seats, ticket_prices, integration-zapi → Criar evento e dados iniciais; formulário web atual tem erro de parse, caminho de serviço/WhatsApp existe.
- **Testes:** `test-002`, `test-006`, `audit.admin-event-creation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:1504](../../src/lib/tickets/services/adminEvents.ts#L1504); [src/app/api/admin/events/route.ts:893](../../src/app/api/admin/events/route.ts#L893); [src/lib/tickets/router.ts:7853](../../src/lib/tickets/router.ts#L7853). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** CreateEventModal.tsx:19 possui 5 diagnósticos de parse TSX. API/serviço e criação via WhatsApp permanecem estruturalmente presentes. Falhas intermediárias não são uma transação única.

#### event.edit — Editar dados e local de evento

Alterar título, artista, descrição, imagem e local sob autorização.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → updateAdminEvent / findOrCreateVenue / handleAdminEventsFlow → events, venues, integration-zapi → Alterar título, artista, descrição, imagem e local sob autorização.
- **Testes:** `test-006`, `audit.admin-event-edit-duplicate`, `audit.admin-profiles-permissions`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2189](../../src/lib/tickets/services/adminEvents.ts#L2189); [src/lib/tickets/services/adminEvents.ts:1416](../../src/lib/tickets/services/adminEvents.ts#L1416); [src/lib/tickets/router.ts:7853](../../src/lib/tickets/router.ts#L7853). Demais call sites e entradas no JSON canônico.

#### event.publish — Publicar evento e habilitar venda

Mudar estado para published; diálogo verifica inventário comprável, API aplica seu próprio contrato.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → handleAdminEventsFlow / updateAdminEvent → events, event_sessions, integration-zapi → Mudar estado para published; diálogo verifica inventário comprável, API aplica seu próprio contrato.
- **Testes:** `audit.admin-event-creation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:7853](../../src/lib/tickets/router.ts#L7853); [src/lib/tickets/services/adminEvents.ts:2189](../../src/lib/tickets/services/adminEvents.ts#L2189). Demais call sites e entradas no JSON canônico.

#### event.change_status — Pausar, encerrar ou reabrir evento

Alterar estado operacional do evento sem apagar dados de venda.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → handleAdminEventsFlow / updateAdminEvent → events, integration-zapi → Alterar estado operacional do evento sem apagar dados de venda.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:7853](../../src/lib/tickets/router.ts#L7853); [src/lib/tickets/services/adminEvents.ts:2189](../../src/lib/tickets/services/adminEvents.ts#L2189). Demais call sites e entradas no JSON canônico.

#### event.cancel — Cancelar evento por exclusão administrativa

DELETE grava status cancelled; não faz exclusão física nem estorno.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-admin-event-id / page-admin-events → DELETE / updateAdminEvent → events → DELETE grava status cancelled; não faz exclusão física nem estorno.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/admin/events/[eventId]/route.ts:959](../../src/app/api/admin/events/[eventId]/route.ts#L959); [src/lib/tickets/services/adminEvents.ts:2189](../../src/lib/tickets/services/adminEvents.ts#L2189). Demais call sites e entradas no JSON canônico.

#### event.duplicate — Duplicar evento e catálogo sem vendas

Copiar configuração para novo draft e inventário próprio; não copiar pedidos/ingressos.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → duplicateAdminEvent → events, event_sessions, venue_sections, seats, session_seats, ticket_prices, integration-zapi → Copiar configuração para novo draft e inventário próprio; não copiar pedidos/ingressos.
- **Testes:** `test-002`, `audit.admin-event-edit-duplicate`; casos relacionados falhando: `test-002`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:1673](../../src/lib/tickets/services/adminEvents.ts#L1673). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Copia artist_name do evento de origem (adminEvents.ts:1719), contrariando o teste que espera não herdar artista. A operação de duplicação existe; divergência registrada sem concluir que toda cópia é inoperante.

#### event.session_create — Adicionar sessão ao evento

Cadastrar data, horário, timezone e estado de nova sessão.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → createAdminSession / handleAdminEventOperationalSubmenus → event_sessions, integration-zapi → Cadastrar data, horário, timezone e estado de nova sessão.
- **Testes:** `audit.admin-event-creation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2209](../../src/lib/tickets/services/adminEvents.ts#L2209); [src/lib/tickets/router.ts:10151](../../src/lib/tickets/router.ts#L10151). Demais call sites e entradas no JSON canônico.

#### event.session_edit — Editar data e estado de sessão

Editar sessão existente com checagens de utilização no consumidor.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → updateAdminSession / getAdminSessionUsage → event_sessions, reservations, tickets, integration-zapi → Editar sessão existente com checagens de utilização no consumidor.
- **Testes:** `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2313](../../src/lib/tickets/services/adminEvents.ts#L2313); [src/lib/tickets/services/adminEvents.ts:2230](../../src/lib/tickets/services/adminEvents.ts#L2230). Demais call sites e entradas no JSON canônico.

#### event.section_create — Criar setor e oferta inicial

Cadastrar setor e, conforme o caminho, associar oferta e inventário às sessões.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → createAdminSection / createAdminEventSections → venue_sections, ticket_prices, seats, session_seats, integration-zapi → Cadastrar setor e, conforme o caminho, associar oferta e inventário às sessões.
- **Testes:** `audit.admin-event-creation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2384](../../src/lib/tickets/services/adminEvents.ts#L2384); [src/lib/tickets/services/adminEvents.ts:2158](../../src/lib/tickets/services/adminEvents.ts#L2158). Demais call sites e entradas no JSON canônico.

#### event.section_edit — Editar nome e estado de setor

Alterar metadados e ativação de setor existente.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → updateAdminSection → venue_sections, integration-zapi → Alterar metadados e ativação de setor existente.
- **Testes:** `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2408](../../src/lib/tickets/services/adminEvents.ts#L2408). Demais call sites e entradas no JSON canônico.

#### event.capacity_set — Alterar capacidade de setor com proteção de ocupação

Ajustar quantidade finita/ilimitada e inventário pela RPC que protege assentos em uso.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → updateAdminSectionCapacity → venue_sections, seats, session_seats, update_admin_section_capacity, integration-zapi → Ajustar quantidade finita/ilimitada e inventário pela RPC que protege assentos em uso.
- **Testes:** `test-013`, `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2426](../../src/lib/tickets/services/adminEvents.ts#L2426); [supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql:8](../../supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql#L8). Demais call sites e entradas no JSON canônico.

#### event.seats_create — Cadastrar assentos e associá-los às sessões

Criar códigos/layout de lugares e completar inventário por sessão.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → createAdminSeats / createMissingSessionSeats → seats, session_seats, integration-zapi → Criar códigos/layout de lugares e completar inventário por sessão.
- **Testes:** `audit.admin-event-creation-flow`, `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2522](../../src/lib/tickets/services/adminEvents.ts#L2522); [src/lib/tickets/services/adminEvents.ts:2635](../../src/lib/tickets/services/adminEvents.ts#L2635). Demais call sites e entradas no JSON canônico.

#### event.seats_block — Bloquear ou reativar assentos

Alterar estado de assentos após checar uso operacional.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → updateAdminSeatStatuses / getAdminSeatOperationalUsage → seats, session_seats, integration-zapi → Alterar estado de assentos após checar uso operacional.
- **Testes:** `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2599](../../src/lib/tickets/services/adminEvents.ts#L2599); [src/lib/tickets/services/adminEvents.ts:2564](../../src/lib/tickets/services/adminEvents.ts#L2564). Demais call sites e entradas no JSON canônico.

#### event.price_create — Criar oferta de ingresso em setor

Cadastrar tipo, nome, preço, taxa e janela de venda.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → createAdminPrice → ticket_prices, integration-zapi → Cadastrar tipo, nome, preço, taxa e janela de venda.
- **Testes:** `audit.admin-event-edit-duplicate`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2697](../../src/lib/tickets/services/adminEvents.ts#L2697). Demais call sites e entradas no JSON canônico.

#### event.price_edit — Editar oferta e nome impresso no ingresso

Alterar preço/taxa, label, início/fim e estado; contrato de UI de label falha.

- **Tipo / status / teste / marca:** ADMIN / PARCIAL / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-event-id / page-admin-events → updateAdminPrice / PATCH → ticket_prices, integration-zapi → Alterar preço/taxa, label, início/fim e estado; contrato de UI de label falha.
- **Testes:** `test-015`, `audit.admin-event-edit-duplicate`; casos relacionados falhando: `test-015`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminEvents.ts:2728](../../src/lib/tickets/services/adminEvents.ts#L2728); [src/app/api/admin/events/[eventId]/route.ts:681](../../src/app/api/admin/events/[eventId]/route.ts#L681). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** API aceita label e o diálogo chama updateAdminPrice, mas o contrato do campo web Nome no ingresso falha. Não se assume que a superfície visual ofereça toda a edição.

#### event.auto_finish — Marcar eventos passados como encerrados na consulta administrativa

Consulta de eventos para cortesias/portaria/relatórios pode persistir finished nos eventos publicados passados.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `courtesy.service`, `event-admin.service`.
- **Cadeia mínima:** http-zapi-webhook → finishPastPublishedEvents / listCourtesyEvents → events, event_sessions, integration-zapi → Consulta de eventos para cortesias/portaria/relatórios pode persistir finished nos eventos publicados passados.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:309](../../src/lib/tickets/services/adminCourtesies.ts#L309); [src/lib/tickets/services/adminCourtesies.ts:374](../../src/lib/tickets/services/adminCourtesies.ts#L374). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Disparado na leitura listCourtesyEvents, reutilizada por portaria/relatórios; não é um terceiro cron.

#### event.import_program — Importar programação textual para catálogo

Ler programacao.md, produzir prévia/verificação e inserir programação com --apply.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `script-import`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.program-importer`.
- **Cadeia mínima:** script-import → script/trigger citado → events, event_sessions, venues, venue_sections, ticket_prices, seats, session_seats → Ler programacao.md, produzir prévia/verificação e inserir programação com --apply.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/import-programacao-events.mjs:1](../../scripts/import-programacao-events.mjs#L1). Demais call sites e entradas no JSON canônico.

#### event.legacy_rename — Renomear setores e labels Black House

Inspecionar e aplicar nomenclatura fixa da Black House mediante --apply.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / BLACK_HOUSE.
- **Entradas:** `script-bh-rename`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.black-house-maintenance`.
- **Cadeia mínima:** script-bh-rename → script/trigger citado → venue_sections, ticket_prices → Inspecionar e aplicar nomenclatura fixa da Black House mediante --apply.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/rename-black-house-ticket-sections.mjs:1](../../scripts/rename-black-house-ticket-sections.mjs#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** POSSÍVEL_LEGADO: catálogo fixo Black House; compatibilidade com dados atuais não verificada.

#### event.legacy_split — Separar itens especiais Black House

Dividir configuração especial em setores/ofertas próprios com --apply.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / BLACK_HOUSE.
- **Entradas:** `script-bh-split`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.black-house-maintenance`.
- **Cadeia mínima:** script-bh-split → script/trigger citado → venue_sections, ticket_prices, seats, session_seats, reservation_items → Dividir configuração especial em setores/ofertas próprios com --apply.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/split-black-house-special-items.mjs:1](../../scripts/split-black-house-special-items.mjs#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** POSSÍVEL_LEGADO: catálogo fixo Black House; compatibilidade com dados atuais não verificada.

#### event.legacy_update — Reconfigurar setores e capacidade Black House

Reorganizar catálogo e inventário fixos de eventos Black House com --apply.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / BLACK_HOUSE.
- **Entradas:** `script-bh-update`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `event-admin.black-house-maintenance`.
- **Cadeia mínima:** script-bh-update → script/trigger citado → venue_sections, ticket_prices, seats, session_seats, reservations, reservation_items → Reorganizar catálogo e inventário fixos de eventos Black House com --apply.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/update-black-house-sectors.mjs:1](../../scripts/update-black-house-sectors.mjs#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** POSSÍVEL_LEGADO: catálogo fixo Black House; compatibilidade com dados atuais não verificada.

### domain.reservation-inventory — Reservas e inventário de sessão

#### reservation.cart — Montar e revisar carrinho de ingressos

Escolher setores, quantidades e lugares, adicionar itens e revisar antes de reservar.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.router`, `messaging.state`.
- **Cadeia mínima:** http-zapi-webhook → addSelectionToCart / routeTicketMessage → conversations, integration-zapi → Escolher setores, quantidades e lugares, adicionar itens e revisar antes de reservar.
- **Testes:** `audit.buy-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:2281](../../src/lib/tickets/router.ts#L2281); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### reservation.create — Reservar carrinho com preço e assentos consistentes

Criar reserva temporária e pedido com valores congelados; carrinho é consumidor atual, helpers simples não têm chamador de produção.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → reserveTicketCart / finalizeTicketCartReservation / reserveSelectedSeat / reserveUnnumberedSectionTickets → reservations, reservation_items, orders, session_seats, seats, reserve_ticket_cart, reserve_seats, integration-zapi → Criar reserva temporária e pedido com valores congelados; carrinho é consumidor atual, helpers simples não têm chamador de produção.
- **Testes:** `test-034`, `audit.buyer-anti-abuse`, `audit.buy-flow`, `audit.seatmap-qr-image`.
- **Requer / dependentes:** `customer.limit_reservations`, `catalog.offers` / `table_map.reserve`.
- **Evidência:** [src/lib/tickets/services/reservations.ts:689](../../src/lib/tickets/services/reservations.ts#L689); [src/lib/tickets/router.ts:2419](../../src/lib/tickets/router.ts#L2419); [src/lib/tickets/services/reservations.ts:436](../../src/lib/tickets/services/reservations.ts#L436); [src/lib/tickets/services/reservations.ts:561](../../src/lib/tickets/services/reservations.ts#L561); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1989](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1989); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1683](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1683). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** reserveSelectedSeat e reserveUnnumberedSectionTickets não têm consumidor atual em src; são caminhos alternativos aparentes para a mesma reserva. reserveTicketCart tem consumidor real no router. Não foram criados IDs duplicados pelos helpers.

#### reservation.resume — Retomar pagamento de reserva pendente

Reutilizar pendência ativa e obter link sem criar nova reserva simultânea.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.service`, `messaging.router`, `payment.checkout`.
- **Cadeia mínima:** http-zapi-webhook → findActivePendingReservationForCustomer / routeTicketMessage → reservations, orders, conversations, integration-zapi → Reutilizar pendência ativa e obter link sem criar nova reserva simultânea.
- **Testes:** `audit.buy-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/reservations.ts:301](../../src/lib/tickets/services/reservations.ts#L301); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### reservation.cancel — Cancelar reserva pendente e liberar assentos

Cancelar por cliente ou operador autorizado, rejeitando pedidos já pagos.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.service`, `admin.ticket-operations`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → cancelPendingReservationForCustomer / cancelAdminPendingReservation → reservations, orders, payments, session_seats, cancel_pending_reservation, integration-zapi → Cancelar por cliente ou operador autorizado, rejeitando pedidos já pagos.
- **Testes:** `audit.admin-orders-tickets`, `audit.cancel-pending-reservation-rpc`, `audit.reservation-expiration-cancel`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/reservations.ts:328](../../src/lib/tickets/services/reservations.ts#L328); [src/lib/tickets/services/adminTickets.ts:589](../../src/lib/tickets/services/adminTickets.ts#L589); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:4](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L4). Demais call sites e entradas no JSON canônico.

#### reservation.expire — Expirar reservas vencidas e liberar inventário

Executar expiração transacional pelo banco.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.expiry`, `background.expire-cron`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → expireReservationsAndNotify → reservations, orders, payments, session_seats, expire_reservations, integration-vercel → Executar expiração transacional pelo banco.
- **Testes:** `audit.reservation-expiration-cancel`.
- **Requer / dependentes:** — / `background.notify_expiry`.
- **Evidência:** [src/lib/tickets/services/reservationExpiry.ts:668](../../src/lib/tickets/services/reservationExpiry.ts#L668); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:529](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L529). Demais call sites e entradas no JSON canônico.

### domain.orders-payments — Pedidos e pagamentos

#### payment.checkout_create — Gerar link assinado de checkout

Gerar/reutilizar checkout associado a reserva válida e registrar referência externa.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-checkout-mp`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.checkout`, `payment.api-ui`, `payment.primitives`.
- **Cadeia mínima:** http-zapi-webhook / http-checkout-mp → createCheckoutForReservation → orders, reservations, payments, customers, integration-zapi → Gerar/reutilizar checkout associado a reserva válida e registrar referência externa.
- **Testes:** `audit.buyer-anti-abuse`, `audit.buy-flow`, `audit.mercado-pago-security`.
- **Requer / dependentes:** `customer.limit_checkout` / `payment.pay_pix`.
- **Evidência:** [src/lib/tickets/services/checkout.ts:464](../../src/lib/tickets/services/checkout.ts#L464). Demais call sites e entradas no JSON canônico.

#### payment.checkout_view — Abrir checkout e copiar Pix

Validar token e exibir pedido, valor, formulário e dados Pix no cliente web.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `page-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.checkout`, `payment.api-ui`.
- **Cadeia mínima:** page-checkout → getPublicCheckoutOrder / CheckoutPage → orders, reservations, customers, reservation_items, venue_sections → Validar token e exibir pedido, valor, formulário e dados Pix no cliente web.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/checkout.ts:772](../../src/lib/tickets/services/checkout.ts#L772); [src/app/checkout/[orderId]/page.tsx:26](../../src/app/checkout/[orderId]/page.tsx#L26). Demais call sites e entradas no JSON canônico.

#### payment.pay_pix — Gerar cobrança Pix de ingresso

Validar e-mail/documento e gerar cobrança Pix com idempotência e QR.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-checkout-pay`, `page-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.checkout`, `payment.api-ui`, `integration.mercado-pago`.
- **Cadeia mínima:** http-checkout-pay / page-checkout → paySelfHostedCheckout / createMercadoPagoPayment → payments, orders, integration-mercado-pago → Validar e-mail/documento e gerar cobrança Pix com idempotência e QR.
- **Testes:** `test-018`, `audit.mercado-pago-security`.
- **Requer / dependentes:** `payment.checkout_create` / —.
- **Evidência:** [src/lib/tickets/services/checkout.ts:1099](../../src/lib/tickets/services/checkout.ts#L1099); [src/lib/mercado-pago/client.ts:267](../../src/lib/mercado-pago/client.ts#L267). Demais call sites e entradas no JSON canônico.

#### payment.status — Consultar pagamento e reconciliar aprovação

Consultar estado; polling pode buscar aprovação no provedor, confirmar e entregar ingresso.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-checkout-status`, `page-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.checkout`, `payment.api-ui`.
- **Cadeia mínima:** http-checkout-status / page-checkout → reconcileApprovedCheckoutPayment / GET → orders, payments, tickets, confirm_paid_ticket_order, integration-mercado-pago → Consultar estado; polling pode buscar aprovação no provedor, confirmar e entregar ingresso.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/checkout.ts:1014](../../src/lib/tickets/services/checkout.ts#L1014); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:114](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L114); [src/app/api/checkout/status/route.ts:20](../../src/app/api/checkout/status/route.ts#L20). Demais call sites e entradas no JSON canônico.

#### payment.confirm — Confirmar pagamento de ingresso e emitir tickets

Autenticar notificação, consultar provedor e confirmar com validação de referência/valor e RPC idempotente.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-mp-webhook`, `http-checkout-status`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.webhook`, `payment.checkout`, `integration.mercado-pago`.
- **Cadeia mínima:** http-mp-webhook / http-checkout-status → POST / reconcileApprovedCheckoutPayment → payment_events, payments, orders, reservations, tickets, session_seats, confirm_paid_ticket_order, integration-mercado-pago → Autenticar notificação, consultar provedor e confirmar com validação de referência/valor e RPC idempotente.
- **Testes:** `audit.mercado-pago-security`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/webhook/payment/mercado-pago/route.ts:218](../../src/app/api/webhook/payment/mercado-pago/route.ts#L218); [src/lib/tickets/services/checkout.ts:1014](../../src/lib/tickets/services/checkout.ts#L1014); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:114](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L114). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Dois caminhos: webhook e reconciliação de status. Ambos chamam confirm_paid_ticket_order; webhook escolhe preferência para múltiplos tickets, reconciliação chama entrega diretamente.

#### payment.return_notice — Exibir aviso de retorno do pagamento

Renderizar páginas informativas estáticas de sucesso/pendência/falha; elas não consultam nem confirmam pagamento.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNCOVERED / BLACK_HOUSE.
- **Entradas:** `page-checkout-success`, `page-checkout-pending`, `page-checkout-failure`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.api-ui`, `brand.shell-assets`.
- **Cadeia mínima:** page-checkout-success / page-checkout-pending / page-checkout-failure → CheckoutSuccessPage / CheckoutPendingPage / CheckoutFailurePage → estado/renderização local → Renderizar páginas informativas estáticas de sucesso/pendência/falha; elas não consultam nem confirmam pagamento.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/checkout/success/page.tsx:3](../../src/app/checkout/success/page.tsx#L3); [src/app/checkout/pending/page.tsx:3](../../src/app/checkout/pending/page.tsx#L3); [src/app/checkout/failure/page.tsx:3](../../src/app/checkout/failure/page.tsx#L3). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Páginas estáticas com texto Black House; não participam de polling/reconciliação.

### domain.ticketing-delivery — Emissão e entrega de ingressos

#### ticket.deliver — Enviar ingresso pago e QR ao comprador

Enviar resumo e imagem assinada; marcar primeiro QR somente após envio aceito.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-mp-webhook`, `http-checkout-status`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.delivery`, `ticket.service`, `ticket.qr`, `messaging.outbound-deliveries`.
- **Cadeia mínima:** http-mp-webhook / http-checkout-status / http-zapi-webhook → deliverTicketsForOrder / generateTicketQrImage → tickets, customers, orders, conversations, whatsapp_messages, whatsapp_outbound_deliveries, mark_buyer_ticket_qr_delivered, integration-zapi → Enviar resumo e imagem assinada; marcar primeiro QR somente após envio aceito.
- **Testes:** `test-027`, `test-028`, `test-036`, `test-037`, `audit.mercado-pago-security`, `audit.seatmap-qr-image`.
- **Requer / dependentes:** `messaging.protect_delivery` / —.
- **Evidência:** [src/lib/tickets/services/ticketDelivery.ts:507](../../src/lib/tickets/services/ticketDelivery.ts#L507); [src/lib/tickets/services/ticketQrImage.ts:128](../../src/lib/tickets/services/ticketQrImage.ts#L128); [supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql:12](../../supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql#L12). Demais call sites e entradas no JSON canônico.

#### ticket.delivery_choice — Solicitar forma de distribuição de ingressos

Em compra múltipla, oferecer entrega ao comprador ou contatos de participantes.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-mp-webhook`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.delivery`, `messaging.router`, `ticket.service`.
- **Cadeia mínima:** http-mp-webhook / http-zapi-webhook → requestTicketDeliveryPreferenceForOrder / handleTicketDeliverySelection → tickets, conversations, whatsapp_outbound_deliveries, integration-zapi → Em compra múltipla, oferecer entrega ao comprador ou contatos de participantes.
- **Testes:** `test-036`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/ticketDelivery.ts:305](../../src/lib/tickets/services/ticketDelivery.ts#L305); [src/lib/tickets/router.ts:4593](../../src/lib/tickets/router.ts#L4593). Demais call sites e entradas no JSON canônico.

#### ticket.assign_participants — Distribuir ingressos para contatos participantes

Validar telefones/quantidade, reservar ingresso do comprador e associar participantes atomicamente.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → assignParticipantContactsToOrderTickets / handleTicketDeliverySelection → tickets, orders, customers, assign_participant_contacts_to_order_tickets, integration-zapi → Validar telefones/quantidade, reservar ingresso do comprador e associar participantes atomicamente.
- **Testes:** `test-036`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/tickets.ts:534](../../src/lib/tickets/services/tickets.ts#L534); [src/lib/tickets/router.ts:4593](../../src/lib/tickets/router.ts#L4593); [supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql:1](../../supabase/migrations/20260725000300_fix_assign_participant_contacts_nullif.sql#L1). Demais call sites e entradas no JSON canônico.

#### ticket.claim_participant — Solicitar ingresso atribuído a participante

Participante solicita seus ingressos por telefone; envio exitoso marca entrega.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.service`, `ticket.delivery`, `ticket.qr`, `messaging.router`, `messaging.webhook`.
- **Cadeia mínima:** http-zapi-webhook → handleParticipantTicketRequest / listParticipantTicketDeliveriesForPhone / markParticipantTicketDelivered → tickets, orders, whatsapp_messages, integration-zapi → Participante solicita seus ingressos por telefone; envio exitoso marca entrega.
- **Testes:** `test-036`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:4074](../../src/lib/tickets/router.ts#L4074); [src/lib/tickets/services/tickets.ts:686](../../src/lib/tickets/services/tickets.ts#L686); [src/lib/tickets/services/tickets.ts:750](../../src/lib/tickets/services/tickets.ts#L750). Demais call sites e entradas no JSON canônico.

#### ticket.resend — Reenviar ingresso pago ou de participante

REENVIAR lista grupos e devolve QR elegível respeitando titularidade e janela pública.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.service`, `ticket.delivery`, `ticket.qr`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → handlePaidTicketResendCommand / handlePaidTicketResendSelection / buildPaidTicketResendResult → tickets, orders, customers, integration-zapi → REENVIAR lista grupos e devolve QR elegível respeitando titularidade e janela pública.
- **Testes:** `test-036`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/router.ts:4469](../../src/lib/tickets/router.ts#L4469); [src/lib/tickets/router.ts:4542](../../src/lib/tickets/router.ts#L4542); [src/lib/tickets/router.ts:4450](../../src/lib/tickets/router.ts#L4450). Demais call sites e entradas no JSON canônico.

#### ticket.view — Visualizar ingresso por link assinado

Verificar assinatura e exibir ingresso válido com QR e dados públicos reduzidos.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `page-ticket`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `ticket.service`, `ticket.public-page`, `brand.shell-assets`.
- **Cadeia mínima:** page-ticket → getTicketBySignedToken → tickets, orders, event_sessions, events → Verificar assinatura e exibir ingresso válido com QR e dados públicos reduzidos.
- **Testes:** `test-031`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/tickets.ts:804](../../src/lib/tickets/services/tickets.ts#L804). Demais call sites e entradas no JSON canônico.

#### ticket.admin_lookup — Consultar ingressos e reservas por telefone ou código

Apresentar vendas, ingresso e pendências ao operador autorizado.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.ticket-operations`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → findAdminTicketsByPhone / findAdminTicketByCode / findAdminPendingReservationsByInput → tickets, reservations, orders, customers, integration-zapi → Apresentar vendas, ingresso e pendências ao operador autorizado.
- **Testes:** `audit.admin-orders-tickets`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminTickets.ts:464](../../src/lib/tickets/services/adminTickets.ts#L464); [src/lib/tickets/services/adminTickets.ts:512](../../src/lib/tickets/services/adminTickets.ts#L512); [src/lib/tickets/services/adminTickets.ts:489](../../src/lib/tickets/services/adminTickets.ts#L489). Demais call sites e entradas no JSON canônico.

#### ticket.validation_history — Consultar histórico detalhado de validações do ingresso

Serviço consulta eventos de validação, mas nenhum consumidor executável foi encontrado.

- **Tipo / status / teste / marca:** ADMIN / ÓRFÃ / UNCOVERED / COMMON.
- **Entradas:** —. Disponibilidade: NONE_CONFIRMED.
- **Módulos:** `admin.ticket-operations`.
- **Cadeia mínima:** entrada não confirmada → listAdminTicketValidations → ticket_validation_events → Serviço consulta eventos de validação, mas nenhum consumidor executável foi encontrado.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminTickets.ts:533](../../src/lib/tickets/services/adminTickets.ts#L533). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** ÓRFÃ: listAdminTicketValidations só possui definição em src; busca inclui scripts/.tools. O leitor de portaria possui resumo por outro caminho, não consome esta consulta detalhada. Auditoria antiga não comprova chamada atual ao serviço.

### domain.admin-identity-access — Identidade e autorização administrativa

#### admin.login — Autenticar administrador por challenge e passphrase

Emitir link temporário, validar segredo, consumir código e abrir sessão administrativa.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-login`, `page-admin-login`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.auth`, `admin.login-ui-api`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-login / page-admin-login → startAdminLogin / createAdminLoginChallenge / verifyAdminLoginChallengePassphrase / consumeAdminLoginChallengeCode → admin_users, admin_login_challenges, admin_auth_attempts, admin_sessions, integration-zapi → Emitir link temporário, validar segredo, consumir código e abrir sessão administrativa.
- **Testes:** `test-001`, `audit.admin-login-lockout`, `audit.admin-tokenized-login`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminLoginFlow.ts:56](../../src/lib/tickets/services/adminLoginFlow.ts#L56); [src/lib/tickets/services/adminAuth.ts:273](../../src/lib/tickets/services/adminAuth.ts#L273); [src/lib/tickets/services/adminAuth.ts:373](../../src/lib/tickets/services/adminAuth.ts#L373); [src/lib/tickets/services/adminAuth.ts:738](../../src/lib/tickets/services/adminAuth.ts#L738). Demais call sites e entradas no JSON canônico.

#### admin.web_session — Abrir editor por link administrativo assinado

Consumir link/challenge, gravar cookies de sessão/CSRF e abrir área autorizada.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-open`, `page-admin-events`, `page-admin-ops`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.auth`, `admin.login-ui-api`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-open / page-admin-events / page-admin-ops → createAdminEventEditorDirectLink / consumeAdminLoginChallengeForEventEditor / createAdminWebSession → admin_users, admin_sessions, admin_login_challenges, integration-zapi → Consumir link/challenge, gravar cookies de sessão/CSRF e abrir área autorizada.
- **Testes:** `test-016`, `audit.admin-tokenized-login`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminAuth.ts:606](../../src/lib/tickets/services/adminAuth.ts#L606); [src/lib/tickets/services/adminAuth.ts:537](../../src/lib/tickets/services/adminAuth.ts#L537); [src/lib/tickets/services/adminAuth.ts:1362](../../src/lib/tickets/services/adminAuth.ts#L1362). Demais call sites e entradas no JSON canônico.

#### admin.logout — Encerrar sessão administrativa por comando

Revogar sessão ativa e cancelar autenticação pendente ao sair.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.auth`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → revokeActiveAdminSessions / routeTicketMessage → admin_sessions, conversations, integration-zapi → Revogar sessão ativa e cancelar autenticação pendente ao sair.
- **Testes:** `test-001`, `audit.admin-navigation-flow`; casos relacionados falhando: `test-001`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminAuth.ts:1585](../../src/lib/tickets/services/adminAuth.ts#L1585); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### admin.authorize — Restringir ações por perfil e dono do evento

Aplicar permissões, escopo de proprietário e CSRF nas mutações web.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-events`, `http-admin-event-id`, `http-admin-combos`, `http-admin-combo-id`, `http-admin-map`, `http-admin-ops`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.auth`, `event-admin.api`, `combo.admin-ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-events / http-admin-event-id / http-admin-combos / http-admin-combo-id / http-admin-map / http-admin-ops → requireAdminPermission / requireAdminEventEditorSession / assertAdminCsrf → admin_users, admin_sessions, events, combo_offers, integration-zapi → Aplicar permissões, escopo de proprietário e CSRF nas mutações web.
- **Testes:** `test-010`, `test-016`, `audit.admin-profiles-permissions`, `audit.gate-phone-checkin`, `audit.system-closure`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminAuth.ts:1139](../../src/lib/tickets/services/adminAuth.ts#L1139); [src/lib/tickets/services/adminWebAuth.ts:11](../../src/lib/tickets/services/adminWebAuth.ts#L11); [src/lib/tickets/services/adminWebAuth.ts:59](../../src/lib/tickets/services/adminWebAuth.ts#L59). Demais call sites e entradas no JSON canônico.

#### admin.lockout — Bloquear tentativas repetidas de autenticação

Persistir falhas e aplicar bloqueios temporários/administrativos na autenticação.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-login`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.auth`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-login → recordAdminAuthFailure / getAdminAuthBlockStatus → admin_auth_attempts, admin_users, integration-zapi → Persistir falhas e aplicar bloqueios temporários/administrativos na autenticação.
- **Testes:** `test-001`, `audit.admin-login-lockout`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminAuth.ts:1039](../../src/lib/tickets/services/adminAuth.ts#L1039); [src/lib/tickets/services/adminAuth.ts:993](../../src/lib/tickets/services/adminAuth.ts#L993). Demais call sites e entradas no JSON canônico.

#### admin.users_list — Listar administradores e bloqueios

Exibir usuários/perfis e tentativas bloqueadas para gestão.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listAdminUsers / listBlockedAdminAuths → admin_users, admin_auth_attempts, integration-zapi → Exibir usuários/perfis e tentativas bloqueadas para gestão.
- **Testes:** `audit.admin-profiles-permissions`, `audit.admin-users-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:88](../../src/lib/tickets/services/adminUsers.ts#L88); [src/lib/tickets/services/adminUsers.ts:103](../../src/lib/tickets/services/adminUsers.ts#L103). Demais call sites e entradas no JSON canônico.

#### admin.user_create — Cadastrar administrador com perfil e senha

Criar administrador por telefone com passphrase armazenada em hash.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`, `admin.auth`.
- **Cadeia mínima:** http-zapi-webhook → createAdminUser → admin_users, integration-zapi → Criar administrador por telefone com passphrase armazenada em hash.
- **Testes:** `audit.admin-users-flow`, `audit.system-closure`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:243](../../src/lib/tickets/services/adminUsers.ts#L243). Demais call sites e entradas no JSON canônico.

#### admin.role_change — Alterar perfil de administrador

Mudar permissões preservando último root e revogando sessões.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → updateAdminRole → admin_users, admin_sessions, integration-zapi → Mudar permissões preservando último root e revogando sessões.
- **Testes:** `audit.admin-users-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:302](../../src/lib/tickets/services/adminUsers.ts#L302). Demais call sites e entradas no JSON canônico.

#### admin.user_disable — Desativar administrador

Desativar conta, preservar último root ativo e revogar sessões.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → disableAdminUser → admin_users, admin_sessions, integration-zapi → Desativar conta, preservar último root ativo e revogar sessões.
- **Testes:** `audit.admin-users-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:349](../../src/lib/tickets/services/adminUsers.ts#L349). Demais call sites e entradas no JSON canônico.

#### admin.user_reactivate — Reativar administrador

Reativar registro administrativo existente.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → reactivateAdminUser → admin_users, admin_sessions, integration-zapi → Reativar registro administrativo existente.
- **Testes:** `audit.admin-users-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:388](../../src/lib/tickets/services/adminUsers.ts#L388). Demais call sites e entradas no JSON canônico.

#### admin.password_renew — Renovar senha de administrador

Substituir hash e invalidar sessões do usuário.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`, `admin.auth`.
- **Cadeia mínima:** http-zapi-webhook → renewAdminPassphrase → admin_users, admin_sessions, integration-zapi → Substituir hash e invalidar sessões do usuário.
- **Testes:** `audit.admin-users-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:434](../../src/lib/tickets/services/adminUsers.ts#L434). Demais call sites e entradas no JSON canônico.

#### admin.unlock — Desbloquear autenticação de administrador

Remover bloqueio administrativo por telefone sob autorização.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `admin.users`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → unlockAdminAuthForPhone → admin_auth_attempts, integration-zapi → Remover bloqueio administrativo por telefone sob autorização.
- **Testes:** `audit.admin-login-lockout`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminUsers.ts:179](../../src/lib/tickets/services/adminUsers.ts#L179). Demais call sites e entradas no JSON canônico.

### domain.gate-admission — Portaria e controle de acesso

#### gate.access_create — Cadastrar acesso de portaria por evento

Cadastrar validador com telefone/senha e escopo de evento/sessão.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → createGateAccess → gate_accesses, events, event_sessions, integration-zapi → Cadastrar validador com telefone/senha e escopo de evento/sessão.
- **Testes:** `audit.gate-phone-checkin`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateAccesses.ts:72](../../src/lib/tickets/services/gateAccesses.ts#L72). Demais call sites e entradas no JSON canônico.

#### gate.access_list — Listar acessos de portaria de evento

Consultar operadores e acessos existentes.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listGateAccesses → gate_accesses, integration-zapi → Consultar operadores e acessos existentes.
- **Testes:** `audit.gate-phone-checkin`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateAccesses.ts:138](../../src/lib/tickets/services/gateAccesses.ts#L138). Demais call sites e entradas no JSON canônico.

#### gate.access_pause — Pausar acesso de portaria

Pausar autorização de acesso por evento; não revoga automaticamente sessões de leitor já emitidas.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → pauseGateAccess → gate_accesses, integration-zapi → Pausar autorização de acesso por evento; não revoga automaticamente sessões de leitor já emitidas.
- **Testes:** `audit.gate-phone-checkin`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateAccesses.ts:198](../../src/lib/tickets/services/gateAccesses.ts#L198). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Lacuna: sessões já emitidas continuam regidas pelo próprio status/TTL; pauseGateAccess só atualiza gate_accesses. Evidência: gateSessions.ts:282–409.

#### gate.fixed_create — Cadastrar acesso fixo de portaria

Cadastrar acesso por telefone/senha ligado ao administrador proprietário.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → createFixedGateAccess → fixed_gate_accesses, integration-zapi → Cadastrar acesso por telefone/senha ligado ao administrador proprietário.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/fixedGateAccesses.ts:57](../../src/lib/tickets/services/fixedGateAccesses.ts#L57). Demais call sites e entradas no JSON canônico.

#### gate.fixed_list — Listar acessos fixos de portaria

Exibir acessos fixos do proprietário.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listFixedGateAccesses → fixed_gate_accesses, integration-zapi → Exibir acessos fixos do proprietário.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/fixedGateAccesses.ts:100](../../src/lib/tickets/services/fixedGateAccesses.ts#L100). Demais call sites e entradas no JSON canônico.

#### gate.fixed_revoke — Revogar acesso fixo de portaria

Revogar credencial fixa; não altera sessões de leitor já emitidas.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → revokeFixedGateAccess → fixed_gate_accesses, integration-zapi → Revogar credencial fixa; não altera sessões de leitor já emitidas.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/fixedGateAccesses.ts:115](../../src/lib/tickets/services/fixedGateAccesses.ts#L115). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Lacuna: revokeFixedGateAccess não altera gate_sessions. Validação de sessão não consulta fixed_gate_accesses.

#### gate.open — Autenticar operador e abrir leitor de portaria

Emitir link opaco, verificar sessão e carregar resumo do leitor no escopo autorizado.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-gate-validate`, `page-gate`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.access-session`, `gate.ui-api`.
- **Cadeia mínima:** http-zapi-webhook / http-gate-validate / page-gate → createGateSession / createGateSessionForGateAccess / createGateSessionForFixedAccess / validateGateSessionToken → gate_sessions, gate_accesses, fixed_gate_accesses, event_sessions, events, integration-zapi → Emitir link opaco, verificar sessão e carregar resumo do leitor no escopo autorizado.
- **Testes:** `audit.gate-phone-checkin`, `audit.gate-wrong-event`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateSessions.ts:127](../../src/lib/tickets/services/gateSessions.ts#L127); [src/lib/tickets/services/gateAccesses.ts:226](../../src/lib/tickets/services/gateAccesses.ts#L226); [src/lib/tickets/services/fixedGateAccesses.ts:186](../../src/lib/tickets/services/fixedGateAccesses.ts#L186); [src/lib/tickets/services/gateSessions.ts:282](../../src/lib/tickets/services/gateSessions.ts#L282). Demais call sites e entradas no JSON canônico.

#### gate.consult — Consultar ingresso sem consumir entrada

Consultar código/QR e situação do ingresso sem marcar usado.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-gate-consult`, `page-gate`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.validation`, `gate.ui-api`.
- **Cadeia mínima:** http-gate-consult / page-gate → consultGateTicket → tickets, event_sessions, events → Consultar código/QR e situação do ingresso sem marcar usado.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateTicketConsultation.ts:29](../../src/lib/tickets/services/gateTicketConsultation.ts#L29). Demais call sites e entradas no JSON canônico.

#### gate.admit — Validar entrada por QR ou código

Validar assinatura, evento, sessão e uso anterior; consumir ingresso atomicamente e registrar tentativa.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-gate-scan`, `page-gate`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `gate.validation`, `gate.ui-api`, `gate.access-session`.
- **Cadeia mínima:** http-gate-scan / page-gate → validateGateScan / validateGateTicketCode / validateTicketEntry → tickets, ticket_validation_events, gate_sessions, validate_ticket_entry → Validar assinatura, evento, sessão e uso anterior; consumir ingresso atomicamente e registrar tentativa.
- **Testes:** `audit.gate-wrong-event`.
- **Requer / dependentes:** — / `combo.kitchen_release`.
- **Evidência:** [src/lib/tickets/services/gateValidation.ts:172](../../src/lib/tickets/services/gateValidation.ts#L172); [src/lib/tickets/services/gateValidation.ts:213](../../src/lib/tickets/services/gateValidation.ts#L213); [src/lib/tickets/services/gateValidation.ts:76](../../src/lib/tickets/services/gateValidation.ts#L76); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:2420](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L2420). Demais call sites e entradas no JSON canônico.

#### gate.session_revoke — Revogar uma sessão específica de leitor

Implementação de revogação direta por ID sem consumidor atual; revogação por acesso é outro caminho funcional.

- **Tipo / status / teste / marca:** ADMIN / ÓRFÃ / UNCOVERED / COMMON.
- **Entradas:** —. Disponibilidade: NONE_CONFIRMED.
- **Módulos:** `gate.access-session`.
- **Cadeia mínima:** entrada não confirmada → revokeGateSession → gate_sessions → Implementação de revogação direta por ID sem consumidor atual; revogação por acesso é outro caminho funcional.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateSessions.ts:488](../../src/lib/tickets/services/gateSessions.ts#L488). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** ÓRFÃ: nenhuma chamada a revokeGateSession localizada em src/scripts/.tools. Pausar gate_accesses ou revogar fixed_gate_accesses só altera esses registros; validateGateSessionToken não consulta o acesso de origem. Não se presume invalidação automática de links já emitidos.

#### gate.sessions_list — Listar sessões emitidas de leitores

Listar sessões por evento, finalidade e estado; nenhum consumidor atual do serviço foi localizado.

- **Tipo / status / teste / marca:** ADMIN / ÓRFÃ / UNCOVERED / COMMON.
- **Entradas:** —. Disponibilidade: NONE_CONFIRMED.
- **Módulos:** `gate.access-session`.
- **Cadeia mínima:** entrada não confirmada → listGateSessions → gate_sessions → Listar sessões por evento, finalidade e estado; nenhum consumidor atual do serviço foi localizado.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/gateSessions.ts:510](../../src/lib/tickets/services/gateSessions.ts#L510). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** ÓRFÃ: função listGateSessions sem chamador atual. Não confundir com listGateAccesses/listFixedGateAccesses, que possuem diálogo administrativo.

### domain.courtesy — Cortesias

#### courtesy.issue — Emitir cortesia administrativa para beneficiário

Validar limite/beneficiário, reservar lugares e emitir ingresso gratuito com identificação do emissor.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `courtesy.service`, `messaging.router`, `ticket.qr`.
- **Cadeia mínima:** http-zapi-webhook → issueAdminCourtesy → courtesies, tickets, orders, reservations, session_seats, customers, issue_admin_courtesy_order, issue_courtesy_order, integration-zapi → Validar limite/beneficiário, reservar lugares e emitir ingresso gratuito com identificação do emissor.
- **Testes:** `audit.admin-courtesies`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:738](../../src/lib/tickets/services/adminCourtesies.ts#L738); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:616](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L616); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:738](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L738). Demais call sites e entradas no JSON canônico.

#### courtesy.list — Listar cortesias de evento e localizar beneficiário

Consultar cortesias emitidas e selecionar alvo para suporte.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `courtesy.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → listCourtesiesForEvent / findCourtesyTargets → courtesies, tickets, customers, integration-zapi → Consultar cortesias emitidas e selecionar alvo para suporte.
- **Testes:** `audit.admin-courtesies`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:847](../../src/lib/tickets/services/adminCourtesies.ts#L847); [src/lib/tickets/services/adminCourtesies.ts:952](../../src/lib/tickets/services/adminCourtesies.ts#L952). Demais call sites e entradas no JSON canônico.

#### courtesy.resend — Reenviar QR de cortesia

Recompor e enviar QR da cortesia selecionada pelo operador.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `courtesy.service`, `ticket.qr`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildCourtesyDeliveryForCourtesyId / buildCourtesyDeliveryForPhone → courtesies, tickets, orders, customers, integration-zapi → Recompor e enviar QR da cortesia selecionada pelo operador.
- **Testes:** `test-031`, `audit.admin-courtesies`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:977](../../src/lib/tickets/services/adminCourtesies.ts#L977); [src/lib/tickets/services/adminCourtesies.ts:931](../../src/lib/tickets/services/adminCourtesies.ts#L931). Demais call sites e entradas no JSON canônico.

#### courtesy.cancel — Cancelar cortesia e devolver lugar

Cancelar cortesia específica, por beneficiário ou lote do evento e liberar inventário aplicável.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `courtesy.service`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → cancelCourtesyForEvent → courtesies, tickets, session_seats, integration-zapi → Cancelar cortesia específica, por beneficiário ou lote do evento e liberar inventário aplicável.
- **Testes:** `audit.admin-courtesies`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:997](../../src/lib/tickets/services/adminCourtesies.ts#L997). Demais call sites e entradas no JSON canônico.

#### courtesy.section_limit — Configurar limite de cortesias por setor

Persistir limites e labels por setor; aba visual está oculta por flag global.

- **Tipo / status / teste / marca:** ADMIN / PARCIAL / UNCOVERED / COMMON.
- **Entradas:** `http-admin-event-id`. Disponibilidade: CONDITIONAL_OR_HIDDEN.
- **Módulos:** `courtesy.service`, `event-admin.api`, `event-admin.ui`.
- **Cadeia mínima:** http-admin-event-id → upsertCourtesySectionLimits → courtesy_section_limits → Persistir limites e labels por setor; aba visual está oculta por flag global.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:1162](../../src/lib/tickets/services/adminCourtesies.ts#L1162). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** API PATCH existe e grava limites, mas aba courtesy do EventEditorModal é ocultada por constante false; consumidor humano visual não confirmado.

#### courtesy.event_limit — Configurar limite global de cortesias do evento

Upsert de limite por evento sem caminho atual de configuração; leitura é consumida na emissão.

- **Tipo / status / teste / marca:** ADMIN / ÓRFÃ / UNCOVERED / COMMON.
- **Entradas:** —. Disponibilidade: NONE_CONFIRMED.
- **Módulos:** `courtesy.service`.
- **Cadeia mínima:** entrada não confirmada → setCourtesyLimit → courtesy_limits → Upsert de limite por evento sem caminho atual de configuração; leitura é consumida na emissão.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminCourtesies.ts:1196](../../src/lib/tickets/services/adminCourtesies.ts#L1196). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** ÓRFÃ: setCourtesyLimit não tem chamador; getCourtesyLimit é usado pela emissão. Testes/auditorias podem semear tabela, o que não torna acessível a configuração pelo produto.

#### courtesy.public_issue — Emitir ingresso público de valor zero

Validar reserva de valor zero e limites antes de emitir; apresentação oculta tipo free, podendo haver ofertas não-free de valor zero.

- **Tipo / status / teste / marca:** USER_FACING / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: CONDITIONAL_OR_HIDDEN.
- **Módulos:** `ticket.free-issuance`, `messaging.router`, `courtesy.service`.
- **Cadeia mínima:** http-zapi-webhook → issuePublicFreeTicketsForOrder / finalizeTicketCartReservation → tickets, orders, reservations, courtesy_section_limits, issue_public_free_ticket_order, integration-zapi → Validar reserva de valor zero e limites antes de emitir; apresentação oculta tipo free, podendo haver ofertas não-free de valor zero.
- **Testes:** `test-031`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/publicFreeTickets.ts:219](../../src/lib/tickets/services/publicFreeTickets.ts#L219); [src/lib/tickets/router.ts:2419](../../src/lib/tickets/router.ts#L2419); [supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql:1041](../../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql#L1041). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** O router chama emissão zero-value e a RPC existe. A apresentação filtra ticket_type free e desliga cortesias; apenas zero-value de outro tipo ou contexto persistido pode alcançar o ramo. Nenhum dado remoto foi consultado.

### domain.combo-commerce-fulfillment — Ofertas, venda e entrega de combos

#### combo.list — Listar ofertas administrativas e métricas de combo

Consultar ofertas sob escopo administrativo com preço, estado e métricas.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-combos`, `http-admin-events`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`, `event-admin.api`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-combos / http-admin-events / page-admin-events → listComboOffers / GET → combo_offers, combo_offer_scopes, combo_orders, whatsapp_messages, integration-zapi → Consultar ofertas sob escopo administrativo com preço, estado e métricas.
- **Testes:** `test-004`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:482](../../src/lib/tickets/services/comboOffers.ts#L482); [src/app/api/admin/combo-offers/route.ts:205](../../src/app/api/admin/combo-offers/route.ts#L205). Demais call sites e entradas no JSON canônico.

#### combo.create — Criar oferta de combo

Cadastrar produto, descrição, imagem, preço e configuração de oferta; web e WhatsApp possuem implementação distinta.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-combos`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-combos / page-admin-events → createComboOffer / POST → combo_offers, combo_offer_scopes, integration-zapi → Cadastrar produto, descrição, imagem, preço e configuração de oferta; web e WhatsApp possuem implementação distinta.
- **Testes:** `test-004`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:394](../../src/lib/tickets/services/comboOffers.ts#L394); [src/app/api/admin/combo-offers/route.ts:233](../../src/app/api/admin/combo-offers/route.ts#L233). Demais call sites e entradas no JSON canônico.

#### combo.edit — Editar conteúdo e preço de combo

Alterar nome, descrição, imagem, preço original e preço cobrado.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-combo-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-combo-id / page-admin-events → updateComboOfferDetails → combo_offers, integration-zapi → Alterar nome, descrição, imagem, preço original e preço cobrado.
- **Testes:** `test-004`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:547](../../src/lib/tickets/services/comboOffers.ts#L547). Demais call sites e entradas no JSON canônico.

#### combo.scope — Definir eventos ou dias de oferta de combo

Configurar escopo por evento ou dias da semana.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-admin-combo-id`, `http-admin-combos`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-admin-combo-id / http-admin-combos / http-zapi-webhook → updateComboOfferScope / insertOfferScopes → combo_offer_scopes, combo_offers, integration-zapi → Configurar escopo por evento ou dias da semana.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:650](../../src/lib/tickets/services/comboOffers.ts#L650); [src/lib/tickets/services/comboOffers.ts:291](../../src/lib/tickets/services/comboOffers.ts#L291). Demais call sites e entradas no JSON canônico.

#### combo.schedule — Configurar horário e prioridade de oferta

Definir disparo após QR/horário personalizado e prioridade por evento.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-admin-combo-id`, `http-zapi-webhook`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-admin-combo-id / http-zapi-webhook / page-admin-events → updateComboOfferDetails / renumberEventScopedOfferPriorities → combo_offers, combo_offer_scopes, integration-zapi → Definir disparo após QR/horário personalizado e prioridade por evento.
- **Testes:** `test-019`, `test-021`; casos relacionados falhando: `test-019`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:547](../../src/lib/tickets/services/comboOffers.ts#L547); [src/lib/tickets/services/comboOffers.ts:319](../../src/lib/tickets/services/comboOffers.ts#L319). Demais call sites e entradas no JSON canônico.

#### combo.activate — Ativar ou pausar oferta de combo

Alterar active/paused para controlar elegibilidade da oferta.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-combo-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-combo-id / page-admin-events → updateComboOfferStatus → combo_offers, integration-zapi → Alterar active/paused para controlar elegibilidade da oferta.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:535](../../src/lib/tickets/services/comboOffers.ts#L535). Demais call sites e entradas no JSON canônico.

#### combo.duplicate — Duplicar oferta de combo pausada

Copiar oferta/escopos para novo registro pausado com vínculo de origem.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-zapi-webhook`, `http-admin-combo-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-zapi-webhook / http-admin-combo-id / page-admin-events → duplicateComboOffer → combo_offers, combo_offer_scopes, integration-zapi → Copiar oferta/escopos para novo registro pausado com vínculo de origem.
- **Testes:** `test-019`; casos relacionados falhando: `test-019`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:693](../../src/lib/tickets/services/comboOffers.ts#L693). Demais call sites e entradas no JSON canônico.

#### combo.delete — Excluir logicamente oferta de combo

Marcar deleted, preservando pedidos e histórico.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-admin-combo-id`, `http-zapi-webhook`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.admin-ui`.
- **Cadeia mínima:** http-admin-combo-id / http-zapi-webhook / page-admin-events → DELETE / updateComboOfferStatus → combo_offers, integration-zapi → Marcar deleted, preservando pedidos e histórico.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/admin/combo-offers/[offerId]/route.ts:323](../../src/app/api/admin/combo-offers/[offerId]/route.ts#L323); [src/lib/tickets/services/comboOffers.ts:535](../../src/lib/tickets/services/comboOffers.ts#L535). Demais call sites e entradas no JSON canônico.

#### combo.offer_send — Enviar oferta programada a comprador e participantes

Selecionar oferta elegível, respeitar atraso do QR, prioridade e dedupe; gerar pedido/link por destinatário.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `reservation.expiry`, `background.expire-cron`, `messaging.messages`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → sendScheduledComboOffers → tickets, customers, combo_offers, combo_offer_scopes, combo_offer_event_locks, combo_orders, whatsapp_messages, mark_buyer_ticket_qr_delivered, get_database_now, integration-zapi, integration-vercel → Selecionar oferta elegível, respeitar atraso do QR, prioridade e dedupe; gerar pedido/link por destinatário.
- **Testes:** `test-019`, `test-020`, `test-021`, `test-036`; casos relacionados falhando: `test-019`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:2352](../../src/lib/tickets/services/comboOffers.ts#L2352); [supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql:12](../../supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql#L12); [supabase/migrations/20260805000200_create_get_database_now_rpc.sql:1](../../supabase/migrations/20260805000200_create_get_database_now_rpc.sql#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Capacidade temporal estruturalmente ligada ao cron de expiração. Seleção inclui comprador e participantes após QR; não exige mesa paga.

#### combo.checkout_create — Criar ou renovar checkout de oferta

Criar pedido associado a ingresso/pedido origem ou renovar checkout pendente/expirado elegível.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.checkout-ui-api`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → createComboOrderForCheckout → combo_orders, combo_offers, event_sessions, get_database_now, integration-vercel → Criar pedido associado a ingresso/pedido origem ou renovar checkout pendente/expirado elegível.
- **Testes:** `test-036`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:868](../../src/lib/tickets/services/comboOffers.ts#L868); [supabase/migrations/20260805000200_create_get_database_now_rpc.sql:1](../../supabase/migrations/20260805000200_create_get_database_now_rpc.sql#L1). Demais call sites e entradas no JSON canônico.

#### combo.checkout_view — Abrir checkout assinado de combo

Validar token/janela e mostrar produto, preço e formulário Pix.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `page-combo-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.checkout-ui-api`, `brand.shell-assets`.
- **Cadeia mínima:** page-combo-checkout → getPublicComboCheckoutOrder → combo_orders, combo_offers, customers, event_sessions → Validar token/janela e mostrar produto, preço e formulário Pix.
- **Testes:** `test-031`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:1016](../../src/lib/tickets/services/comboOffers.ts#L1016). Demais call sites e entradas no JSON canônico.

#### combo.pay_pix — Gerar cobrança Pix de combo

Solicitar Pix ao provedor e reutilizar tentativa conforme estado/idempotência.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-combo-pay`, `page-combo-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.checkout-ui-api`, `integration.mercado-pago`.
- **Cadeia mínima:** http-combo-pay / page-combo-checkout → payComboCheckout → combo_payments, combo_orders, integration-mercado-pago → Solicitar Pix ao provedor e reutilizar tentativa conforme estado/idempotência.
- **Testes:** `test-018`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:1110](../../src/lib/tickets/services/comboOffers.ts#L1110). Demais call sites e entradas no JSON canônico.

#### combo.status — Consultar status do pedido de combo

Consultar situação mediante token; não equivale à reconciliação de ingresso.

- **Tipo / status / teste / marca:** USER_FACING / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-combo-status`, `page-combo-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.checkout-ui-api`.
- **Cadeia mínima:** http-combo-status / page-combo-checkout → getComboCheckoutStatus → combo_orders → Consultar situação mediante token; não equivale à reconciliação de ingresso.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:2010](../../src/lib/tickets/services/comboOffers.ts#L2010). Demais call sites e entradas no JSON canônico.

#### combo.confirm — Confirmar pagamento de combo

Validar referência/valor/vínculo e persistir pedido pago e pagamento aprovado em operações separadas.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-mp-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `payment.webhook`, `integration.mercado-pago`.
- **Cadeia mínima:** http-mp-webhook → confirmPaidComboOrder → combo_orders, combo_payments, payment_events, integration-mercado-pago → Validar referência/valor/vínculo e persistir pedido pago e pagamento aprovado em operações separadas.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:1697](../../src/lib/tickets/services/comboOffers.ts#L1697). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Atualiza pedido antes de inserir/atualizar pagamento. Uma falha intermediária pode deixar estado parcialmente persistido; caminho nominal existe, atomicidade de ponta a ponta não foi comprovada.

#### combo.deliver_qr — Emitir e enviar QR de combo pago

Criar credencial de resgate e enviar resumo/imagem com controle idempotente por entrega.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / COVERED / COMMON.
- **Entradas:** `http-mp-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `combo.qr`, `messaging.outbound-deliveries`.
- **Cadeia mínima:** http-mp-webhook → deliverComboOrder / generateComboQrImage → combo_redemptions, combo_orders, whatsapp_messages, whatsapp_outbound_deliveries, integration-zapi → Criar credencial de resgate e enviar resumo/imagem com controle idempotente por entrega.
- **Testes:** `test-022`, `test-027`, `test-028`.
- **Requer / dependentes:** `messaging.protect_delivery` / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:1348](../../src/lib/tickets/services/comboOffers.ts#L1348); [src/lib/tickets/services/comboQrImage.ts:198](../../src/lib/tickets/services/comboQrImage.ts#L198). Demais call sites e entradas no JSON canônico.

#### combo.expire — Expirar checkout de combo não pago

Marcar pedidos pendentes vencidos como expired.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.offers`, `reservation.expiry`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → expireComboOrders / sendScheduledComboOffers → combo_orders, integration-vercel → Marcar pedidos pendentes vencidos como expired.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/comboOffers.ts:1767](../../src/lib/tickets/services/comboOffers.ts#L1767); [src/lib/tickets/services/comboOffers.ts:2352](../../src/lib/tickets/services/comboOffers.ts#L2352). Demais call sites e entradas no JSON canônico.

#### combo.kitchen_open — Vincular dispositivo e abrir cozinha ou leitor de ofertas

Autenticar token de cozinha, vincular cookie do dispositivo e retornar pedidos/histórico.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-kitchen-open`, `http-kitchen-validate`, `page-kitchen-access`, `page-kitchen-session`, `page-offer-reader`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.kitchen-reader-ui-api`, `gate.access-session`, `combo.redemption`.
- **Cadeia mínima:** http-kitchen-open / http-kitchen-validate / page-kitchen-access / page-kitchen-session / page-offer-reader / http-zapi-webhook → claimKitchenSessionDevice / validateKitchenSessionToken / validateKitchenOrdersToken → gate_sessions, combo_redemptions, combo_redemption_events, event_sessions, integration-zapi → Autenticar token de cozinha, vincular cookie do dispositivo e retornar pedidos/histórico.
- **Testes:** —.
- **Requer / dependentes:** — / `combo.prepare`, `combo.delivery_prompt`.
- **Evidência:** [src/lib/tickets/services/gateSessions.ts:411](../../src/lib/tickets/services/gateSessions.ts#L411); [src/lib/tickets/services/comboRedemptions.ts:289](../../src/lib/tickets/services/comboRedemptions.ts#L289); [src/lib/tickets/services/comboRedemptions.ts:343](../../src/lib/tickets/services/comboRedemptions.ts#L343). Demais call sites e entradas no JSON canônico.

#### combo.kitchen_release — Liberar pedidos à cozinha após entrada do cliente

Após entrada autorizada, tornar combos visíveis à cozinha e avisar comprador.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-gate-scan`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.redemption`, `gate.validation`.
- **Cadeia mínima:** http-gate-scan → releaseComboOrdersForKitchenAfterGateEntry / validateTicketEntry → tickets, combo_redemptions, whatsapp_messages, conversations, integration-zapi → Após entrada autorizada, tornar combos visíveis à cozinha e avisar comprador.
- **Testes:** —.
- **Requer / dependentes:** `gate.admit` / —.
- **Evidência:** [src/lib/tickets/services/comboRedemptions.ts:492](../../src/lib/tickets/services/comboRedemptions.ts#L492); [src/lib/tickets/services/gateValidation.ts:76](../../src/lib/tickets/services/gateValidation.ts#L76). Demais call sites e entradas no JSON canônico.

#### combo.prepare — Registrar preparo e enviar QR atualizado para retirada

Mudar estado de cozinha, rotacionar token e notificar cliente sobre retirada.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-kitchen-prepare`, `page-kitchen-session`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.redemption`, `combo.kitchen-reader-ui-api`, `combo.qr`.
- **Cadeia mínima:** http-kitchen-prepare / page-kitchen-session → startKitchenOrderPreparation → combo_redemptions, whatsapp_messages, conversations, integration-zapi → Mudar estado de cozinha, rotacionar token e notificar cliente sobre retirada.
- **Testes:** `test-022`.
- **Requer / dependentes:** `combo.kitchen_open` / `combo.redeem`.
- **Evidência:** [src/lib/tickets/services/comboRedemptions.ts:641](../../src/lib/tickets/services/comboRedemptions.ts#L641). Demais call sites e entradas no JSON canônico.

#### combo.delivery_prompt — Solicitar escolha de entrega após leitura do QR

QR válido com mesa paga solicita escolha no WhatsApp sem consumir resgate; ingresso individual sem mesa é negado.

- **Tipo / status / teste / marca:** ADMIN / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-kitchen-scan`, `page-offer-reader`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.redemption`, `combo.kitchen-reader-ui-api`.
- **Cadeia mínima:** http-kitchen-scan / page-offer-reader → validateComboRedemptionScan → combo_redemptions, official_table_map_reservations, conversations, whatsapp_messages, combo_redemption_events, integration-zapi → QR válido com mesa paga solicita escolha no WhatsApp sem consumir resgate; ingresso individual sem mesa é negado.
- **Testes:** `test-036`.
- **Requer / dependentes:** `combo.kitchen_open`, `table_map.reserve` / —.
- **Evidência:** [src/lib/tickets/services/comboRedemptions.ts:935](../../src/lib/tickets/services/comboRedemptions.ts#L935). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Fluxo válido exige official_table_map_reservations.status=paid e propriedade do mesmo destinatário; ofertas atuais podem ser geradas a ingressos individuais e participantes sem mesa. Resultado negado nesses casos (comboRedemptions.ts:1049–1074).

#### combo.delivery_choose — Escolher atendimento por garçom ou entrega na mesa

OK/1 confirma escolha e local após revalidar compra e mesa; mantém ingresso de combo emitido.

- **Tipo / status / teste / marca:** USER_FACING / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.redemption`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → handleComboDeliveryConfirmation / confirmComboDeliveryChoice → combo_redemptions, official_table_map_reservations, combo_redemption_events, integration-zapi → OK/1 confirma escolha e local após revalidar compra e mesa; mantém ingresso de combo emitido.
- **Testes:** `test-036`.
- **Requer / dependentes:** `table_map.reserve` / —.
- **Evidência:** [src/lib/tickets/router.ts:4006](../../src/lib/tickets/router.ts#L4006); [src/lib/tickets/services/comboRedemptions.ts:1515](../../src/lib/tickets/services/comboRedemptions.ts#L1515). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Confirmação é implementada para cliente com reserva oficial paga; depender do prompt e de mesa limita disponibilidade no modo individual atual.

#### combo.redeem — Concluir resgate de combo e marcar entrega

Existe RPC de consumo, mas o ramo antecipado captura todo combo pago/emitido válido e impede chegar ao consumo pelo leitor atual.

- **Tipo / status / teste / marca:** ADMIN / QUEBRADA / UNKNOWN / COMMON.
- **Entradas:** `http-kitchen-scan`, `page-offer-reader`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `combo.redemption`, `combo.kitchen-reader-ui-api`.
- **Cadeia mínima:** http-kitchen-scan / page-offer-reader → validateComboRedemptionScan → combo_redemptions, combo_redemption_events, validate_combo_redemption → Existe RPC de consumo, mas o ramo antecipado captura todo combo pago/emitido válido e impede chegar ao consumo pelo leitor atual.
- **Testes:** `audit.combo-redemption-security`.
- **Requer / dependentes:** `combo.prepare` / —.
- **Evidência:** [src/lib/tickets/services/comboRedemptions.ts:935](../../src/lib/tickets/services/comboRedemptions.ts#L935); [supabase/migrations/20260629000300_require_combo_preparation_before_redemption.sql:1](../../supabase/migrations/20260629000300_require_combo_preparation_before_redemption.sql#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** QUEBRADA no caminho atual do leitor: o predicado paid + issued + escopo válido em comboRedemptions.ts:1035–1041 sempre retorna antes de :1231, inclusive após delivery_choice_confirmed_at (:1079). A RPC de consumo só é chamada em :1462. Os ramos de recuperação de preparo posteriores repetem esse predicado e ficam encobertos. A RPC pode operar isoladamente; não equivale ao leitor funcionando. Nenhum teste remoto foi executado.

### domain.table-map — Mapa oficial e lugares

#### table_map.preview — Consultar coordenadas e prévia do mapa oficial

Ler coordenadas persistidas e renderizar preview pelo mesmo renderizador do WhatsApp.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-admin-map`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `table-map.catalog-render`, `table-map.admin-ui-api`.
- **Cadeia mínima:** http-admin-map → getOfficialTableMapPlaces / renderOfficialTableMap / GET → official_table_map_places → Ler coordenadas persistidas e renderizar preview pelo mesmo renderizador do WhatsApp.
- **Testes:** `test-026`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/tableMap/officialPlaceCoordinates.ts:35](../../src/lib/tickets/tableMap/officialPlaceCoordinates.ts#L35); [src/lib/tickets/tableMap/renderOfficialTableMap.ts:207](../../src/lib/tickets/tableMap/renderOfficialTableMap.ts#L207); [src/app/api/admin/table-map/route.ts:19](../../src/app/api/admin/table-map/route.ts#L19). Demais call sites e entradas no JSON canônico.

#### table_map.calibrate — Calibrar e salvar coordenadas dos lugares oficiais

Validar metadados fixos e persistir coordenadas; componente visual existe, aba está oculta.

- **Tipo / status / teste / marca:** ADMIN / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-admin-map`. Disponibilidade: CONDITIONAL_OR_HIDDEN.
- **Módulos:** `table-map.admin-ui-api`, `table-map.catalog-render`.
- **Cadeia mínima:** http-admin-map → persistOfficialTableMapPlaces / PUT → official_table_map_places → Validar metadados fixos e persistir coordenadas; componente visual existe, aba está oculta.
- **Testes:** `test-026`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/tableMap/persistOfficialPlaces.ts:109](../../src/lib/tickets/tableMap/persistOfficialPlaces.ts#L109); [src/app/api/admin/table-map/route.ts:71](../../src/app/api/admin/table-map/route.ts#L71). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** API PUT e calibrador implementados; EventEditorModal bloqueia/oculta a aba tableMap com flag false.

#### table_map.reserve — Escolher e reservar mesa ou bistrô oficial

Reservar lugar compatível com quantidade e sessão; entrada normal está desabilitada pela flag Rota5.

- **Tipo / status / teste / marca:** USER_FACING / PARCIAL / PARTIAL / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: CONDITIONAL_OR_HIDDEN.
- **Módulos:** `table-map.reservation`, `table-map.catalog-render`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → reserveOfficialTableMapPlace / buildOfficialTableMapAvailabilityImage / finalizeTicketCartReservation → official_table_map_reservations, reservations, orders, reserve_official_table_map_place, integration-zapi → Reservar lugar compatível com quantidade e sessão; entrada normal está desabilitada pela flag Rota5.
- **Testes:** `test-026`.
- **Requer / dependentes:** `reservation.create` / `combo.delivery_prompt`, `combo.delivery_choose`.
- **Evidência:** [src/lib/tickets/services/officialTableMapReservations.ts:182](../../src/lib/tickets/services/officialTableMapReservations.ts#L182); [src/lib/tickets/services/officialTableMapReservations.ts:147](../../src/lib/tickets/services/officialTableMapReservations.ts#L147); [src/lib/tickets/router.ts:2419](../../src/lib/tickets/router.ts#L2419); [supabase/migrations/20260724000600_scope_official_table_map_reservations_by_session.sql:33](../../supabase/migrations/20260724000600_scope_official_table_map_reservations_by_session.sql#L33). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** A seleção normal é pulada em router.ts:18562 quando ROTA5_PRESENTATION_TABLE_MAP_ENABLED=false. Estados persistidos antigos podem alcançar o serviço; isso não comprova entrada normal disponível.

#### table_map.sync_status — Sincronizar mesa com pagamento, cancelamento e expiração

Trigger acompanha mudança de estado da reserva e atualiza status da mesa correspondente.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-cron-expire`, `http-mp-webhook`, `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `table-map.reservation`, `reservation.service`, `payment.webhook`.
- **Cadeia mínima:** http-cron-expire / http-mp-webhook / http-zapi-webhook → script/trigger citado → official_table_map_reservations, reservations, sync_official_table_map_reservation_status, integration-zapi → Trigger acompanha mudança de estado da reserva e atualiza status da mesa correspondente.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [supabase/migrations/20260722000800_create_official_table_map_reservations.sql:1](../../supabase/migrations/20260722000800_create_official_table_map_reservations.sql#L1); [supabase/migrations/20260722000800_create_official_table_map_reservations.sql:164](../../supabase/migrations/20260722000800_create_official_table_map_reservations.sql#L164). Demais call sites e entradas no JSON canônico.

### domain.analytics-reporting — Relatórios e analytics administrativos

#### analytics.sales — Gerar relatório de vendas por evento

Selecionar eventos/período e consolidar vendas, capacidade, entradas e cortesias do relatório sales_event.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / buildAdminSalesEventReports → tickets, orders, payments, session_seats, ticket_prices, event_sessions, integration-zapi → Selecionar eventos/período e consolidar vendas, capacidade, entradas e cortesias do relatório sales_event.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/services/adminReports.ts:1215](../../src/lib/tickets/services/adminReports.ts#L1215). Demais call sites e entradas no JSON canônico.

#### analytics.division — Calcular divisão financeira por período

Calcular valor recebido e divisão fixa registrada no relatório.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminDivisionReport → tickets, orders, payments, division_settlements, integration-zapi → Calcular valor recebido e divisão fixa registrada no relatório.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / `analytics.settle`.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:985](../../src/lib/tickets/services/adminReports.ts#L985). Demais call sites e entradas no JSON canônico.

#### analytics.settle — Registrar baixa da divisão financeira

Marcar período como pago com snapshot de valor e administrador; não transfere dinheiro.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → markDivisionSettlementPaid → division_settlements, integration-zapi → Marcar período como pago com snapshot de valor e administrador; não transfere dinheiro.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** `analytics.division` / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:617](../../src/lib/tickets/services/adminReports.ts#L617). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Registra baixa contábil local, com percentage_basis_points=500; não há transferência ou payout financeiro.

#### analytics.general_dashboard — Consultar dashboard geral de eventos

Exibir séries e totais agregados; possui RPC resumida e agregação detalhada TypeScript.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-admin-events`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.admin-dashboard-ui`, `event-admin.api`.
- **Cadeia mínima:** http-admin-events / page-admin-events → buildGeneralDashboard / GET → events, tickets, combo_orders, combo_redemptions, ticket_validation_events, get_admin_general_dashboard_summary → Exibir séries e totais agregados; possui RPC resumida e agregação detalhada TypeScript.
- **Testes:** `test-005`, `test-014`; casos relacionados falhando: `test-005`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/admin/events/route.ts:264](../../src/app/api/admin/events/route.ts#L264); [src/app/api/admin/events/route.ts:661](../../src/app/api/admin/events/route.ts#L661); [supabase/migrations/20260723000700_optimize_admin_event_detail_and_dashboard.sql:209](../../supabase/migrations/20260723000700_optimize_admin_event_detail_and_dashboard.sql#L209). Demais call sites e entradas no JSON canônico.

#### analytics.event_dashboard — Consultar dashboard de um evento

Calcular vendas, ocupação, entradas e combos por período/evento.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.admin-dashboard-ui`, `event-admin.api`.
- **Cadeia mínima:** http-admin-event-id / page-admin-events → buildEventDashboard → tickets, session_seats, ticket_prices, combo_orders, combo_redemptions, ticket_validation_events → Calcular vendas, ocupação, entradas e combos por período/evento.
- **Testes:** `test-005`; casos relacionados falhando: `test-005`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/admin/events/[eventId]/route.ts:298](../../src/app/api/admin/events/[eventId]/route.ts#L298). Demais call sites e entradas no JSON canônico.

#### analytics.contacts — Consultar contatos e histórico de atendimento

Combinar atividade de clientes com compra/reserva e tentativas outbound; sem prova de leitura humana da mensagem.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-admin-events`, `http-admin-event-id`, `page-admin-events`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.contacts`, `analytics.admin-dashboard-ui`, `event-admin.api`.
- **Cadeia mínima:** http-admin-events / http-admin-event-id / page-admin-events → getAdminContactActivity → customers, conversations, whatsapp_messages, reservations, orders, admin_users → Combinar atividade de clientes com compra/reserva e tentativas outbound; sem prova de leitura humana da mensagem.
- **Testes:** `test-017`, `test-040`; casos relacionados falhando: `test-017`, `test-040`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminContactAnalytics.ts:284](../../src/lib/tickets/services/adminContactAnalytics.ts#L284). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Resultados sent/failed significam tentativa/aceitação no provedor, não recebimento ou leitura pelo destinatário. Falhas observadas incluem contratos de UI e filtro em arquivos antigos.

#### analytics.operational — Consultar painel operacional de conversão e alertas

Consultar RPC e renderizar indicadores, séries e alertas operacionais.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-admin-ops`, `page-admin-ops`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.operational-dashboard`.
- **Cadeia mínima:** http-admin-ops / page-admin-ops → GET → whatsapp_messages, customers, reservations, orders, payments, combo_orders, tickets, get_admin_intelligence_dashboard → Consultar RPC e renderizar indicadores, séries e alertas operacionais.
- **Testes:** `test-012`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/admin/operational-dashboard/route.ts:151](../../src/app/api/admin/operational-dashboard/route.ts#L151); [supabase/migrations/20260725001000_create_admin_intelligence_dashboard_rpc.sql:1](../../supabase/migrations/20260725001000_create_admin_intelligence_dashboard_rpc.sql#L1). Demais call sites e entradas no JSON canônico.

#### analytics.track_click — Registrar abertura de checkout para conversão

Persistir instante de abertura e contagem de cliques nos metadados do checkout de ingresso ou combo.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `page-checkout`, `page-combo-checkout`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `payment.checkout`, `combo.offers`.
- **Cadeia mínima:** page-checkout / page-combo-checkout → trackTicketCheckoutClick / trackComboCheckoutClick → payments, combo_orders → Persistir instante de abertura e contagem de cliques nos metadados do checkout de ingresso ou combo.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/checkout.ts:926](../../src/lib/tickets/services/checkout.ts#L926); [src/lib/tickets/services/comboOffers.ts:1069](../../src/lib/tickets/services/comboOffers.ts#L1069). Demais call sites e entradas no JSON canônico.

#### analytics.general_report — Gerar resumo administrativo geral

Agregar receita, vendas e ocupação em relatório geral por período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminGeneralReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Agregar receita, vendas e ocupação em relatório geral por período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:916](../../src/lib/tickets/services/adminReports.ts#L916); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.section_sales — Gerar relatório de vendas por setor

Opção sales_section agrega ingressos, valores, gratuidades e ocupação por setor.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Opção sales_section agrega ingressos, valores, gratuidades e ocupação por setor.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.pending_orders — Relatar pedidos com pagamento pendente

Opção pending_payments lista reservas/pedidos aguardando pagamento no período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Opção pending_payments lista reservas/pedidos aguardando pagamento no período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.expired_reservations — Relatar reservas expiradas ou canceladas

Opção expired_cancelled_reservations lista perdas e liberações de reserva por período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Opção expired_cancelled_reservations lista perdas e liberações de reserva por período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.gate_checkins — Relatar validações de entrada

Opção gate_checkins apresenta entradas permitidas e tentativas recusadas por período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Opção gate_checkins apresenta entradas permitidas e tentativas recusadas por período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.ticket_usage — Relatar ingressos usados e não usados

Opção ticket_usage compara utilização de ingressos emitidos no período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Opção ticket_usage compara utilização de ingressos emitidos no período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

#### analytics.courtesies — Relatar cortesias emitidas

Ramo final do relatório apresenta cortesias e beneficiários conforme período.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `analytics.reports`, `messaging.router`.
- **Cadeia mínima:** http-zapi-webhook → buildAdminReport / routeTicketMessage → tickets, orders, payments, reservations, courtesies, ticket_validation_events, session_seats, integration-zapi → Ramo final do relatório apresenta cortesias e beneficiários conforme período.
- **Testes:** `audit.admin-reports`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/adminReports.ts:1259](../../src/lib/tickets/services/adminReports.ts#L1259); [src/lib/tickets/router.ts:12204](../../src/lib/tickets/router.ts#L12204). Demais call sites e entradas no JSON canônico.

### domain.background-processing — Processamento agendado

#### background.notify_expiry — Avisar comprador de reserva expirada

Revisitar reservas expiradas recentes, evitar aviso já enviado e limpar contexto.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.expiry`, `background.expire-cron`, `messaging.messages`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → notifyExpiredReservation / expireReservationsAndNotify → reservations, whatsapp_messages, conversations, integration-zapi, integration-vercel → Revisitar reservas expiradas recentes, evitar aviso já enviado e limpar contexto.
- **Testes:** `audit.reservation-expiration-cancel`.
- **Requer / dependentes:** `reservation.expire` / —.
- **Evidência:** [src/lib/tickets/services/reservationExpiry.ts:173](../../src/lib/tickets/services/reservationExpiry.ts#L173); [src/lib/tickets/services/reservationExpiry.ts:668](../../src/lib/tickets/services/reservationExpiry.ts#L668). Demais call sites e entradas no JSON canônico.

#### background.remind_interest — Lembrar interesse em evento sem compra

Selecionar conversas interessadas sem compra gerada e enviar lembrete deduplicado.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.expiry`, `background.expire-cron`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → sendBuyerInterestReminders / notifyBuyerInterest → conversations, reservations, whatsapp_messages, integration-zapi, integration-vercel → Selecionar conversas interessadas sem compra gerada e enviar lembrete deduplicado.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/reservationExpiry.ts:445](../../src/lib/tickets/services/reservationExpiry.ts#L445); [src/lib/tickets/services/reservationExpiry.ts:388](../../src/lib/tickets/services/reservationExpiry.ts#L388). Demais call sites e entradas no JSON canônico.

#### background.expire_admin — Expirar sessão administrativa e avisar operador

Marcar sessões vencidas e restaurar contexto público após aviso.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNKNOWN / COMMON.
- **Entradas:** `http-cron-expire`, `trigger-cron-expire`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `reservation.expiry`, `background.expire-cron`, `admin.auth`.
- **Cadeia mínima:** http-cron-expire / trigger-cron-expire → expireAdminSessionsAndNotify / notifyExpiredAdminSession → admin_sessions, customers, conversations, whatsapp_messages, integration-zapi, integration-vercel → Marcar sessões vencidas e restaurar contexto público após aviso.
- **Testes:** `audit.admin-navigation-flow`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/reservationExpiry.ts:602](../../src/lib/tickets/services/reservationExpiry.ts#L602); [src/lib/tickets/services/reservationExpiry.ts:535](../../src/lib/tickets/services/reservationExpiry.ts#L535). Demais call sites e entradas no JSON canônico.

#### background.close_inactive — Finalizar atendimento após inatividade

Avisar encerramento e fechar/resetar conversa aberta inativa, com controle por mensagem finalizadora.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / FAILING / COMMON.
- **Entradas:** `http-cron-batches`, `trigger-cron-batches`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.finalizer`, `background.batch-cron`, `messaging.state`.
- **Cadeia mínima:** http-cron-batches / trigger-cron-batches → finalizeInactiveWhatsAppConversations / finalizeConversation → conversations, customers, whatsapp_messages, integration-zapi, integration-vercel → Avisar encerramento e fechar/resetar conversa aberta inativa, com controle por mensagem finalizadora.
- **Testes:** `test-023`, `test-038`; casos relacionados falhando: `test-038`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/services/conversationFinalizer.ts:205](../../src/lib/tickets/services/conversationFinalizer.ts#L205); [src/lib/tickets/services/conversationFinalizer.ts:157](../../src/lib/tickets/services/conversationFinalizer.ts#L157). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Teste de contrato espera literal antigo e falha; função utiliza TICKET_MESSAGES.conversationClosed e o cron a chama. Não se classificou como quebrada pelo contrato textual.

#### background.cancel_batches — Cancelar lotes pendentes do pipeline desativado

Reclamar lotes e cancelar com customer_reply_pipeline_disabled; erros podem ser reagendados com limite.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / PARTIAL / COMMON.
- **Entradas:** `http-cron-batches`, `trigger-cron-batches`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `messaging.batches`, `background.batch-cron`.
- **Cadeia mínima:** http-cron-batches / trigger-cron-batches → processDueWhatsAppMessageBatches / processClaimedBatch / rescheduleClaimedBatch → whatsapp_message_batches, whatsapp_message_batch_messages, claim_due_whatsapp_message_batches, finish_whatsapp_message_batch, reschedule_whatsapp_message_batch, integration-vercel → Reclamar lotes e cancelar com customer_reply_pipeline_disabled; erros podem ser reagendados com limite.
- **Testes:** `test-038`.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/app/api/cron/process-whatsapp-batches/route.ts:109](../../src/app/api/cron/process-whatsapp-batches/route.ts#L109); [src/app/api/cron/process-whatsapp-batches/route.ts:89](../../src/app/api/cron/process-whatsapp-batches/route.ts#L89); [src/app/api/cron/process-whatsapp-batches/route.ts:56](../../src/app/api/cron/process-whatsapp-batches/route.ts#L56); [supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql:1](../../supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql#L1); [supabase/migrations/20260720000100_add_whatsapp_batch_retry_controls.sql:91](../../supabase/migrations/20260720000100_add_whatsapp_batch_retry_controls.sql#L91); [supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql:65](../../supabase/migrations/20260720000300_fix_whatsapp_batch_retry_rpc_ambiguity.sql#L65). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Cancelamento é deliberado, não motor ativo de resposta em lote. appendInboundMessageToBatch não tem consumidor atual; helpers de retry/claim são componentes deste descarte.

### domain.codex-automation — Automação Codex por WhatsApp

#### automation.request — Registrar solicitação Codex autorizada pelo WhatsApp

Validar origem/segredo e persistir pedido aprovado com contexto de implantação.

- **Tipo / status / teste / marca:** ADMIN / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `automation.codex-requests`, `messaging.webhook`, `admin.auth`.
- **Cadeia mínima:** http-zapi-webhook → parseCodexRequestCommand / POST → whatsapp_messages, conversations, integration-zapi → Validar origem/segredo e persistir pedido aprovado com contexto de implantação.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/tickets/codexRequests.ts:30](../../src/lib/tickets/codexRequests.ts#L30); [src/app/api/webhook/zapi/route.ts:832](../../src/app/api/webhook/zapi/route.ts#L832). Demais call sites e entradas no JSON canônico.

#### automation.issue — Abrir issue GitHub para solicitação aprovada

Publicar solicitação aprovada como issue quando integração está configurada.

- **Tipo / status / teste / marca:** SYSTEM / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `http-zapi-webhook`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `automation.github-issues`, `automation.codex-requests`, `messaging.webhook`.
- **Cadeia mínima:** http-zapi-webhook → createGitHubIssue / createIssueForCodexRequest → whatsapp_messages, integration-zapi, integration-github → Publicar solicitação aprovada como issue quando integração está configurada.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [src/lib/github/issues.ts:35](../../src/lib/github/issues.ts#L35); [src/app/api/webhook/zapi/route.ts:772](../../src/app/api/webhook/zapi/route.ts#L772). Demais call sites e entradas no JSON canônico.

#### automation.list — Listar solicitações Codex aprovadas

Consultar pedidos por telefone/prefixo e imprimir lista operacional.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `npm-codex-requests`, `script-codex-list`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `automation.local-runner`.
- **Cadeia mínima:** npm-codex-requests / script-codex-list → script/trigger citado → whatsapp_messages → Consultar pedidos por telefone/prefixo e imprimir lista operacional.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/list-codex-requests.mjs:1](../../scripts/list-codex-requests.mjs#L1). Demais call sites e entradas no JSON canônico.

#### automation.execute — Executar pedido aprovado com Codex CLI local

Polling lê pedidos aprovados, controla estado em arquivo e invoca codex exec no checkout local.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `npm-codex-runner`, `script-codex-runner`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `automation.local-runner`, `automation.codex-requests`.
- **Cadeia mínima:** npm-codex-runner / script-codex-runner → script/trigger citado → whatsapp_messages, integration-codex-cli → Polling lê pedidos aprovados, controla estado em arquivo e invoca codex exec no checkout local.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/codex-local-runner.mjs:1](../../scripts/codex-local-runner.mjs#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Apenas leitura do script na auditoria. O programa tem efeitos amplos ao invocar Codex, escrever estado e enviar resumo; não foi executado.

#### automation.notify — Enviar resultado do executor ao solicitante

Após execução, enviar resumo ao telefone do solicitante se disponível; ausência de credenciais Z-API retorna falha de configuração.

- **Tipo / status / teste / marca:** OPERATIONAL / CONFIRMADA / UNCOVERED / COMMON.
- **Entradas:** `npm-codex-runner`, `script-codex-runner`. Disponibilidade: STRUCTURALLY_REACHABLE.
- **Módulos:** `automation.local-runner`.
- **Cadeia mínima:** npm-codex-runner / script-codex-runner → script/trigger citado → whatsapp_messages, integration-zapi → Após execução, enviar resumo ao telefone do solicitante se disponível; ausência de credenciais Z-API retorna falha de configuração.
- **Testes:** —.
- **Requer / dependentes:** — / —.
- **Evidência:** [scripts/codex-local-runner.mjs:1](../../scripts/codex-local-runner.mjs#L1). Demais call sites e entradas no JSON canônico.
- **Limitações/notas:** Cliente HTTP próprio no script, diferente do adapter src/lib/zapi/client.ts; sem persistência de envio em whatsapp_messages neste caminho.

## Limites e prontidão

- Schema remoto, grants efetivos, dados, deploy, cron e entrega real não foram consultados.
- CreateEventModal.tsx:19 não faz parse; isso limita criação web, sem invalidar automaticamente capabilities de outros caminhos.
- Há predomínio de contratos de fonte e auditorias não executadas; cobertura não é percentual nem prova fim a fim.
- Falhas intermediárias das mutações TypeScript de eventos/combos não têm atomicidade global comprovada.
- Mesas desabilitadas na apresentação e exigidas pela escolha de entrega do combo causam incompatibilidade com venda individual.
- Busca de órfãos é limitada aos consumidores versionados em src/scripts/.tools e triggers locais; chamadas externas desconhecidas não foram presumidas.

O catálogo está pronto para servir de entrada à Etapa 4 com as restrições explicitadas. `PASS` avalia completude/coerência documental deste catálogo, não saúde do produto, deploy ou integridade do banco remoto. Confiança: **MEDIA**.

## Checagem final da auditoria

JSONs válidos; 140 IDs únicos; 36 relações válidas; referências a domains, modules, integrações e testes verificadas; 1.143 referências com path/linha conferidas. Os 56 entrypoints, 66 modules, 33 nomes de função SQL, 33 triggers e 67 arquivos de testes/auditorias estão classificados. Nenhum `flows.json` foi criado.

A comparação SHA-256 de 363 arquivos originais confirmou **nenhuma alteração funcional nesta etapa**. O hash inicial/final de `src/lib/tickets/messages.ts` permaneceu `c567c2bca0a3494d96ef6242e59139832a4cf648b3a85f02f84ba9f06c937694`. O HEAD não mudou. Foram criados seis artefatos e atualizados sete arquivos documentais das etapas anteriores. A varredura de credenciais nos artefatos não encontrou padrões de segredo. Resultado documental: **PASS**, confiança **MEDIA**, pronto para a Etapa 4 sem iniciá-la.
