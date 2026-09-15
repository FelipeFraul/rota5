> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

# Inventário do repositório

> **HISTORICAL SNAPSHOT:** preserved original-stage inventory; current values are projected by the Baseline 2.6.0 bannered documents and canonical machine-readable catalogs.

Baseline: 11/09/2026, commit-base `a141c6004421fb8442f95493de3ca4ec4d4c997b`.

## Contagem estrutural

| Área | Arquivos rastreados | Estado | Evidência |
| --- | ---: | --- | --- |
| raiz e configurações | 12 | CONFIRMADO | `git ls-files` |
| `.tools/` | 21 | CONFIRMADO | ferramentas `audit_*.mjs` |
| `docs/` preexistente | 10 | CONFIRMADO | documentos operacionais e históricos |
| `public/` | 15 | CONFIRMADO | imagens, fontes, `robots.txt` e PSD |
| `scripts/` | 66 | CONFIRMADO | 51 testes catalogados; auditorias e scripts operacionais podem compartilhar classificação |
| `src/` | 157 | CONFIRMADO | 113 módulos `.ts` e 45 `.tsx` no repositório total |
| `supabase/` | 79 | CONFIRMADO | 79 migrations SQL |
| **Total inicial** | **344** | CONFIRMADO | antes da documentação desta etapa |

Arquivos ignorados como `.env`, `.env.local`, `.next/`, `.tmp/`, `.vercel/` e `node_modules/` foram considerados apenas como presença ambiental. Seus conteúdos não compõem o inventário versionado e segredos não foram lidos para esta documentação.

## Configuração e raiz

| Caminho | Responsabilidade observada | Estado |
| --- | --- | --- |
| `package.json` / `package-lock.json` | scripts NPM e grafo bloqueado de dependências | CONFIRMADO |
| `next.config.ts` | headers de segurança e CORS para assets Next; contém origem Black House | CONFIRMADO / POSSÍVEL LEGADO |
| `vercel.json` | dois agendamentos cron por minuto | CONFIRMADO |
| `tsconfig.json` | TypeScript estrito, `noEmit`, resolução bundler e alias `@/*` | CONFIRMADO |
| `eslint.config.mjs` | ESLint para Next/TypeScript | CONFIRMADO |
| `.env.example` | contrato parcial de configuração | PARCIALMENTE CONFIRMADO |
| `.gitignore` / `.vercelignore` | exclusão de segredos, builds, temporários e metadados locais | CONFIRMADO |
| `design.md` / `programacao.md` | referência visual e programação/importação de eventos | CONFIRMADO; uso operacional NÃO VALIDADO |

## Aplicação Next.js

`src/app/` usa App Router. Foram encontrados 14 caminhos de página e 25 módulos `route.ts`; a lista completa está em [entrypoints.md](entrypoints.md).

### Superfícies de interface

| Área | Caminhos centrais | Responsabilidade confirmada estaticamente |
| --- | --- | --- |
| público | `src/app/page.tsx`, `InformationPage.tsx`, `BrandLogo.tsx`, `globals.css` | shell visual, marca e páginas de informação |
| ingresso | `src/app/tickets/[token]/page.tsx` | consulta pública de ingresso por token |
| checkout | `src/app/checkout/**`, `src/app/combo-checkout/**` | pagamento Pix de ingresso e combo, estados success/pending/failure |
| portaria | `src/app/gate/session/[token]/**` | leitura, consulta e validação de QR de ingresso |
| cozinha | `src/app/kitchen/**` | abertura vinculada a dispositivo, leitura, preparação e validação de combo |
| leitor de oferta | `src/app/offer-reader/session/[token]/**` | leitura de QR de oferta/combo |
| admin web | `src/app/admin/login/**`, `src/app/admin/eventos/**`, `src/app/admin/operacao/**` | login tokenizado, catálogo/editor de eventos e painel operacional |
| mapa oficial | `src/app/admin/AdminTableMapCalibrator.tsx` | calibração de coordenadas e prévia do mapa |

### Editor administrativo de eventos

