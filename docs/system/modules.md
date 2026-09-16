> **Current Baseline 2.8.1 (2026-09-16):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.8.1 module correction

The runtime export inventory now matches the TypeScript compiler's value exports. `platform.edge-proxy` uses the pure contract in `platform.rate-limit` while retaining its REST adapter.

## Baseline 2.8.0 rate-limit module reconciliation

`src/lib/security/rateLimitContract.ts` belongs to the existing logical module `platform.rate-limit`; it does not create an artificial module. MODULE_COUNT remains 66.

## Baseline 2.7.0 module reconciliation

`combo.redemption` now delegates critical metadata transitions to six service-role-only RPCs plus the replaced validation RPC. Direct Z-API notifications that occur before state consolidation remain the separate P2 concurrency finding.

# Baseline 2.1.0 scoped active-brand module projection

`brand.presentation`, `payment.checkout` and `messaging.public-dialog` reflect the corrected active surfaces on source `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; module statuses remain unchanged.

# Modules arquiteturais

Foram identificados **66 modules principais**. Um module pode representar um arquivo central ou um pequeno grupo coeso; arquivos triviais não foram promovidos individualmente. `calledBy` e `calls` registram ligações arquiteturais confirmadas pelo código, enquanto tabelas e integrações são mantidas em campos próprios.

## Resumo

| ID | Domain primário | Path(s) | Responsabilidade | Status |
| --- | --- | --- | --- | --- |
| `platform.env` | `domain.platform-runtime` | src/lib/env.ts | Validar e cachear configuração server-side. | CONFIRMADO |
| `platform.supabase-client` | `domain.platform-runtime` | src/lib/supabase/admin.ts | Criar e reutilizar cliente service-role. | CONFIRMADO |
| `platform.logging` | `domain.platform-runtime` | src/lib/logger.ts | Emitir JSON e mascarar dados sensíveis. | CONFIRMADO |
| `platform.http` | `domain.platform-runtime` | src/lib/http/responses.ts | Padronizar respostas JSON e erros HTTP. | CONFIRMADO |
| `platform.rate-limit` | `domain.platform-runtime` | src/lib/security/rateLimit.ts; src/lib/security/rateLimitContract.ts | Aplicar contrato de rate limit e política de indisponibilidade. | CONFIRMADO |
| `platform.edge-proxy` | `domain.platform-runtime` | src/proxy.ts | Aplicar Content Security Policy e rate limit de páginas por chamada REST direta ao Supabase. | CONFIRMADO |
| `integration.zapi` | `domain.platform-runtime` | src/lib/zapi/client.ts; src/lib/zapi/format.ts; src/lib/zapi/textEncoding.ts | Enviar texto/imagem e normalizar formato/encoding WhatsApp. | CONFIRMADO |
| `integration.mercado-pago` | `domain.platform-runtime` | src/lib/mercado-pago/client.ts; src/lib/mercado-pago/webhook.ts | Criar/consultar pagamentos e validar/interpretar webhook. | CONFIRMADO |
| `automation.github-issues` | `domain.codex-automation` | src/lib/github/issues.ts | Criar issue GitHub a partir de pedido aprovado. | CONFIRMADO |
| `brand.presentation` | `domain.brand-presentation` | src/lib/tickets/rota5Presentation.ts | Fixar disponibilidade de ingresso individual, mapa e cortesia. | CONFIRMADO |
| `brand.shell-assets` | `domain.brand-presentation` | src/app/InformationPage.tsx; src/app/BrandLogo.tsx; src/app/globals.css; public | Renderizar layout compartilhado, fundos, logo, fontes e templates. | PARCIALMENTE CONFIRMADO |
| `messaging.webhook` | `domain.whatsapp-conversations` | src/app/api/webhook/zapi/route.ts | Autenticar inbound, aplicar idempotência/rate limit, persistir, rotear e responder. | CONFIRMADO |
| `messaging.router` | `domain.whatsapp-conversations` | src/lib/tickets/router.ts | Classificar intenção e orquestrar fluxos públicos, compra, admin, portaria, cortesia, relatórios e combos. | PARCIALMENTE CONFIRMADO |
| `messaging.state` | `domain.whatsapp-conversations` | src/lib/tickets/conversationState.ts | Definir passos/contexto e expiração do estado persistido. | CONFIRMADO |
| `messaging.public-dialog` | `domain.whatsapp-conversations` | src/lib/tickets/messages.ts; src/lib/tickets/publicInitialFlow.ts; src/lib/tickets/publicAllEventsFormatting.ts; src/lib/tickets/eventFormatting.ts; src/lib/tickets/numericOptions.ts; src/lib/tickets/phones.ts; src/lib/tickets/services/publicEntryGate.ts; src/lib/tickets/services/publicHelp.ts; src/lib/tickets/services/publicHelpFlow.ts | Reconhecer comandos públicos, produzir ajuda/listagens e normalizar opções/telefone. | PARCIALMENTE CONFIRMADO |
| `messaging.customers` | `domain.customer-risk` | src/lib/tickets/services/customers.ts | Criar/localizar cliente por telefone WhatsApp. | CONFIRMADO |
| `messaging.conversations` | `domain.whatsapp-conversations` | src/lib/tickets/services/conversations.ts | Criar, carregar e atualizar contexto/status de conversa. | CONFIRMADO |
| `messaging.messages` | `domain.whatsapp-conversations` | src/lib/tickets/services/messages.ts; src/lib/tickets/services/outboundMessages.ts | Consultar/gravar mensagens e padronizar metadados outbound. | CONFIRMADO |
| `messaging.outbound-deliveries` | `domain.whatsapp-conversations` | src/lib/tickets/services/whatsappOutboundDeliveries.ts | Criar, reivindicar e finalizar tentativas de envio. | CONFIRMADO |
| `messaging.batches` | `domain.whatsapp-conversations` | src/lib/tickets/services/whatsappMessageBatches.ts; src/lib/tickets/services/whatsappBatchCore.ts | Agregar, reivindicar, concluir e reagendar batches. | PARCIALMENTE CONFIRMADO |
| `messaging.finalizer` | `domain.whatsapp-conversations` | src/lib/tickets/services/conversationFinalizer.ts | Localizar conversas inativas, notificar e fechar/resetar contexto. | CONFIRMADO |
| `catalog.events` | `domain.event-catalog` | src/lib/tickets/services/events.ts | Buscar/listar eventos e validar sessão selecionada. | CONFIRMADO |
| `catalog.visibility` | `domain.event-catalog` | src/lib/tickets/services/publicEventVisibility.ts; src/lib/tickets/services/publicAvailability.ts | Calcular janela, status listável e disponibilidade real. | CONFIRMADO |
| `catalog.inventory-read` | `domain.event-catalog` | src/lib/tickets/services/sections.ts; src/lib/tickets/services/seats.ts; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts | Listar ofertas/capacidade/assentos e gerar mapa simples. | CONFIRMADO |
| `event-admin.service` | `domain.event-administration` | src/lib/tickets/services/adminEvents.ts; src/lib/tickets/services/adminSessions.ts; src/lib/tickets/services/adminSections.ts; src/lib/tickets/services/adminSeats.ts; src/lib/tickets/services/adminPrices.ts | Listar e mutar evento, sessão, setor, assento, preço, duplicação e capacidade. | PARCIALMENTE CONFIRMADO |
| `event-admin.api` | `domain.event-administration` | src/app/api/admin/events/route.ts; src/app/api/admin/events/[eventId]/route.ts | Autenticar/validar pedidos e agregar CRUD, detalhes, métricas, contatos e dashboards. | CONFIRMADO |
| `event-admin.ui` | `domain.event-administration` | src/app/admin/eventos/AdminEventsEditor.tsx; src/app/admin/eventos/components; src/app/admin/eventos/event-editor | Coordenar lista, filtros, cards e modais de criação/edição. | PARCIALMENTE CONFIRMADO |
| `event-admin.program-importer` | `domain.event-administration` | scripts/import-programacao-events.mjs | Interpretar programacao.md e consultar, verificar ou gravar catálogo e inventário no Supabase. | PARCIALMENTE CONFIRMADO |
| `event-admin.black-house-maintenance` | `domain.event-administration` | scripts/rename-black-house-ticket-sections.mjs; scripts/split-black-house-special-items.mjs; scripts/update-black-house-sectors.mjs | Inspecionar e, com --apply, normalizar setores, preços e inventário fixos da Black House. | POSSÍVEL LEGADO |
| `reservation.service` | `domain.reservation-inventory` | src/lib/tickets/services/reservations.ts | Encontrar, criar e cancelar reservas numeradas, não numeradas e carrinho. | CONFIRMADO |
| `reservation.expiry` | `domain.reservation-inventory` | src/lib/tickets/services/reservationExpiry.ts | Executar expiração, notificar comprador e ajustar conversas/sessões admin. | CONFIRMADO |
| `customer-risk.service` | `domain.customer-risk` | src/lib/tickets/services/buyerRisk.ts | Avaliar limites/sinais de abuso e registrar eventos. | CONFIRMADO |
| `payment.checkout` | `domain.orders-payments` | src/lib/tickets/services/checkout.ts | Criar pedido, validar acesso, reconciliar e criar pagamento Pix. | CONFIRMADO |
| `payment.api-ui` | `domain.orders-payments` | src/app/checkout; src/app/api/checkout | Renderizar checkout/retornos e expor criação/status. | CONFIRMADO |
| `payment.webhook` | `domain.orders-payments` | src/app/api/webhook/payment/mercado-pago/route.ts | Validar webhook, registrar evento, consultar pagamento e confirmar pedido ticket/combo. | CONFIRMADO |
| `payment.primitives` | `domain.orders-payments` | src/lib/tickets/services/payments.ts | Converter valores e construir/extrair referência externa. | CONFIRMADO |
| `ticket.service` | `domain.ticketing-delivery` | src/lib/tickets/services/tickets.ts; src/lib/tickets/services/publicDtos.ts | Assinar/verificar token, consultar ingresso, participantes e marcações de entrega. | CONFIRMADO |
| `ticket.delivery` | `domain.ticketing-delivery` | src/lib/tickets/services/ticketDelivery.ts | Montar preferência/payload e enviar ingressos ao comprador/participantes. | CONFIRMADO |
| `ticket.qr` | `domain.ticketing-delivery` | src/lib/tickets/services/ticketQrImage.ts | Compor QR e textos no template de ingresso. | CONFIRMADO |
| `ticket.public-page` | `domain.ticketing-delivery` | src/app/tickets/[token]/page.tsx | Resolver token e mostrar dados do ingresso. | CONFIRMADO |
| `ticket.free-issuance` | `domain.ticketing-delivery` | src/lib/tickets/services/publicFreeTickets.ts | Emitir pedido/ingresso sem pagamento respeitando limites. | CONFIRMADO |
| `admin.ticket-operations` | `domain.ticketing-delivery` | src/lib/tickets/services/adminTickets.ts | Buscar ingressos/reservas, validações e cancelar pendência. | CONFIRMADO |
| `admin.auth` | `domain.admin-identity-access` | src/lib/tickets/services/adminAuth.ts; src/lib/tickets/services/adminLoginFlow.ts; src/lib/tickets/services/adminWebAuth.ts | Gerir hash, permissões, challenges, sessões WhatsApp/web, cookie e CSRF. | CONFIRMADO |
| `admin.users` | `domain.admin-identity-access` | src/lib/tickets/services/adminUsers.ts | Listar/criar/desabilitar/reativar usuários, mudar papel e senha. | CONFIRMADO |
| `admin.login-ui-api` | `domain.admin-identity-access` | src/app/admin/login; src/app/admin/eventos/abrir/[token]/route.ts; src/app/api/admin/login/verify/route.ts | Consumir link/código, validar challenge e estabelecer cookies. | CONFIRMADO |
| `gate.access-session` | `domain.gate-admission` | src/lib/tickets/services/gateTokens.ts; src/lib/tickets/services/gateSessions.ts; src/lib/tickets/services/gateAccesses.ts; src/lib/tickets/services/fixedGateAccesses.ts; src/lib/tickets/services/gateAccessAuth.ts | Criar/hash tokens, gerir acessos, sessões e vínculo de dispositivo. | CONFIRMADO |
| `gate.validation` | `domain.gate-admission` | src/lib/tickets/services/gateValidation.ts; src/lib/tickets/services/gateTicketConsultation.ts | Interpretar código, consultar e validar entrada no escopo da sessão. | CONFIRMADO |
| `gate.ui-api` | `domain.gate-admission` | src/app/gate; src/app/api/gate | Renderizar scanner e expor consult/scan/validate. | CONFIRMADO |
| `courtesy.service` | `domain.courtesy` | src/lib/tickets/services/adminCourtesies.ts | Listar alvos, emitir/cancelar cortesia e montar entrega. | CONFIRMADO |
| `combo.offers` | `domain.combo-commerce-fulfillment` | src/lib/tickets/services/comboOffers.ts; src/lib/tickets/comboOfferCron.ts | CRUD de ofertas, pedido/checkout, Pix, confirmação, expiração, seleção agendada e entrega. | PARCIALMENTE CONFIRMADO |
| `combo.checkout-ui-api` | `domain.combo-commerce-fulfillment` | src/app/combo-checkout; src/app/api/combo-checkout | Renderizar checkout e expor pay/status de combo. | CONFIRMADO |
| `combo.redemption` | `domain.combo-commerce-fulfillment` | src/lib/tickets/services/comboRedemptions.ts | Validar sessão/QR, liberar após entrada, preparar e solicitar escolha de entrega; consumo final bloqueado no leitor atual. | PARCIALMENTE CONFIRMADO |
| `combo.qr` | `domain.combo-commerce-fulfillment` | src/lib/tickets/services/comboQrImage.ts | Compor QR e dados no template de combo. | CONFIRMADO |
| `combo.kitchen-reader-ui-api` | `domain.combo-commerce-fulfillment` | src/app/kitchen; src/app/offer-reader; src/app/api/kitchen | Abrir dispositivo/sessão, ler QR, preparar e validar combo. | CONFIRMADO |
| `combo.admin-ui` | `domain.combo-commerce-fulfillment` | src/app/admin/eventos/combo-editor; src/app/admin/eventos/components/AdminComboOfferCard.tsx; src/app/admin/eventos/components/AdminComboOfferGrid.tsx; src/app/api/admin/combo-offers | Listar, criar, editar, duplicar e excluir ofertas. | CONFIRMADO |
| `table-map.catalog-render` | `domain.table-map` | src/lib/tickets/tableMap; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts | Definir lugares/metadados, ler coordenadas e renderizar PNG/SVG. | CONFIRMADO |
| `table-map.reservation` | `domain.table-map` | src/lib/tickets/services/officialTableMapReservations.ts | Listar disponibilidade, produzir imagem e reservar lugar. | CONFIRMADO |
| `table-map.admin-ui-api` | `domain.table-map` | src/app/admin/AdminTableMapCalibrator.tsx; src/app/admin/eventos/event-editor/EventTableMapTab.tsx; src/app/api/admin/table-map/route.ts; src/lib/tickets/tableMap/persistOfficialPlaces.ts | Editar, validar, persistir coordenadas e gerar preview. | CONFIRMADO |
| `analytics.reports` | `domain.analytics-reporting` | src/lib/tickets/services/adminReports.ts; src/lib/tickets/services/adminReportEvents.ts | Selecionar eventos, agregar vendas/cortesias/divisão e registrar baixa. | PARCIALMENTE CONFIRMADO |
| `analytics.contacts` | `domain.analytics-reporting` | src/lib/tickets/services/adminContactAnalytics.ts | Combinar mensagens, reservas e operadores por contato/período. | CONFIRMADO |
| `analytics.operational-dashboard` | `domain.analytics-reporting` | src/app/admin/operacao; src/app/api/admin/operational-dashboard/route.ts; src/lib/tickets/services/operationalDashboardTypes.ts | Autenticar e carregar séries/alertas por RPC para UI. | CONFIRMADO |
| `analytics.admin-dashboard-ui` | `domain.analytics-reporting` | src/app/admin/eventos/dashboard; src/app/admin/eventos/contacts | Renderizar dashboard geral/evento e contatos usando APIs de eventos. | CONFIRMADO |
| `background.expire-cron` | `domain.background-processing` | src/app/api/cron/expire-reservations/route.ts | Autenticar CRON_SECRET, aplicar rate limit e disparar expiração/notificação. | CONFIRMADO |
| `background.batch-cron` | `domain.background-processing` | src/app/api/cron/process-whatsapp-batches/route.ts | Autenticar cron, finalizar conversas e claim/cancel/retry de batches. | PARCIALMENTE CONFIRMADO |
| `automation.codex-requests` | `domain.codex-automation` | src/lib/tickets/codexRequests.ts | Restringir telefone autorizado e detectar pedido Codex no contexto. | CONFIRMADO |
| `automation.local-runner` | `domain.codex-automation` | scripts/codex-local-runner.mjs; scripts/list-codex-requests.mjs | Consultar pedidos aprovados, executar processo Codex e enviar resumo opcional. | PARCIALMENTE CONFIRMADO |

## Detalhes

### `platform.env` — Configuração de ambiente

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/env.ts
- **Responsabilidade:** Validar e cachear configuração server-side.
- **Exports/superfícies principais:** `getEnv`
- **Chamado por:** `módulos server-side`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** lança erro se configuração for inválida
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/env.ts`, `export getEnv`

### `platform.supabase-client` — Cliente Supabase administrativo

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/supabase/admin.ts
- **Responsabilidade:** Criar e reutilizar cliente service-role.
- **Exports/superfícies principais:** `getSupabaseAdmin`
- **Chamado por:** `44 arquivos de src pelo fan-in estático`
- **Chama:** `platform.env`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** abre chamadas remotas PostgREST/RPC
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/supabase/admin.ts`, `export getSupabaseAdmin`

### `platform.logging` — Logger estruturado

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/logger.ts
- **Responsabilidade:** Emitir JSON e mascarar dados sensíveis.
- **Exports/superfícies principais:** `logInfo`, `logWarn`, `logError`
- **Chamado por:** `22 arquivos de src`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** escreve em console
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/logger.ts`, `export logInfo`, `export logWarn`, `export logError`

### `platform.http` — Respostas HTTP compartilhadas

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/http/responses.ts
- **Responsabilidade:** Padronizar respostas JSON e erros HTTP.
- **Exports/superfícies principais:** `jsonOk`, `jsonError`, `unauthorized`, `tooManyRequests`, `badRequest`, `methodNotAllowed`
- **Chamado por:** `17 arquivos de src`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** cria Response
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/http/responses.ts`, `export jsonOk`, `export jsonError`, `export unauthorized`

### `platform.rate-limit` — Rate limit compartilhado

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/security/rateLimit.ts
- **Responsabilidade:** Calcular escopo, consumir limite por RPC e construir resposta 429.
- **Exports/superfícies principais:** `consumeRateLimit`, `rateLimitResponse`, `hashRateLimitScope`
- **Chamado por:** `16 arquivos de src`
- **Chama:** `platform.supabase-client`, `platform.logging`, `platform.http`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** grava/atualiza rate_limit_events via RPC
- **Testes relacionados:** `test-function-search-path-hardening.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/security/rateLimit.ts`, `export consumeRateLimit`, `export rateLimitResponse`, `export hashRateLimitScope`

### `platform.edge-proxy` — Proxy de segurança e rate limit de páginas

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/proxy.ts
- **Responsabilidade:** Aplicar Content Security Policy e rate limit de páginas por chamada REST direta ao Supabase.
- **Exports/superfícies principais:** `proxy`, `config`
- **Chamado por:** `proxy`
- **Chama:** `database.function.consume_rate_limit`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** define headers CSP e nonce; consome rate limit por REST RPC
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/proxy.ts`, `export proxy`, `export config`, `fetch /rest/v1/rpc/consume_rate_limit`
- **Notas:** Implementa rate limit próprio no runtime de proxy em vez de importar platform.rate-limit.