`AdminEventsEditor.tsx` coordena busca, filtros e modais. Componentes foram extraídos para `components/`, `dashboard/`, `contacts/`, `combo-editor/` e `event-editor/`. O filtro inicial de eventos é `published`; criação e duplicação produzem evento `draft` no serviço e o carregamento pós-criação pede `status=all`. A diferença entre estado do filtro e recarga está confirmada no código, mas seu efeito completo no navegador permanece parcialmente validado.

`CreateEventModal.tsx` tinha um fechamento `</div>` excedente na Baseline V1.0.0. A correção mínima removeu esse token; TypeScript, ESLint e build agora passam. O serviço `createAdminEvent` cria/reutiliza local, depois evento, sessões, setores, assentos e preços em chamadas sequenciais. `duplicateAdminEvent` cria um novo local e copia sessões, setores, assentos, assentos por sessão e preços; não foi encontrada uma RPC transacional para o fluxo completo. Essas são descrições do fluxo, não avaliação de arquitetura.

## Módulos de domínio

### Núcleo de conversa e WhatsApp

- `src/lib/tickets/router.ts`: máquina de estados central; roteia fluxo público, compra, reenvio, ajuda, administração, portaria, cozinha, relatórios, cortesias, usuários e ofertas.
- `conversationState.ts`: tipos e estado persistido da conversa.
- `publicInitialFlow.ts`, `publicAllEventsFormatting.ts`, `publicEntryGate.ts`, `publicHelp.ts`, `publicHelpFlow.ts`: entrada, listagem, baixa confiança e ajuda pública.
- `messages.ts`, `eventFormatting.ts`, `numericOptions.ts`, `phones.ts`: mensagens, formatação e normalização.
- `src/app/api/webhook/zapi/route.ts`: autenticação do webhook, idempotência, persistência inbound/outbound, roteamento e envio pela Z-API.
- `services/whatsappMessageBatches.ts`, `whatsappBatchCore.ts` e rota cron: lote, claim, retry e encerramento. A resposta ao cliente por batch está explicitamente cancelada com `customer_reply_pipeline_disabled`.
- `services/whatsappOutboundDeliveries.ts` e `outboundMessages.ts`: unidade idempotente e metadados de entrega.

### Catálogo, reserva, pedido e ingresso

- `services/events.ts`, `publicEventVisibility.ts`, `publicAvailability.ts`, `sections.ts`, `seats.ts`: pesquisa, visibilidade, disponibilidade e seleção.
- `services/reservations.ts`, `reservationExpiry.ts`, `buyerRisk.ts`: reserva, expiração/cancelamento e sinais antiabuso.
- `services/checkout.ts`, `payments.ts`: pedido e integração de pagamento.
- `services/tickets.ts`, `ticketDelivery.ts`, `ticketQrImage.ts`: consulta, distribuição, reenvio e geração de imagem QR.
- `seatMapImage.ts`, `pngImage.ts`, `tableMap/**`, `officialTableMapReservations.ts`: mapas gerado e oficial, coordenadas e reservas.

### Administração

- `adminAuth.ts`, `adminLoginFlow.ts`, `adminWebAuth.ts`, `adminUsers.ts`: perfis, permissões, challenges, sessão WhatsApp e cookie web.
- `adminEvents.ts`, `adminSessions.ts`, `adminSections.ts`, `adminSeats.ts`, `adminPrices.ts`: catálogo e edição.
- `adminCourtesies.ts`, `adminTickets.ts`: cortesias, pedidos e ingressos.
- `adminReports.ts`, `adminReportEvents.ts`, `adminContactAnalytics.ts`: relatórios e contatos.
- `adminNavigation.ts`: pilha de navegação administrativa.

### Combos e acesso

- `comboOffers.ts`, `comboOfferCron.ts`, `comboQrImage.ts`, `comboRedemptions.ts`: campanha, escolha por prioridade/compra, QR e resgate.
- `gateTokens.ts`, `gateSessions.ts`, `gateAccesses.ts`, `fixedGateAccesses.ts`, `gateAccessAuth.ts`, `gateValidation.ts`, `gateTicketConsultation.ts`: acesso tokenizado e validação de ingresso.

### Infraestrutura compartilhada