### `integration.zapi` — Adapter Z-API

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/zapi/client.ts; src/lib/zapi/format.ts; src/lib/zapi/textEncoding.ts
- **Responsabilidade:** Enviar texto/imagem e normalizar formato/encoding WhatsApp.
- **Exports/superfícies principais:** `sendZapiText`, `sendZapiImage`, `sanitizeWhatsAppText`, `formatSystemActionLines`
- **Chamado por:** `messaging.webhook`, `ticket.delivery`, `reservation.expiry`, `messaging.finalizer`, `combo.offers`, `combo.redemption`
- **Chama:** `platform.env`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-zapi`
- **Efeitos colaterais:** requisições HTTP ao provedor
- **Testes relacionados:** `test-whatsapp-output-sanitization.mjs`, `test-message-mojibake.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/zapi/client.ts; src/lib/zapi/format.ts; src/lib/zapi/textEncoding.ts`, `export sendZapiText`, `export sendZapiImage`, `export sanitizeWhatsAppText`

### `integration.mercado-pago` — Adapter Mercado Pago

- **Domain:** `domain.platform-runtime`
- **Path(s):** src/lib/mercado-pago/client.ts; src/lib/mercado-pago/webhook.ts
- **Responsabilidade:** Criar/consultar pagamentos e validar/interpretar webhook.
- **Exports/superfícies principais:** `createMercadoPagoPayment`, `getMercadoPagoPayment`, `validateMercadoPagoWebhookSignature`, `parseMercadoPagoWebhookPayload`
- **Chamado por:** `payment.checkout`, `payment.webhook`, `combo.offers`
- **Chama:** `platform.env`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-mercado-pago`
- **Efeitos colaterais:** requisições HTTP ao provedor
- **Testes relacionados:** `test-checkout-pix-requirements.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/mercado-pago/client.ts; src/lib/mercado-pago/webhook.ts`, `export createMercadoPagoPayment`, `export getMercadoPagoPayment`, `export validateMercadoPagoWebhookSignature`

### `automation.github-issues` — Adapter GitHub Issues

- **Domain:** `domain.codex-automation`
- **Path(s):** src/lib/github/issues.ts
- **Responsabilidade:** Criar issue GitHub a partir de pedido aprovado.
- **Exports/superfícies principais:** `createGitHubIssue`
- **Chamado por:** `messaging.webhook`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-github`
- **Efeitos colaterais:** requisição HTTP cria issue
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/github/issues.ts`, `export createGitHubIssue`

### `brand.presentation` — Flags de apresentação Rota5

- **Domain:** `domain.brand-presentation`
- **Path(s):** src/lib/tickets/rota5Presentation.ts
- **Responsabilidade:** Fixar disponibilidade de ingresso individual, mapa e cortesia.
- **Exports/superfícies principais:** `ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY`, `ROTA5_PRESENTATION_TABLE_MAP_ENABLED`, `ROTA5_PRESENTATION_COURTESY_ENABLED`
- **Chamado por:** `messaging.router`, `catalog.inventory-read`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** nenhum efeito externo identificado
- **Testes relacionados:** `test-public-initial-flow.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/rota5Presentation.ts`, `export ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY`, `export ROTA5_PRESENTATION_TABLE_MAP_ENABLED`, `export ROTA5_PRESENTATION_COURTESY_ENABLED`
- **Notas:** Dois flags são duplicados no EventEditorModal.

### `brand.shell-assets` — Shell e assets de marca

- **Domain:** `domain.brand-presentation`
- **Path(s):** src/app/InformationPage.tsx; src/app/BrandLogo.tsx; src/app/globals.css; public
- **Responsabilidade:** Renderizar layout compartilhado, fundos, logo, fontes e templates.
- **Exports/superfícies principais:** `InformationPage`, `BrandLogo`
- **Chamado por:** `páginas web`, `ticket.qr`, `combo.qr`, `table-map.catalog-render`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** leitura de assets do filesystem/browser
- **Testes relacionados:** `test-ticket-qr-image-template.mjs`, `test-combo-qr-image-template.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/app/InformationPage.tsx; src/app/BrandLogo.tsx; src/app/globals.css; public`, `export InformationPage`, `export BrandLogo`
- **Notas:** BrandLogo não possui importador; referências RockBar/Black House coexistem.

### `messaging.webhook` — Handler do webhook Z-API

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/app/api/webhook/zapi/route.ts
- **Responsabilidade:** Autenticar inbound, aplicar idempotência/rate limit, persistir, rotear e responder.
- **Exports/superfícies principais:** `POST`, `GET`, `PUT`, `PATCH`, `DELETE`
- **Chamado por:** `http-zapi-webhook`
- **Chama:** `platform.http`, `platform.logging`, `platform.rate-limit`, `integration.zapi`, `automation.github-issues`, `messaging.router`, `messaging.state`, `messaging.customers`, `messaging.conversations`, `messaging.messages`, `messaging.outbound-deliveries`, `ticket.service`, `admin.auth`
- **Tabelas:** `customers`, `conversations`, `whatsapp_messages`, `whatsapp_outbound_deliveries`
- **Integrações:** `integration-zapi`, `integration-github`, `integration-supabase`
- **Efeitos colaterais:** grava mensagens/conversa/delivery; envia WhatsApp; pode criar issue
- **Testes relacionados:** `test-public-initial-flow.mjs`, `test-whatsapp-messaging-regressions.mjs`, `test-paid-delivery-outbound-idempotency.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/api/webhook/zapi/route.ts`, `export POST`, `export GET`, `export PUT`

### `messaging.router` — Máquina de estados central

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/router.ts
- **Responsabilidade:** Classificar intenção e orquestrar fluxos públicos, compra, admin, portaria, cortesia, relatórios e combos.
- **Exports/superfícies principais:** `classifyPublicMessageIntent`, `shouldProcessImmediately`, `resolveIncomingMessageIntent`, `routeTicketMessage`
- **Chamado por:** `messaging.webhook`, `auditorias .tools`
- **Chama:** `messaging.state`, `messaging.public-dialog`, `catalog.events`, `catalog.inventory-read`, `reservation.service`, `payment.checkout`, `ticket.delivery`, `admin.auth`, `event-admin.service`, `courtesy.service`, `gate.access-session`, `analytics.reports`, `combo.offers`, `combo.redemption`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** coordena múltiplas gravações e respostas por serviços
- **Testes relacionados:** `test-public-initial-flow.mjs`, `test-admin-auth-pending-cancel.mjs`, `test-ticket-delivery-distribution.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/router.ts`, `export classifyPublicMessageIntent`, `export shouldProcessImmediately`, `export resolveIncomingMessageIntent`
- **Notas:** Combina routing, regra de negócio, formatação e orquestração em 19.367 linhas.

### `messaging.state` — Estado de conversa

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/conversationState.ts
- **Responsabilidade:** Definir passos/contexto e expiração do estado persistido.
- **Exports/superfícies principais:** `TicketConversationState`, `TicketConversationStep`, `buildInitialConversationState`
- **Chamado por:** `messaging.router`, `messaging.webhook`, `messaging.finalizer`, `messaging.public-dialog`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** nenhum efeito externo identificado
- **Testes relacionados:** `test-conversation-inactivity.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/conversationState.ts`, `export TicketConversationState`, `export TicketConversationStep`, `export buildInitialConversationState`

### `messaging.public-dialog` — Diálogo público e formatação

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/messages.ts; src/lib/tickets/publicInitialFlow.ts; src/lib/tickets/publicAllEventsFormatting.ts; src/lib/tickets/eventFormatting.ts; src/lib/tickets/numericOptions.ts; src/lib/tickets/phones.ts; src/lib/tickets/services/publicEntryGate.ts; src/lib/tickets/services/publicHelp.ts; src/lib/tickets/services/publicHelpFlow.ts
- **Responsabilidade:** Reconhecer comandos públicos, produzir ajuda/listagens e normalizar opções/telefone.
- **Exports/superfícies principais:** `TICKET_MESSAGES`, `isPublicInitialHelpCommand`, `buildAllEventsOutboundMessages`, `buildPublicEntryGateResponse`, `searchPublicHelpTopics`
- **Chamado por:** `messaging.router`, `messaging.webhook`
- **Chama:** `messaging.state`, `catalog.visibility`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** nenhum efeito externo identificado
- **Testes relacionados:** `test-public-help-flow.mjs`, `test-public-all-events-formatting.mjs`, `test-message-mojibake.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/messages.ts; src/lib/tickets/publicInitialFlow.ts; src/lib/tickets/publicAllEventsFormatting.ts; src/lib/tickets/eventFormatting.ts; src/lib/tickets/numericOptions.ts; src/lib/tickets/phones.ts; src/lib/tickets/services/publicEntryGate.ts; src/lib/tickets/services/publicHelp.ts; src/lib/tickets/services/publicHelpFlow.ts`, `export TICKET_MESSAGES`, `export isPublicInitialHelpCommand`, `export buildAllEventsOutboundMessages`
- **Notas:** Testes atuais detectam corrupção textual.

### `messaging.customers` — Repositório de clientes

- **Domain:** `domain.customer-risk`
- **Path(s):** src/lib/tickets/services/customers.ts
- **Responsabilidade:** Criar/localizar cliente por telefone WhatsApp.
- **Exports/superfícies principais:** `getOrCreateCustomer`, `getCustomerById`
- **Chamado por:** `messaging.webhook`, `combo.offers`, `reservation.expiry`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `customers`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** select/insert/update customers
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/customers.ts`, `export getOrCreateCustomer`, `export getCustomerById`

### `messaging.conversations` — Repositório de conversas

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/services/conversations.ts
- **Responsabilidade:** Criar, carregar e atualizar contexto/status de conversa.
- **Exports/superfícies principais:** `getOrCreateOpenConversation`, `updateConversationContext`, `closeConversation`
- **Chamado por:** `messaging.webhook`, `combo.offers`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `conversations`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** select/insert/update conversations
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/conversations.ts`, `export getOrCreateOpenConversation`, `export updateConversationContext`, `export closeConversation`

### `messaging.messages` — Persistência e metadados de mensagens

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/services/messages.ts; src/lib/tickets/services/outboundMessages.ts
- **Responsabilidade:** Consultar/gravar mensagens e padronizar metadados outbound.
- **Exports/superfícies principais:** `findInboundMessageByProviderId`, `saveWhatsAppMessage`, `buildWhatsAppOutboundMetadata`
- **Chamado por:** `messaging.webhook`, `ticket.delivery`, `reservation.expiry`, `messaging.finalizer`, `combo.offers`, `combo.redemption`
- **Chama:** `platform.supabase-client`, `integration.zapi`
- **Tabelas:** `whatsapp_messages`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** select/insert whatsapp_messages
- **Testes relacionados:** `test-whatsapp-outbound-metadata-contract.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/messages.ts; src/lib/tickets/services/outboundMessages.ts`, `export findInboundMessageByProviderId`, `export saveWhatsAppMessage`, `export buildWhatsAppOutboundMetadata`

### `messaging.outbound-deliveries` — Unidades idempotentes outbound

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/services/whatsappOutboundDeliveries.ts
- **Responsabilidade:** Criar, reivindicar e finalizar tentativas de envio.
- **Exports/superfícies principais:** `getOrCreateWhatsAppOutboundDelivery`, `claimWhatsAppOutboundDelivery`, `markWhatsAppOutboundDeliverySent`, `markWhatsAppOutboundDeliveryFailed`
- **Chamado por:** `messaging.webhook`, `ticket.delivery`, `combo.offers`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `whatsapp_outbound_deliveries`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** insert/update deliveries; claim RPC
- **Testes relacionados:** `test-paid-delivery-outbound-idempotency.mjs`, `test-whatsapp-outbound-delivery-security.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/whatsappOutboundDeliveries.ts`, `export getOrCreateWhatsAppOutboundDelivery`, `export claimWhatsAppOutboundDelivery`, `export markWhatsAppOutboundDeliverySent`

### `messaging.batches` — Lotes de mensagens WhatsApp

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/services/whatsappMessageBatches.ts; src/lib/tickets/services/whatsappBatchCore.ts
- **Responsabilidade:** Agregar, reivindicar, concluir e reagendar batches.
- **Exports/superfícies principais:** `appendInboundMessageToBatch`, `claimDueWhatsAppMessageBatches`, `finishWhatsAppMessageBatch`, `rescheduleWhatsAppMessageBatch`
- **Chamado por:** `background.batch-cron`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `whatsapp_message_batches`, `whatsapp_message_batch_messages`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPCs alteram batches
- **Testes relacionados:** `test-whatsapp-batch-compat.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/services/whatsappMessageBatches.ts; src/lib/tickets/services/whatsappBatchCore.ts`, `export appendInboundMessageToBatch`, `export claimDueWhatsAppMessageBatches`, `export finishWhatsAppMessageBatch`
- **Notas:** Há ciclo de imports somente de tipo com whatsappBatchCore.

### `messaging.finalizer` — Finalizador de conversas inativas

- **Domain:** `domain.whatsapp-conversations`
- **Path(s):** src/lib/tickets/services/conversationFinalizer.ts
- **Responsabilidade:** Localizar conversas inativas, notificar e fechar/resetar contexto.
- **Exports/superfícies principais:** `finalizeInactiveWhatsAppConversations`
- **Chamado por:** `background.batch-cron`
- **Chama:** `platform.supabase-client`, `platform.logging`, `integration.zapi`, `messaging.state`, `messaging.messages`
- **Tabelas:** `conversations`, `customers`, `whatsapp_messages`
- **Integrações:** `integration-supabase`, `integration-zapi`
- **Efeitos colaterais:** envia WhatsApp e atualiza conversa/mensagem
- **Testes relacionados:** `test-conversation-inactivity.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/conversationFinalizer.ts`, `export finalizeInactiveWhatsAppConversations`

### `catalog.events` — Consulta de eventos

- **Domain:** `domain.event-catalog`
- **Path(s):** src/lib/tickets/services/events.ts
- **Responsabilidade:** Buscar/listar eventos e validar sessão selecionada.
- **Exports/superfícies principais:** `searchEvents`, `listAllPublicEventsByDate`, `getEventById`, `getValidatedEventSession`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `catalog.visibility`
- **Tabelas:** `events`, `event_sessions`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** select e RPC de busca
- **Testes relacionados:** `test-public-event-visibility-policy.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/events.ts`, `export searchEvents`, `export listAllPublicEventsByDate`, `export getEventById`

### `catalog.visibility` — Visibilidade e disponibilidade pública

- **Domain:** `domain.event-catalog`
- **Path(s):** src/lib/tickets/services/publicEventVisibility.ts; src/lib/tickets/services/publicAvailability.ts
- **Responsabilidade:** Calcular janela, status listável e disponibilidade real.
- **Exports/superfícies principais:** `isPublicEventVisible`, `classifyPublicAvailability`, `getCurrentPublicAvailabilityStatusForSession`
- **Chamado por:** `catalog.events`, `messaging.public-dialog`, `catalog.inventory-read`, `payment.checkout`, `combo.offers`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `event_sessions`, `session_seats`, `ticket_prices`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consultas de disponibilidade
- **Testes relacionados:** `test-public-availability-classification.mjs`, `test-public-event-visibility-policy.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/publicEventVisibility.ts; src/lib/tickets/services/publicAvailability.ts`, `export isPublicEventVisible`, `export classifyPublicAvailability`, `export getCurrentPublicAvailabilityStatusForSession`

### `catalog.inventory-read` — Leitura de setores e assentos

- **Domain:** `domain.event-catalog`
- **Path(s):** src/lib/tickets/services/sections.ts; src/lib/tickets/services/seats.ts; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts
- **Responsabilidade:** Listar ofertas/capacidade/assentos e gerar mapa simples.
- **Exports/superfícies principais:** `listAvailableSections`, `getAvailableSectionForSession`, `listAvailableSeats`, `listSeatMap`, `buildSeatMapPngDataUrl`
- **Chamado por:** `messaging.router`, `courtesy.service`
- **Chama:** `platform.supabase-client`, `catalog.visibility`, `brand.presentation`
- **Tabelas:** `venue_sections`, `event_sessions`, `session_seats`, `ticket_prices`, `tickets`, `courtesy_section_limits`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consultas e geração de buffer PNG
- **Testes relacionados:** `test-official-table-map.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/sections.ts; src/lib/tickets/services/seats.ts; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts`, `export listAvailableSections`, `export getAvailableSectionForSession`, `export listAvailableSeats`

### `event-admin.service` — Serviço administrativo de eventos

- **Domain:** `domain.event-administration`
- **Path(s):** src/lib/tickets/services/adminEvents.ts; src/lib/tickets/services/adminSessions.ts; src/lib/tickets/services/adminSections.ts; src/lib/tickets/services/adminSeats.ts; src/lib/tickets/services/adminPrices.ts
- **Responsabilidade:** Listar e mutar evento, sessão, setor, assento, preço, duplicação e capacidade.
- **Exports/superfícies principais:** `listAdminEvents`, `getAdminEventDetails`, `createAdminEvent`, `duplicateAdminEvent`, `updateAdminEvent`, `updateAdminSectionCapacity`
- **Chamado por:** `messaging.router`, `event-admin.api`
- **Chama:** `platform.supabase-client`, `table-map.catalog-render`
- **Tabelas:** `venues`, `venue_sections`, `seats`, `events`, `event_sessions`, `session_seats`, `ticket_prices`, `reservations`, `reservation_items`, `payments`, `tickets`, `courtesy_section_limits`, `official_table_map_reservations`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** múltiplas mutações sequenciais e RPC de capacidade
- **Testes relacionados:** `test-admin-event-artist-name-leak.mjs`, `test-admin-section-capacity-rpc-real.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminEvents.ts; src/lib/tickets/services/adminSessions.ts; src/lib/tickets/services/adminSections.ts; src/lib/tickets/services/adminSeats.ts; src/lib/tickets/services/adminPrices.ts`, `export listAdminEvents`, `export getAdminEventDetails`, `export createAdminEvent`

### `event-admin.api` — APIs administrativas de eventos

- **Domain:** `domain.event-administration`
- **Path(s):** src/app/api/admin/events/route.ts; src/app/api/admin/events/[eventId]/route.ts
- **Responsabilidade:** Autenticar/validar pedidos e agregar CRUD, detalhes, métricas, contatos e dashboards.
- **Exports/superfícies principais:** `GET`, `POST`, `PATCH`, `DELETE`
- **Chamado por:** `http-admin-events`, `http-admin-event-id`
- **Chama:** `platform.supabase-client`, `admin.auth`, `event-admin.service`, `analytics.contacts`, `courtesy.service`, `combo.offers`
- **Tabelas:** `events`, `session_seats`, `ticket_prices`, `tickets`, `ticket_validation_events`, `whatsapp_messages`, `combo_offers`, `combo_orders`, `combo_redemptions`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consulta direta a tabelas/RPCs e mutações via serviços
- **Testes relacionados:** `test-admin-events-fast-mode.mjs`, `test-admin-events-fast-rpc.mjs`, `test-admin-slow-endpoints-optimized.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/api/admin/events/route.ts; src/app/api/admin/events/[eventId]/route.ts`, `export GET`, `export POST`, `export PATCH`

### `event-admin.ui` — Editor/lista web de eventos