- `src/lib/env.ts`: schema Zod de variáveis centrais.
- `src/lib/supabase/admin.ts`: cliente Supabase com service role.
- `src/lib/mercado-pago/client.ts` e `webhook.ts`: API e assinatura Mercado Pago.
- `src/lib/zapi/client.ts`, `format.ts`, `textEncoding.ts`: transporte, payload e reparo/sanitização textual.
- `src/lib/security/rateLimit.ts`: RPC de rate limit e comportamento de falha.
- `src/lib/logger.ts`: logs JSON e mascaramento de campos sensíveis.
- `src/lib/github/issues.ts`: criação de issue GitHub por pedido aprovado no WhatsApp.
- `src/lib/http/responses.ts`: respostas HTTP compartilhadas.

## Actions, hooks, schemas, tipos e fixtures

- Nenhum arquivo com diretiva `"use server"` e nenhum diretório dedicado `actions/` foi encontrado; mutações entram por route handlers e chamam serviços.
- Um hook nomeado foi encontrado: `src/app/admin/operacao/useOperationalDashboard.ts`, usado pelo painel operacional. Outros componentes usam hooks React localmente, sem pasta `hooks/`.
- Schemas Zod estão em `src/lib/env.ts` e nas rotas administrativas de eventos/combos; não há diretório central `schemas/` ou `validators/`.
- Tipos são colocados junto aos módulos e serviços; não há diretório central `types/`.
- Não há diretórios dedicados `fixtures/` ou `mocks/`. Scripts de teste/auditoria constroem fixtures e servidores/mocks inline.
## Banco e migrations

Foram encontrados 77 arquivos SQL versionados. A ordem nominal vai de `20260522000100` a `20260805000200`. O estado de aplicação no Supabase remoto não foi consultado nesta etapa.

### Objetos criados nas migrations

- **44 tabelas**: `admin_auth_attempts`, `admin_login_challenges`, `admin_sessions`, `admin_users`, `buyer_risk_events`, `combo_offer_event_locks`, `combo_offer_scopes`, `combo_offers`, `combo_orders`, `combo_payments`, `combo_redemption_events`, `combo_redemptions`, `conversations`, `courtesies`, `courtesy_limits`, `courtesy_section_limits`, `customers`, `division_settlements`, `event_aliases`, `event_sessions`, `events`, `fixed_gate_accesses`, `gate_accesses`, `gate_sessions`, `official_table_map_places`, `official_table_map_reservations`, `orders`, `payment_events`, `payments`, `rate_limit_events`, `reservation_items`, `reservations`, `seat_map_renders`, `seats`, `session_seats`, `ticket_prices`, `ticket_validation_events`, `tickets`, `venue_sections`, `venues`, `whatsapp_message_batch_messages`, `whatsapp_message_batches`, `whatsapp_messages`, `whatsapp_outbound_deliveries`.
- **39 nomes de função SQL** foram encontrados, incluindo RPCs de reserva, pagamento, cortesia, validação, busca, rate limit, batches e consultas administrativas. Algumas são redefinidas por migrations posteriores.
- **33 nomes de trigger** foram encontrados, principalmente atualização de `updated_at`, além da sincronização de reserva do mapa oficial.
- **0 views/materialized views** foram encontradas.
- **0 declarações `CREATE POLICY`** foram encontradas.
- RLS é habilitado nas tabelas pelas migrations. `20260612000100_restrict_public_table_access.sql` revoga acessos de `public`, `anon` e `authenticated` e concede operações ao `service_role`; migrations posteriores repetem esse padrão para novas tabelas.

A segunda passagem encontrou referências de código ou ferramentas para 43 tabelas. `seat_map_renders` aparece nas migrations e documentação preexistente, mas não teve consumidor encontrado: **ÓRFÃO estático**, sem conclusão sobre dados remotos. Foram identificados 26 nomes de RPC chamados diretamente pelo código/scripts; funções restantes incluem helpers SQL, funções de trigger e versões/redefinições cuja chamada pode ser interna.

## Assets