- **Domain:** `domain.event-administration`
- **Path(s):** src/app/admin/eventos/AdminEventsEditor.tsx; src/app/admin/eventos/components; src/app/admin/eventos/event-editor
- **Responsabilidade:** Coordenar lista, filtros, cards e modais de criação/edição.
- **Exports/superfícies principais:** `AdminEventsEditor`, `EventEditorModal`, `CreateEventModal`
- **Chamado por:** `page-admin-events`
- **Chama:** `event-admin.api`, `table-map.admin-ui-api`, `analytics.admin-dashboard-ui`, `combo.admin-ui`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** fetch APIs admin e mantém estado React
- **Testes relacionados:** `test-admin-events-editor-event-modal-extraction.mjs`, `test-admin-events-editor-toolbar-extraction.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/eventos/AdminEventsEditor.tsx; src/app/admin/eventos/components; src/app/admin/eventos/event-editor`, `export AdminEventsEditor`, `export EventEditorModal`, `export CreateEventModal`
- **Notas:** CreateEventModal volta a fazer parse; typecheck e build locais passam. O ciclo de imports permanece somente de tipos com componentes.

### `event-admin.program-importer` — Importador de programação de eventos

- **Domain:** `domain.event-administration`
- **Path(s):** scripts/import-programacao-events.mjs
- **Responsabilidade:** Interpretar programacao.md e consultar, verificar ou gravar catálogo e inventário no Supabase.
- **Exports/superfícies principais:** `programa CLI`
- **Chamado por:** `script-import`
- **Chama:** Nenhum identificado
- **Tabelas:** `admin_users`, `events`, `event_sessions`, `venues`, `venue_sections`, `ticket_prices`, `seats`, `session_seats`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** lê programacao.md; com --apply cria ou remove eventos, sessões, setores, preços, assentos e inventário
- **Testes relacionados:** Nenhum identificado
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `scripts/import-programacao-events.mjs`, `createClient`, `parseProgramacao`, `importEvent`, `--apply`, `--summary`, `--verify`
- **Notas:** VENUE, CITY e STATE são constantes fixas para Black House/Sorocaba/SP; execução atual não validada.
### `event-admin.black-house-maintenance` — Manutenção operacional Black House

- **Domain:** `domain.event-administration`
- **Path(s):** scripts/rename-black-house-ticket-sections.mjs; scripts/split-black-house-special-items.mjs; scripts/update-black-house-sectors.mjs
- **Responsabilidade:** Inspecionar e, com --apply, normalizar setores, preços e inventário fixos da Black House.
- **Exports/superfícies principais:** `programas CLI`
- **Chamado por:** `script-bh-rename`, `script-bh-split`, `script-bh-update`
- **Chama:** Nenhum identificado
- **Tabelas:** `venues`, `venue_sections`, `ticket_prices`, `events`, `reservation_items`, `seats`, `session_seats`, `reservations`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consulta escopo Black House/Sorocaba; com --apply altera setores, preços, assentos e inventário
- **Testes relacionados:** Nenhum identificado
- **Status:** POSSÍVEL LEGADO
- **Evidência:** `scripts/rename-black-house-ticket-sections.mjs`, `scripts/split-black-house-special-items.mjs`, `scripts/update-black-house-sectors.mjs`, `createClient`, `--apply`
- **Notas:** Os três scripts fixam Black House e Sorocaba; vigência operacional não validada.

### `reservation.service` — Serviço de reservas

- **Domain:** `domain.reservation-inventory`
- **Path(s):** src/lib/tickets/services/reservations.ts
- **Responsabilidade:** Encontrar, criar e cancelar reservas numeradas, não numeradas e carrinho.
- **Exports/superfícies principais:** `findActivePendingReservationForCustomer`, `cancelPendingReservationForCustomer`, `reserveSelectedSeat`, `reserveUnnumberedSectionTickets`, `reserveTicketCart`
- **Chamado por:** `messaging.router`, `payment.checkout`, `admin.ticket-operations`
- **Chama:** `platform.supabase-client`, `customer-risk.service`
- **Tabelas:** `orders`, `reservations`, `seats`, `session_seats`, `venue_sections`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPCs transacionais e leituras auxiliares
- **Testes relacionados:** `test-reservation-load-safe.mjs`, `test-public-availability-classification.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/reservations.ts`, `export findActivePendingReservationForCustomer`, `export cancelPendingReservationForCustomer`, `export reserveSelectedSeat`

### `reservation.expiry` — Expiração e notificação de reservas

- **Domain:** `domain.reservation-inventory`
- **Path(s):** src/lib/tickets/services/reservationExpiry.ts
- **Responsabilidade:** Executar expiração, notificar comprador e ajustar conversas/sessões admin.
- **Exports/superfícies principais:** `expireReservationsAndNotify`
- **Chamado por:** `background.expire-cron`
- **Chama:** `platform.supabase-client`, `platform.logging`, `integration.zapi`, `messaging.messages`
- **Tabelas:** `reservations`, `customers`, `conversations`, `whatsapp_messages`, `admin_sessions`
- **Integrações:** `integration-supabase`, `integration-zapi`
- **Efeitos colaterais:** RPC expira; envia WhatsApp; grava mensagem/contexto
- **Testes relacionados:** `test-reservation-load-safe.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/reservationExpiry.ts`, `export expireReservationsAndNotify`

### `customer-risk.service` — Risco do comprador

- **Domain:** `domain.customer-risk`
- **Path(s):** src/lib/tickets/services/buyerRisk.ts
- **Responsabilidade:** Avaliar limites/sinais de abuso e registrar eventos.
- **Exports/superfícies principais:** `recordBuyerRiskEvent`, `checkReservationRisk`, `recordReservationCreated`, `recordReservationCancelled`, `checkCheckoutRisk`
- **Chamado por:** `reservation.service`, `payment.checkout`
- **Chama:** `platform.supabase-client`, `platform.logging`
- **Tabelas:** `buyer_risk_events`, `customers`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** select/insert de risco
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/buyerRisk.ts`, `export recordBuyerRiskEvent`, `export checkReservationRisk`, `export recordReservationCreated`

### `payment.checkout` — Serviço de checkout de ingresso

- **Domain:** `domain.orders-payments`
- **Path(s):** src/lib/tickets/services/checkout.ts
- **Responsabilidade:** Criar pedido, validar acesso, reconciliar e criar pagamento Pix.
- **Exports/superfícies principais:** `createCheckoutForReservation`, `getPublicCheckoutOrder`, `trackTicketCheckoutClick`, `verifyPublicCheckoutAccess`, `reconcileApprovedCheckoutPayment`, `paySelfHostedCheckout`
- **Chamado por:** `messaging.router`, `payment.api-ui`
- **Chama:** `platform.env`, `platform.supabase-client`, `platform.logging`, `integration.mercado-pago`, `customer-risk.service`, `payment.primitives`, `catalog.visibility`, `ticket.delivery`
- **Tabelas:** `customers`, `event_sessions`, `orders`, `payments`, `reservation_items`, `reservations`, `session_seats`, `venue_sections`
- **Integrações:** `integration-supabase`, `integration-mercado-pago`
- **Efeitos colaterais:** insere/atualiza pedido/pagamento; chama MP; pode entregar ingresso
- **Testes relacionados:** `test-checkout-pix-requirements.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/checkout.ts`, `export createCheckoutForReservation`, `export getPublicCheckoutOrder`, `export trackTicketCheckoutClick`

### `payment.api-ui` — Checkout web e APIs de ingresso

- **Domain:** `domain.orders-payments`
- **Path(s):** src/app/checkout; src/app/api/checkout
- **Responsabilidade:** Renderizar checkout/retornos e expor criação/status.
- **Exports/superfícies principais:** `pages checkout`, `route handlers`
- **Chamado por:** `page-checkout`, `page-checkout-success`, `page-checkout-pending`, `page-checkout-failure`, `http-checkout-mp`, `http-checkout-pay`, `http-checkout-status`
- **Chama:** `payment.checkout`, `platform.rate-limit`, `platform.http`
- **Tabelas:** `orders`
- **Integrações:** `integration-mercado-pago`, `integration-supabase`
- **Efeitos colaterais:** fetch API; API cria/consulta pagamento
- **Testes relacionados:** `test-checkout-pix-requirements.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/checkout; src/app/api/checkout`, `export pages checkout`, `export route handlers`

### `payment.webhook` — Handler Mercado Pago

- **Domain:** `domain.orders-payments`
- **Path(s):** src/app/api/webhook/payment/mercado-pago/route.ts
- **Responsabilidade:** Validar webhook, registrar evento, consultar pagamento e confirmar pedido ticket/combo.
- **Exports/superfícies principais:** `POST`
- **Chamado por:** `http-mp-webhook`
- **Chama:** `platform.env`, `platform.http`, `platform.logging`, `platform.rate-limit`, `platform.supabase-client`, `integration.mercado-pago`, `payment.primitives`, `ticket.delivery`, `combo.offers`
- **Tabelas:** `orders`, `payments`, `payment_events`, `combo_orders`
- **Integrações:** `integration-supabase`, `integration-mercado-pago`, `integration-zapi`
- **Efeitos colaterais:** registra payment_event; confirma pedido; aciona entrega
- **Testes relacionados:** `test-paid-delivery-outbound-idempotency.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/api/webhook/payment/mercado-pago/route.ts`, `export POST`

### `payment.primitives` — Primitivas de pagamento

- **Domain:** `domain.orders-payments`
- **Path(s):** src/lib/tickets/services/payments.ts
- **Responsabilidade:** Converter valores e construir/extrair referência externa.
- **Exports/superfícies principais:** `buildOrderExternalReference`, `extractOrderIdFromExternalReference`, `decimalAmountToCents`, `centsToDecimalAmount`
- **Chamado por:** `payment.checkout`, `payment.webhook`, `combo.offers`
- **Chama:** Nenhum identificado
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** nenhum efeito externo identificado
- **Testes relacionados:** `test-checkout-pix-requirements.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/payments.ts`, `export buildOrderExternalReference`, `export extractOrderIdFromExternalReference`, `export decimalAmountToCents`

### `ticket.service` — Serviço de ingressos e tokens

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/lib/tickets/services/tickets.ts; src/lib/tickets/services/publicDtos.ts
- **Responsabilidade:** Assinar/verificar token, consultar ingresso, participantes e marcações de entrega.
- **Exports/superfícies principais:** `createSignedTicketToken`, `verifySignedTicketToken`, `getTicketsForOrder`, `assignParticipantContactsToOrderTickets`, `getTicketBySignedToken`
- **Chamado por:** `messaging.router`, `messaging.webhook`, `ticket.delivery`, `ticket.public-page`, `gate.validation`, `combo.offers`
- **Chama:** `platform.supabase-client`, `gate.access-session`
- **Tabelas:** `customers`, `tickets`, `ticket_validation_events`, `official_table_map_reservations`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPCs e updates de entrega
- **Testes relacionados:** `test-ticket-delivery-distribution.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/tickets.ts; src/lib/tickets/services/publicDtos.ts`, `export createSignedTicketToken`, `export verifySignedTicketToken`, `export getTicketsForOrder`

### `ticket.delivery` — Entrega de ingressos

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/lib/tickets/services/ticketDelivery.ts
- **Responsabilidade:** Montar preferência/payload e enviar ingressos ao comprador/participantes.
- **Exports/superfícies principais:** `buildTicketDeliveryMessage`, `buildTicketDeliveryPayload`, `requestTicketDeliveryPreferenceForOrder`, `deliverTicketsForOrder`
- **Chamado por:** `messaging.router`, `payment.checkout`, `payment.webhook`
- **Chama:** `platform.supabase-client`, `integration.zapi`, `ticket.service`, `ticket.qr`, `messaging.messages`, `messaging.outbound-deliveries`, `table-map.catalog-render`
- **Tabelas:** `conversations`, `orders`
- **Integrações:** `integration-supabase`, `integration-zapi`
- **Efeitos colaterais:** gera imagens; envia WhatsApp; grava delivery/mensagem
- **Testes relacionados:** `test-ticket-delivery-distribution.mjs`, `test-paid-delivery-conversation-fallback.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/ticketDelivery.ts`, `export buildTicketDeliveryMessage`, `export buildTicketDeliveryPayload`, `export requestTicketDeliveryPreferenceForOrder`

### `ticket.qr` — Renderizador QR de ingresso

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/lib/tickets/services/ticketQrImage.ts
- **Responsabilidade:** Compor QR e textos no template de ingresso.
- **Exports/superfícies principais:** `generateTicketQrImage`, `ticketQrImageToDataUrl`
- **Chamado por:** `ticket.delivery`
- **Chama:** `brand.shell-assets`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** lê template/fontes e gera buffer/data URL
- **Testes relacionados:** `test-ticket-qr-image-template.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/ticketQrImage.ts`, `export generateTicketQrImage`, `export ticketQrImageToDataUrl`

### `ticket.public-page` — Página pública de ingresso

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/app/tickets/[token]/page.tsx
- **Responsabilidade:** Resolver token e mostrar dados do ingresso.
- **Exports/superfícies principais:** `default page`
- **Chamado por:** `page-ticket`
- **Chama:** `ticket.service`, `brand.shell-assets`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** consulta server-side
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/app/tickets/[token]/page.tsx`, `export default page`

### `ticket.free-issuance` — Emissão gratuita pública

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/lib/tickets/services/publicFreeTickets.ts
- **Responsabilidade:** Emitir pedido/ingresso sem pagamento respeitando limites.
- **Exports/superfícies principais:** `issuePublicFreeTicketsForOrder`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `catalog.visibility`
- **Tabelas:** `courtesy_section_limits`, `orders`, `reservation_items`, `reservations`, `tickets`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPC transacional de emissão
- **Testes relacionados:** `test-public-availability-classification.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/publicFreeTickets.ts`, `export issuePublicFreeTicketsForOrder`

### `admin.ticket-operations` — Operações admin de ingressos

- **Domain:** `domain.ticketing-delivery`
- **Path(s):** src/lib/tickets/services/adminTickets.ts
- **Responsabilidade:** Buscar ingressos/reservas, validações e cancelar pendência.
- **Exports/superfícies principais:** `findAdminTicketsByPhone`, `findAdminPendingReservationsByInput`, `findAdminTicketByCode`, `listAdminTicketValidations`, `cancelAdminPendingReservation`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `reservation.service`
- **Tabelas:** `customers`, `orders`, `payments`, `reservations`, `tickets`, `ticket_validation_events`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consultas e cancelamento RPC via reservation
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminTickets.ts`, `export findAdminTicketsByPhone`, `export findAdminPendingReservationsByInput`, `export findAdminTicketByCode`

### `admin.auth` — Autenticação/autorização admin

- **Domain:** `domain.admin-identity-access`
- **Path(s):** src/lib/tickets/services/adminAuth.ts; src/lib/tickets/services/adminLoginFlow.ts; src/lib/tickets/services/adminWebAuth.ts
- **Responsabilidade:** Gerir hash, permissões, challenges, sessões WhatsApp/web, cookie e CSRF.
- **Exports/superfícies principais:** `ADMIN_ROLE_PERMISSIONS`, `startAdminLogin`, `createAdminSession`, `requireAdminEventEditorSession`, `assertAdminCsrf`
- **Chamado por:** `messaging.router`, `messaging.webhook`, `admin.login-ui-api`, `event-admin.api`, `combo.admin-ui`, `analytics.operational-dashboard`
- **Chama:** `platform.env`, `platform.supabase-client`, `platform.logging`, `messaging.state`
- **Tabelas:** `admin_users`, `admin_sessions`, `admin_auth_attempts`, `admin_login_challenges`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** insert/update/revoke sessão e challenge; cookies por handlers
- **Testes relacionados:** `test-admin-auth-pending-cancel.mjs`, `test-admin-web-auth-fast.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminAuth.ts; src/lib/tickets/services/adminLoginFlow.ts; src/lib/tickets/services/adminWebAuth.ts`, `export ADMIN_ROLE_PERMISSIONS`, `export startAdminLogin`, `export createAdminSession`

### `admin.users` — Administração de usuários admin

- **Domain:** `domain.admin-identity-access`
- **Path(s):** src/lib/tickets/services/adminUsers.ts
- **Responsabilidade:** Listar/criar/desabilitar/reativar usuários, mudar papel e senha.
- **Exports/superfícies principais:** `listAdminUsers`, `createAdminUser`, `updateAdminRole`, `disableAdminUser`, `reactivateAdminUser`, `renewAdminPassphrase`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `admin.auth`
- **Tabelas:** `admin_users`, `admin_sessions`, `admin_auth_attempts`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** muta usuários/sessões/tentativas
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminUsers.ts`, `export listAdminUsers`, `export createAdminUser`, `export updateAdminRole`

### `admin.login-ui-api` — Login administrativo web

- **Domain:** `domain.admin-identity-access`
- **Path(s):** src/app/admin/login; src/app/admin/eventos/abrir/[token]/route.ts; src/app/api/admin/login/verify/route.ts
- **Responsabilidade:** Consumir link/código, validar challenge e estabelecer cookies.
- **Exports/superfícies principais:** `page/login form`, `GET abrir token`, `POST verify`
- **Chamado por:** `page-admin-login`, `http-admin-open`, `http-admin-login`
- **Chama:** `admin.auth`, `platform.rate-limit`, `platform.logging`, `brand.shell-assets`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** define/remove cookies e consome challenge
- **Testes relacionados:** `test-admin-web-auth-fast.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/login; src/app/admin/eventos/abrir/[token]/route.ts; src/app/api/admin/login/verify/route.ts`, `export page/login form`, `export GET abrir token`, `export POST verify`

### `gate.access-session` — Acessos e sessões de portaria/cozinha

- **Domain:** `domain.gate-admission`
- **Path(s):** src/lib/tickets/services/gateTokens.ts; src/lib/tickets/services/gateSessions.ts; src/lib/tickets/services/gateAccesses.ts; src/lib/tickets/services/fixedGateAccesses.ts; src/lib/tickets/services/gateAccessAuth.ts
- **Responsabilidade:** Criar/hash tokens, gerir acessos, sessões e vínculo de dispositivo.
- **Exports/superfícies principais:** `createGateSession`, `validateGateSessionToken`, `claimKitchenSessionDevice`, `createGateAccess`, `createFixedGateAccess`
- **Chamado por:** `messaging.router`, `gate.validation`, `gate.ui-api`, `combo.redemption`
- **Chama:** `platform.env`, `platform.supabase-client`, `admin.auth`
- **Tabelas:** `events`, `event_sessions`, `gate_sessions`, `gate_accesses`, `fixed_gate_accesses`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** insere/atualiza acessos e sessões
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/gateTokens.ts; src/lib/tickets/services/gateSessions.ts; src/lib/tickets/services/gateAccesses.ts; src/lib/tickets/services/fixedGateAccesses.ts; src/lib/tickets/services/gateAccessAuth.ts`, `export createGateSession`, `export validateGateSessionToken`, `export claimKitchenSessionDevice`

### `gate.validation` — Validação/consulta de ingresso

- **Domain:** `domain.gate-admission`
- **Path(s):** src/lib/tickets/services/gateValidation.ts; src/lib/tickets/services/gateTicketConsultation.ts
- **Responsabilidade:** Interpretar código, consultar e validar entrada no escopo da sessão.
- **Exports/superfícies principais:** `validateGateScan`, `validateGateTicketCode`, `consultGateTicket`
- **Chamado por:** `gate.ui-api`, `messaging.router`
- **Chama:** `platform.supabase-client`, `platform.logging`, `gate.access-session`, `ticket.service`, `combo.redemption`
- **Tabelas:** `tickets`, `ticket_validation_events`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** chama validate_ticket_entry e registra evento
- **Testes relacionados:** `test-public-event-visibility-policy.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/gateValidation.ts; src/lib/tickets/services/gateTicketConsultation.ts`, `export validateGateScan`, `export validateGateTicketCode`, `export consultGateTicket`

### `gate.ui-api` — Portaria web e APIs

- **Domain:** `domain.gate-admission`
- **Path(s):** src/app/gate; src/app/api/gate
- **Responsabilidade:** Renderizar scanner e expor consult/scan/validate.
- **Exports/superfícies principais:** `GateSessionScanner`, `route handlers`
- **Chamado por:** `page-gate`, `http-gate-consult`, `http-gate-scan`, `http-gate-validate`
- **Chama:** `gate.access-session`, `gate.validation`, `platform.rate-limit`, `platform.http`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** usa câmera; fetch APIs; valida ingresso
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/app/gate; src/app/api/gate`, `export GateSessionScanner`, `export route handlers`