| Asset | Consumidor encontrado | Estado |
| --- | --- | --- |
| `logo_rota5.avif` | `BrandLogo.tsx` | consumidor CONFIRMADO; alcance de runtime NÃO VALIDADO |
| `rota5.webp`, `rota5_mb.webp` | `globals.css` e página de link expirado | CONFIRMADO |
| `mapa_mesas.webp` | calibrador e catálogo do mapa oficial | CONFIRMADO |
| `ticket_sistema.webp` | `ticketQrImage.ts` e teste | CONFIRMADO |
| `ticket_sistema_combo.webp` | `comboQrImage.ts` | CONFIRMADO |
| `fonts/BebasNeue-Regular.ttf`, `fonts/Handjet-Regular.ttf` | CSS/geração de QR | CONFIRMADO |
| `arte_combo_rota5.webp`, `dj.png`, `singer.png`, `logo_rota5.png`, `logo_rota5.webp` | nenhum consumidor textual encontrado | ÓRFÃO estático |
| `ticket_blackhouse.psd` | nenhum consumidor de runtime encontrado; arquivo-fonte editável | POSSÍVEL LEGADO |
| `/rota5.webp`, `/rota5_mb.webp` | referenced by `globals.css`, present in `public/`, HTTP 200 in Preview and Production | ACTIVE ROTA5 ASSETS |

## Scripts e ferramentas

- 43 arquivos `scripts/test-*.mjs`; inventário em [tests-inventory.md](tests-inventory.md).
- 3 auditorias de intenção WhatsApp em `scripts/audit-*.mjs`.
- 6 scripts operacionais: runner Codex, listagem de pedidos Codex, importação de programação e três scripts Black House.
- 21 auditorias integradas/reais em `.tools/`; usam fixtures próprias, tabelas remotas/locais conforme configuração e rotinas de cleanup. Elas não pertencem ao comando `npm test`.

## Documentação preexistente

`docs/` já continha visão do sistema, setup Supabase, checklist de produção, runbook do primeiro evento, teste de pagamento real, entrega/QR, firewall Vercel, guia do usuário e planos de desenvolvimento/pentest. Esses arquivos preservam contexto útil, mas contêm datas, referências de projeto e estados históricos. Nenhuma afirmação externa deles foi promovida a CONFIRMADO sem evidência atual adicional.

## Feature flags e configuração de apresentação

`src/lib/tickets/rota5Presentation.ts` define, em tempo de compilação:

- `ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY = true`;
- `ROTA5_PRESENTATION_TABLE_MAP_ENABLED = false`;
- `ROTA5_PRESENTATION_COURTESY_ENABLED = false`.

`EventEditorModal.tsx` repete localmente os dois flags de mapa e cortesia. A duplicação está confirmada; a intenção e a futura fonte de verdade são DESCONHECIDAS.

## Sinais de código sem ligação, duplicado ou legado

- `seat_map_renders` e `SEAT_MAP_STORAGE_BUCKET`: estrutura e variável existem, mas nenhuma chamada a Supabase Storage nem leitura/gravação da tabela foi encontrada. ÓRFÃO estático / POSSÍVEL LEGADO.
- `src/app/BrandLogo.tsx`: nenhuma importação de entrada foi encontrada no grafo estático, mesmo considerando imports dinâmicos e relativos. ÓRFÃO estático; seu asset permanece preservado.
- `adminReports.ts`: ESLint identificou `getDivisionSettlements` e `buildAdminDivisionReportLegacy` sem uso local. POSSÍVEL LEGADO.
- `router.ts`: imports/constantes e campos sem uso foram reportados pelo ESLint; não foram removidos.
- Assets sem referência textual foram classificados como ÓRFÃO estático, não como descartáveis.
- Referências RockBar e Black House coexistem com marca Rota5 em mensagens, fallbacks, comentários, scripts, migrations, assets e CORS. POSSÍVEL LEGADO confirmado; intenção multi-tenant não confirmada.

## Segunda passagem de rastreabilidade

A revisão adicional comparou árvore rastreada, exports/imports, referências a tabelas e RPCs, rotas HTTP, scripts NPM, 79 migrations, 51 testes, configuração Vercel/Next/TypeScript, nomes de ambiente, nomes de assets e ocorrências Rota5/RockBar/Black House. Essa passagem encontrou `.tools/`, `BrandLogo.tsx` sem importador, os assets RockBar ausentes, os assets sem consumidor, a tabela `seat_map_renders` sem chamada e variáveis usadas fora do contrato de `.env.example`.