### `courtesy.service` — Serviço de cortesias

- **Domain:** `domain.courtesy`
- **Path(s):** src/lib/tickets/services/adminCourtesies.ts
- **Responsabilidade:** Listar alvos, emitir/cancelar cortesia e montar entrega.
- **Exports/superfícies principais:** `issueAdminCourtesy`, `listCourtesyEvents`, `listCourtesiesForEvent`, `cancelCourtesyForEvent`, `buildCourtesyDeliveryForPhone`
- **Chamado por:** `messaging.router`, `event-admin.api`
- **Chama:** `platform.supabase-client`, `ticket.service`, `catalog.inventory-read`, `catalog.visibility`
- **Tabelas:** `courtesies`, `courtesy_limits`, `courtesy_section_limits`, `customers`, `events`, `event_sessions`, `session_seats`, `ticket_prices`, `tickets`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPC de emissão e mutações de cortesia
- **Testes relacionados:** `audit_admin_courtesies.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminCourtesies.ts`, `export issueAdminCourtesy`, `export listCourtesyEvents`, `export listCourtesiesForEvent`

### `combo.offers` — Serviço monolítico de ofertas/checkout/entrega

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/lib/tickets/services/comboOffers.ts; src/lib/tickets/comboOfferCron.ts
- **Responsabilidade:** CRUD de ofertas, pedido/checkout, Pix, confirmação, expiração, seleção agendada e entrega.
- **Exports/superfícies principais:** `createComboOffer`, `listComboOffers`, `duplicateComboOffer`, `createComboOrderForCheckout`, `payComboCheckout`, `deliverComboOrder`, `confirmPaidComboOrder`, `sendScheduledComboOffers`
- **Chamado por:** `messaging.router`, `payment.webhook`, `combo.checkout-ui-api`, `combo.admin-ui`
- **Chama:** `platform.env`, `platform.supabase-client`, `platform.logging`, `integration.mercado-pago`, `integration.zapi`, `messaging.customers`, `messaging.conversations`, `messaging.messages`, `messaging.outbound-deliveries`, `payment.primitives`, `catalog.visibility`, `combo.qr`
- **Tabelas:** `combo_offers`, `combo_offer_scopes`, `combo_offer_event_locks`, `combo_orders`, `combo_payments`, `combo_redemptions`, `event_sessions`, `official_table_map_reservations`, `orders`, `tickets`, `whatsapp_messages`
- **Integrações:** `integration-supabase`, `integration-mercado-pago`, `integration-zapi`
- **Efeitos colaterais:** muta catálogo/pedidos; chama MP; envia WhatsApp/QR
- **Testes relacionados:** `test-combo-offer-priority.mjs`, `test-combo-offer-priority-real.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/services/comboOffers.ts; src/lib/tickets/comboOfferCron.ts`, `export createComboOffer`, `export listComboOffers`, `export duplicateComboOffer`

### `combo.checkout-ui-api` — Checkout web e APIs de combo

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/app/combo-checkout; src/app/api/combo-checkout
- **Responsabilidade:** Renderizar checkout e expor pay/status de combo.
- **Exports/superfícies principais:** `pages combo checkout`, `route handlers`
- **Chamado por:** `page-combo-checkout`, `http-combo-pay`, `http-combo-status`
- **Chama:** `combo.offers`, `platform.rate-limit`, `platform.http`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-mercado-pago`, `integration-supabase`
- **Efeitos colaterais:** fetch API e cria/consulta pagamento
- **Testes relacionados:** `test-checkout-pix-requirements.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/combo-checkout; src/app/api/combo-checkout`, `export pages combo checkout`, `export route handlers`

### `combo.redemption` — Preparo e resgate de combo

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/lib/tickets/services/comboRedemptions.ts
- **Responsabilidade:** Validar sessão/QR, liberar após entrada, preparar e solicitar escolha de entrega; consumo final bloqueado no leitor atual.
- **Exports/superfícies principais:** `validateKitchenSessionToken`, `releaseComboOrdersForKitchenAfterGateEntry`, `startKitchenOrderPreparation`, `validateComboRedemptionScan`, `confirmComboDeliveryChoice`
- **Chamado por:** `messaging.router`, `gate.validation`, `combo.kitchen-reader-ui-api`
- **Chama:** `platform.supabase-client`, `integration.zapi`, `combo.offers`, `combo.qr`, `gate.access-session`, `messaging.messages`, `catalog.visibility`, `table-map.catalog-render`
- **Tabelas:** `combo_redemptions`, `combo_redemption_events`, `event_sessions`, `official_table_map_reservations`, `tickets`
- **Integrações:** `integration-supabase`, `integration-zapi`
- **Efeitos colaterais:** RPC de validação; updates; envia mensagens/QR
- **Testes relacionados:** `audit_combo_redemption_security.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Correção Etapa 3:** `comboRedemptions.ts:1035–1231` retorna para todo combo válido pago/emitido antes da RPC de consumo em `:1462`, inclusive após escolha confirmada. A RPC isolada não comprova conclusão pelo leitor. Ver `combo.redeem` no catálogo.
- **Evidência:** `src/lib/tickets/services/comboRedemptions.ts`, `export validateKitchenSessionToken`, `export releaseComboOrdersForKitchenAfterGateEntry`, `export startKitchenOrderPreparation`

### `combo.qr` — Renderizador QR de combo

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/lib/tickets/services/comboQrImage.ts
- **Responsabilidade:** Compor QR e dados no template de combo.
- **Exports/superfícies principais:** `generateComboQrImageBuffer`, `generateComboQrImage`, `comboQrImageToDataUrl`
- **Chamado por:** `combo.offers`, `combo.redemption`
- **Chama:** `brand.shell-assets`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** lê template/fontes e gera imagem
- **Testes relacionados:** `test-combo-qr-image-template.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/comboQrImage.ts`, `export generateComboQrImageBuffer`, `export generateComboQrImage`, `export comboQrImageToDataUrl`

### `combo.kitchen-reader-ui-api` — Cozinha e leitor de ofertas

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/app/kitchen; src/app/offer-reader; src/app/api/kitchen
- **Responsabilidade:** Abrir dispositivo/sessão, ler QR, preparar e validar combo.
- **Exports/superfícies principais:** `KitchenAccessClient`, `KitchenSessionScanner`, `OfferQrScanner`, `route handlers`
- **Chamado por:** `page-kitchen-access`, `page-kitchen-session`, `page-offer-reader`, `http-kitchen-open`, `http-kitchen-prepare`, `http-kitchen-scan`, `http-kitchen-validate`
- **Chama:** `combo.redemption`, `gate.access-session`, `platform.rate-limit`, `platform.http`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** usa câmera/cookies; fetch APIs; muta preparo/resgate
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/app/kitchen; src/app/offer-reader; src/app/api/kitchen`, `export KitchenAccessClient`, `export KitchenSessionScanner`, `export OfferQrScanner`

### `combo.admin-ui` — Admin de ofertas de combo

- **Domain:** `domain.combo-commerce-fulfillment`
- **Path(s):** src/app/admin/eventos/combo-editor; src/app/admin/eventos/components/AdminComboOfferCard.tsx; src/app/admin/eventos/components/AdminComboOfferGrid.tsx; src/app/api/admin/combo-offers
- **Responsabilidade:** Listar, criar, editar, duplicar e excluir ofertas.
- **Exports/superfícies principais:** `AdminComboOffersSection`, `ComboOfferModal`, `CreateComboOfferModal`, `route handlers`
- **Chamado por:** `event-admin.ui`, `http-admin-combos`, `http-admin-combo-id`
- **Chama:** `admin.auth`, `combo.offers`, `platform.supabase-client`
- **Tabelas:** `combo_offers`, `combo_offer_scopes`, `combo_orders`, `whatsapp_messages`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** fetch API; APIs consultam/mutam ofertas
- **Testes relacionados:** `test-admin-events-editor-combo-section-extraction.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/eventos/combo-editor; src/app/admin/eventos/components/AdminComboOfferCard.tsx; src/app/admin/eventos/components/AdminComboOfferGrid.tsx; src/app/api/admin/combo-offers`, `export AdminComboOffersSection`, `export ComboOfferModal`, `export CreateComboOfferModal`

### `table-map.catalog-render` — Catálogo, coordenadas e render do mapa

- **Domain:** `domain.table-map`
- **Path(s):** src/lib/tickets/tableMap; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts
- **Responsabilidade:** Definir lugares/metadados, ler coordenadas e renderizar PNG/SVG.
- **Exports/superfícies principais:** `OFFICIAL_TABLE_MAP_PLACES`, `getOfficialTableMapPlaces`, `renderOfficialTableMap`, `buildSeatMapPngDataUrl`
- **Chamado por:** `table-map.reservation`, `table-map.admin-ui-api`, `ticket.delivery`, `combo.redemption`
- **Chama:** `platform.supabase-client`, `brand.shell-assets`
- **Tabelas:** `official_table_map_places`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** lê DB e filesystem; gera buffers
- **Testes relacionados:** `test-official-table-map.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/tableMap; src/lib/tickets/services/seatMapImage.ts; src/lib/tickets/services/pngImage.ts`, `export OFFICIAL_TABLE_MAP_PLACES`, `export getOfficialTableMapPlaces`, `export renderOfficialTableMap`

### `table-map.reservation` — Reserva de lugar oficial

- **Domain:** `domain.table-map`
- **Path(s):** src/lib/tickets/services/officialTableMapReservations.ts
- **Responsabilidade:** Listar disponibilidade, produzir imagem e reservar lugar.
- **Exports/superfícies principais:** `listOfficialTableMapAvailability`, `buildOfficialTableMapAvailabilityImage`, `reserveOfficialTableMapPlace`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `platform.logging`, `table-map.catalog-render`
- **Tabelas:** `official_table_map_reservations`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consulta e RPC de reserva
- **Testes relacionados:** `test-official-table-map.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/officialTableMapReservations.ts`, `export listOfficialTableMapAvailability`, `export buildOfficialTableMapAvailabilityImage`, `export reserveOfficialTableMapPlace`

### `table-map.admin-ui-api` — Calibrador e API do mapa

- **Domain:** `domain.table-map`
- **Path(s):** src/app/admin/AdminTableMapCalibrator.tsx; src/app/admin/eventos/event-editor/EventTableMapTab.tsx; src/app/api/admin/table-map/route.ts; src/lib/tickets/tableMap/persistOfficialPlaces.ts
- **Responsabilidade:** Editar, validar, persistir coordenadas e gerar preview.
- **Exports/superfícies principais:** `AdminTableMapCalibrator`, `EventTableMapTab`, `GET`, `PUT`, `persistOfficialTableMapPlaces`
- **Chamado por:** `event-admin.ui`, `http-admin-map`
- **Chama:** `admin.auth`, `table-map.catalog-render`, `platform.supabase-client`
- **Tabelas:** `official_table_map_places`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** fetch API; upsert coordenadas; render preview
- **Testes relacionados:** `test-official-table-map.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/AdminTableMapCalibrator.tsx; src/app/admin/eventos/event-editor/EventTableMapTab.tsx; src/app/api/admin/table-map/route.ts; src/lib/tickets/tableMap/persistOfficialPlaces.ts`, `export AdminTableMapCalibrator`, `export EventTableMapTab`, `export GET`

### `analytics.reports` — Relatórios administrativos

- **Domain:** `domain.analytics-reporting`
- **Path(s):** src/lib/tickets/services/adminReports.ts; src/lib/tickets/services/adminReportEvents.ts
- **Responsabilidade:** Selecionar eventos, agregar vendas/cortesias/divisão e registrar baixa.
- **Exports/superfícies principais:** `buildAdminGeneralReport`, `buildAdminDivisionReport`, `buildAdminSalesEventReports`, `buildAdminReport`, `searchAdminReportEvents`
- **Chamado por:** `messaging.router`
- **Chama:** `platform.supabase-client`, `admin.auth`
- **Tabelas:** `courtesies`, `division_settlements`, `events`, `payments`, `reservations`, `session_seats`, `ticket_prices`, `ticket_validation_events`, `tickets`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consultas agregadas e update/insert de settlement
- **Testes relacionados:** `audit_admin_reports.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminReports.ts; src/lib/tickets/services/adminReportEvents.ts`, `export buildAdminGeneralReport`, `export buildAdminDivisionReport`, `export buildAdminSalesEventReports`
- **Notas:** Contém função Legacy sem uso reportada pelo lint.

### `analytics.contacts` — Analytics de contatos

- **Domain:** `domain.analytics-reporting`
- **Path(s):** src/lib/tickets/services/adminContactAnalytics.ts
- **Responsabilidade:** Combinar mensagens, reservas e operadores por contato/período.
- **Exports/superfícies principais:** `getAdminContactActivity`
- **Chamado por:** `event-admin.api`
- **Chama:** `platform.supabase-client`
- **Tabelas:** `admin_users`, `fixed_gate_accesses`, `gate_accesses`, `reservations`, `whatsapp_messages`
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** consultas agregadas
- **Testes relacionados:** `test-admin-whatsapp-outbound-status.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/services/adminContactAnalytics.ts`, `export getAdminContactActivity`

### `analytics.operational-dashboard` — Painel operacional API/página

- **Domain:** `domain.analytics-reporting`
- **Path(s):** src/app/admin/operacao; src/app/api/admin/operational-dashboard/route.ts; src/lib/tickets/services/operationalDashboardTypes.ts
- **Responsabilidade:** Autenticar e carregar séries/alertas por RPC para UI.
- **Exports/superfícies principais:** `useOperationalDashboard`, `OperationalDashboardSection`, `GET`
- **Chamado por:** `page-admin-ops`, `http-admin-ops`
- **Chama:** `admin.auth`, `platform.supabase-client`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-supabase`
- **Efeitos colaterais:** RPC get_admin_intelligence_dashboard; fetch cliente
- **Testes relacionados:** `test-admin-operational-dashboard.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/operacao; src/app/api/admin/operational-dashboard/route.ts; src/lib/tickets/services/operationalDashboardTypes.ts`, `export useOperationalDashboard`, `export OperationalDashboardSection`, `export GET`

### `analytics.admin-dashboard-ui` — Dashboards dentro do editor

- **Domain:** `domain.analytics-reporting`
- **Path(s):** src/app/admin/eventos/dashboard; src/app/admin/eventos/contacts
- **Responsabilidade:** Renderizar dashboard geral/evento e contatos usando APIs de eventos.
- **Exports/superfícies principais:** `AdminDashboardSection`, `GeneralDashboardModal`, `EventDashboardModal`, `ContactsModal`
- **Chamado por:** `event-admin.ui`
- **Chama:** `event-admin.api`, `analytics.contacts`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** fetch APIs e estado React
- **Testes relacionados:** `test-admin-events-editor-dashboard-section-extraction.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/admin/eventos/dashboard; src/app/admin/eventos/contacts`, `export AdminDashboardSection`, `export GeneralDashboardModal`, `export EventDashboardModal`

### `background.expire-cron` — Cron de expiração

- **Domain:** `domain.background-processing`
- **Path(s):** src/app/api/cron/expire-reservations/route.ts
- **Responsabilidade:** Autenticar CRON_SECRET, aplicar rate limit e disparar expiração/notificação.
- **Exports/superfícies principais:** `GET`, `POST`
- **Chamado por:** `http-cron-expire`, `trigger-cron-expire`
- **Chama:** `platform.http`, `platform.logging`, `platform.rate-limit`, `reservation.expiry`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-vercel`
- **Efeitos colaterais:** executa lote de expiração
- **Testes relacionados:** `test-reservation-load-safe.mjs`
- **Status:** CONFIRMADO
- **Evidência:** `src/app/api/cron/expire-reservations/route.ts`, `export GET`, `export POST`

### `background.batch-cron` — Cron de batches e conversas

- **Domain:** `domain.background-processing`
- **Path(s):** src/app/api/cron/process-whatsapp-batches/route.ts
- **Responsabilidade:** Autenticar cron, finalizar conversas e claim/cancel/retry de batches.
- **Exports/superfícies principais:** `processDueWhatsAppMessageBatches`, `GET`, `POST`
- **Chamado por:** `http-cron-batches`, `trigger-cron-batches`
- **Chama:** `platform.http`, `platform.logging`, `platform.rate-limit`, `messaging.batches`, `messaging.finalizer`
- **Tabelas:** Nenhum identificado
- **Integrações:** `integration-vercel`
- **Efeitos colaterais:** cancela batches com reason configurado; finaliza conversas
- **Testes relacionados:** `test-whatsapp-batch-compat.mjs`
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `src/app/api/cron/process-whatsapp-batches/route.ts`, `export processDueWhatsAppMessageBatches`, `export GET`, `export POST`
- **Notas:** Pipeline de resposta ao cliente por batch está desabilitado.

### `automation.codex-requests` — Classificação de pedidos Codex

- **Domain:** `domain.codex-automation`
- **Path(s):** src/lib/tickets/codexRequests.ts
- **Responsabilidade:** Restringir telefone autorizado e detectar pedido Codex no contexto.
- **Exports/superfícies principais:** `isCodexRequest`, `getCodexAllowedPhones`
- **Chamado por:** `messaging.webhook`, `automation.local-runner`
- **Chama:** `messaging.state`
- **Tabelas:** Nenhum identificado
- **Integrações:** Nenhum identificado
- **Efeitos colaterais:** nenhum efeito externo identificado
- **Testes relacionados:** Nenhum identificado
- **Status:** CONFIRMADO
- **Evidência:** `src/lib/tickets/codexRequests.ts`, `export isCodexRequest`, `export getCodexAllowedPhones`

### `automation.local-runner` — Runner e listador Codex local

- **Domain:** `domain.codex-automation`
- **Path(s):** scripts/codex-local-runner.mjs; scripts/list-codex-requests.mjs
- **Responsabilidade:** Consultar pedidos aprovados, executar processo Codex e enviar resumo opcional.
- **Exports/superfícies principais:** `programas CLI`
- **Chamado por:** `npm-codex-runner`, `npm-codex-requests`, `script-codex-runner`, `script-codex-list`
- **Chama:** `automation.codex-requests`, `integration.zapi`
- **Tabelas:** `whatsapp_messages`
- **Integrações:** `integration-supabase`, `integration-zapi`, `integration-codex-cli`
- **Efeitos colaterais:** spawn de processo; consulta mensagens; envio externo
- **Testes relacionados:** Nenhum identificado
- **Status:** PARCIALMENTE CONFIRMADO
- **Evidência:** `scripts/codex-local-runner.mjs; scripts/list-codex-requests.mjs`, `export programas CLI`

## Critério de agrupamento

- Route handlers extensos foram mantidos como modules quando agregam autenticação, persistência e regras.
- Componentes de uma mesma superfície foram agrupados, salvo quando formam fronteira técnica própria, como dashboards, combos e mapa.
- Reexports finos `adminSessions.ts`, `adminSections.ts`, `adminSeats.ts` e `adminPrices.ts` pertencem ao module `event-admin.service`.
- Helpers de formatação e diálogo público pertencem a `messaging.public-dialog`.
- RPCs, triggers e tabelas são nós de banco em `dependencies.json`, não modules TypeScript.
