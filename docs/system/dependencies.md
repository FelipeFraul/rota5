> **Current Baseline 2.7.3 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Dependências arquiteturais as-is

**Data da leitura:** 2026-09-11
**Fonte machine-readable:** system-knowledge/dependencies.json
**Escopo:** dependências comprováveis no código e nas migrations locais.

## Critério de contagem

O catálogo possui **817 arestas** entre **255 nós**. O gate da Etapa 3 incluiu os nós de toolchain `npm-lint` e `npm-typecheck`, já catalogados em `entrypoints.json`, sem acrescentar dependências funcionais. As arestas estão classificadas como:

| Tipo | Quantidade | Significado |
|---|---:|---|
| DIRETA | 615 | Import, chamada, acesso a tabela/RPC, chave estrangeira, chamada SQL ou execução de trigger comprovada. |
| INDIRETA | 138 | Dependência agregada por domínio, pertencimento arquitetural ou relação derivada de módulos já comprovados. |
| EXTERNA | 64 | Uso de Supabase, Z-API, Mercado Pago, GitHub, Vercel ou Codex CLI. |

A contagem inclui relações de domínio, módulos, entrypoints, banco e integrações. Ela não é uma contagem exclusiva de imports TypeScript. Cada aresta possui source, target, relation, tipo, status e evidência no JSON.

## Grafo principal

~~~mermaid
flowchart TB
  UI[UI e páginas] --> API[Route handlers]
  API --> AUTH[Admin auth / gate sessions]
  API --> SVC[Serviços de domínio]
  API --> DB[(Supabase)]
  WEBHOOK[Webhooks] --> ROUTER[Router e orquestração]
  ROUTER --> SVC
  SVC --> DB
  SVC --> EXT[Integrações externas]
  API --> EXT
  CRON[Cron] --> PROC[Processadores]
  PROC --> DB
  PROC --> EXT
  DB --> RPC[RPCs e funções]
  TRG[Triggers] --> RPC
~~~

As relações mais centrais entre domínios são:

- WhatsApp/conversas depende de catálogo, clientes, reservas, pagamentos, ticketing, combos, mapa de mesas e processamento em background.
- Reservas liga catálogo/inventário a clientes, pedidos/pagamentos e mapa oficial.
- Pedidos/pagamentos liga checkout e Mercado Pago à emissão e entrega de tickets ou combos.
- Identidade administrativa é compartilhada pelas superfícies de eventos, tickets, usuários, relatórios, cortesias, combos e mapa.
- Sessões de acesso são compartilhadas por portaria, leitores de combo, ofertas e superfícies administrativas.
- Analytics lê entidades operacionais de eventos, tickets, validações, pedidos, pagamentos, combos e contatos.
- Infraestrutura de ambiente, Supabase, logging, respostas e rate limit atravessa quase todos os entrypoints HTTP.

## Dependências entre módulos centrais

| Origem | Dependências observadas |
|---|---|
| messaging.webhook | messaging.router, conversas, clientes, batches, logger, rate limit, Z-API e GitHub issues |
| platform.edge-proxy | CSP, nonce, consume_rate_limit via REST e Supabase |
| messaging.router | catálogo, reservas, pagamentos, tickets, combos, mesas, mensagens, estado e respostas Z-API |
| event-admin.ui | APIs administrativas de eventos e componentes internos do editor |
| event-admin.program-importer | programacao.md, cliente Supabase próprio e tabelas de catálogo/inventário |
| event-admin.black-house-maintenance | cliente Supabase próprio e tabelas de catálogo/inventário fixas da Black House |
| event-admin.api | admin.auth, event-admin.service, Supabase e módulos de resposta/log |
| payment.checkout | reservas, pedidos, clientes, Mercado Pago e Supabase |
| payment.webhook | Mercado Pago, pedidos, pagamentos, tickets, combos, entrega e Supabase |
| ticket.delivery | ticketing, QR, mensagens, Z-API, Supabase e logging |
| combo.offers | eventos, ofertas, pedidos, pagamentos, resgates, Mercado Pago, Z-API e Supabase |
| gate.validation | sessões de acesso, tickets, eventos de validação e RPC validate_ticket_entry |
| analytics.reports | eventos, sessões, pedidos, tickets, validações, pagamentos, combos e Supabase |
| background.expire-cron | reservation.expiry e autorização do cron |
| background.batch-cron | messaging.finalizer, messaging.batches e autorização do cron |

## Entrypoint → módulo → banco/integração

| Grupo de entrada | Destino arquitetural | Dependências finais |
|---|---|---|
| /api/health | platform.http | resposta de saúde autocontida |
| src/proxy.ts | platform.edge-proxy | consume_rate_limit e Supabase REST |
| /api/webhook/zapi | messaging.webhook → messaging.router | tabelas de conversa e serviços de negócio; Z-API/GitHub |
| /api/webhook/payment/mercado-pago | payment.webhook | orders, payment_events, payments, combo_orders, RPC de confirmação; Mercado Pago/Z-API |
| /api/checkout/* | payment.api-ui → payment.checkout | reservas, pedidos, Mercado Pago e Supabase |
| /api/combo-checkout/* | combo.checkout-ui-api → combo.offers | ofertas, pedidos, pagamentos, QR; Mercado Pago/Z-API |
| /api/admin/events/* | event-admin.api → event-admin.service | catálogo, inventário, vendas, tickets e RPCs administrativas |
| /admin/eventos | event-admin.ui | APIs administrativas de eventos |
| /api/gate/* e /gate/session/[token] | gate.ui-api → gate.validation | tickets, validações e validate_ticket_entry |
| /api/kitchen/*, /kitchen/* e /offer-reader/session/[token] | combo.kitchen-reader-ui-api → combo.redemption | PARCIALMENTE CONFIRMADO: o leitor local alcança validate_combo_redemption após escolha confirmada e preparo; capability combo.redeem PARCIAL, sem prova mutante remota |
| /api/cron/expire-reservations | background.expire-cron → reservation.expiry | expire_reservations, conversas e Z-API |
| /api/cron/process-whatsapp-batches | background.batch-cron → batches/finalizer | tabelas e RPCs de batch |
| scripts/import-programacao-events.mjs | event-admin.program-importer | admin_users e catálogo/inventário; Supabase |
| scripts/rename-black-house-*, split-black-house-* e update-black-house-* | event-admin.black-house-maintenance | catálogo/inventário; Supabase |
| scripts/codex-* | automation.local-runner / automation.codex-requests | Codex CLI e arquivos locais de controle |

## Acessos diretos ao banco fora de services

A definição usada é: arquivo de produção sob src, fora de src/lib/tickets/services, que chama Supabase por cliente .from(), .rpc() ou REST direto. Foram confirmados **11 arquivos**.

| Arquivo | Acesso observado |
|---|---|
| src/proxy.ts | REST direto para a função consume_rate_limit |
| src/app/api/admin/combo-offers/[offerId]/route.ts | combo_offers e entidades relacionadas à oferta |
| src/app/api/admin/combo-offers/route.ts | ofertas, escopos, pedidos e mensagens |
| src/app/api/admin/events/[eventId]/route.ts | evento, sessões, setores/preços, assentos, tickets, validações, combos e RPCs do editor |
| src/app/api/admin/events/route.ts | catálogo/inventário, tickets, vendas e RPCs administrativas |
| src/app/api/admin/operational-dashboard/route.ts | RPC do dashboard operacional |
| src/app/api/checkout/status/route.ts | consulta de orders |
| src/app/api/webhook/payment/mercado-pago/route.ts | orders, payment_events, payments, combo_orders e RPCs de confirmação |
| src/lib/security/rateLimit.ts | RPC consume_rate_limit |
| src/lib/tickets/tableMap/officialPlaceCoordinates.ts | official_table_map_reservations |
| src/lib/tickets/tableMap/persistOfficialPlaces.ts | official_table_map_reservations |

Essa fronteira coexiste com o acesso feito pelos serviços. Não foi localizada uma camada repository única.

Os quatro scripts operacionais de importação/manutenção Black House também acessam o banco diretamente com clientes Supabase próprios. Eles não entram na contagem 11 porque a definição dessa métrica está restrita a arquivos de produção sob src.

## Dependências externas

- **Supabase/PostgreSQL:** cliente administrativo compartilhado com fan-in de 44 módulos/arquivos no grafo de imports; acesso PostgREST, RPC e REST no proxy.
- **Z-API:** adapter chamado pelo webhook, entrega de tickets, expiração de reservas, finalização de conversa, ofertas e resgates de combo.
- **Mercado Pago:** adapter chamado pelo checkout de tickets, combo e webhook de pagamento.
- **GitHub:** criação de issue ligada ao tratamento do webhook Z-API.
- **Vercel:** unidade de implantação e agendamento declarados em vercel.json; execução publicada não validada.
- **Codex CLI:** automação local pelos scripts de solicitações e runner.

Nenhuma chamada externa foi executada nesta etapa. A presença, a direção e o local da chamada estão confirmados pelo código; disponibilidade e configuração remotas permanecem não validadas.

## Dependências do banco

O grafo de banco inclui:

- 44 nós de tabela e relações de chave estrangeira extraídas das migrations;
- 33 nós de função/RPC e arestas de leitura/escrita para tabelas identificáveis no SQL;
- chamadas entre helpers e RPCs, incluindo locks de reserva, risco de comprador, busca normalizada e limites de cortesia;
- 33 nós de trigger e sua função de destino;
- 32 triggers de updated_at apontando para set_updated_at;
- um trigger de reservations apontando para sync_official_table_map_reservation_status.

Os maiores fan-ins de acesso TypeScript são:

| Tabela | Arquivos consumidores |
|---|---:|
| tickets | 13 |
| session_seats | 10 |
| event_sessions | 9 |
| events | 9 |
| reservations | 8 |
| customers | 8 |
| orders | 8 |
| ticket_prices | 7 |
| whatsapp_messages | 7 |
| ticket_validation_events | 7 |
| payments | 5 |
| official_table_map_reservations | 5 |
| combo_orders | 5 |

Essas contagens representam acessos encontrados no código fonte e não consultas indiretas executadas dentro de RPCs.

## Fan-in e fan-out do grafo de imports

Maiores fan-ins confirmados:

| Módulo/arquivo | Fan-in |
|---|---:|
| src/lib/supabase/admin.ts | 44 |
| logger.ts | 22 |
| http/responses.ts | 17 |
| rateLimit.ts | 16 |
| gateSessions.ts | 15 |
| AdminEventsEditor.tsx | 14 |
| InformationPage.tsx | 13 |
| env.ts | 13 |
| phones.ts | 13 |
| conversationState.ts | 11 |

Maiores fan-outs confirmados:

| Módulo/arquivo | Fan-out |
|---|---:|
| router.ts | 41 |
| webhook Z-API route.ts | 22 |
| comboOffers.ts | 15 |
| ticketDelivery.ts | 11 |
| webhook Mercado Pago route.ts | 10 |
| comboRedemptions.ts | 10 |
| reservationExpiry.ts | 9 |
| checkout.ts | 8 |
| conversationFinalizer.ts | 8 |

## Dependências circulares

O grafo completo de 428 imports contém dois componentes fortemente conexos. Ambos dependem de aresta declarada como import type:

- AdminEventsEditor.tsx ↔ conjunto de componentes do editor;
- whatsappBatchCore.ts ↔ whatsappMessageBatches.ts.

O grafo aproximado de runtime, após excluir imports explicitamente de tipo, contém zero componentes circulares confirmados. Imports dinâmicos não resolvidos estaticamente continuam fora dessa conclusão.

## Dependências não validadas

- comportamento de dependências construídas dinamicamente em runtime;
- equivalência entre funções/tabelas locais e o banco remoto;
- execução efetiva dos crons na Vercel;
- disponibilidade e credenciais atuais das integrações;
- consumidor de runtime para seat_map_renders;
- vigência operacional de referências RockBar e Black House.


## Entrypoints autocontidos ou de toolchain

A segunda passagem deixou cinco entrypoints sem aresta para module de produto por evidência explícita: page-root renderiza apenas um main vazio; npm-dev, npm-build e npm-start terminam no runtime Next.js; npm-test termina no runner dos testes inventariados na Etapa 1. Eles permanecem como nós de entrada, sem destino interno inventado.
# Baseline 2.0.1 HIGH #1 final dependency order

Protected mutations and revocation share the source lock order: credential, then `gate_sessions`, then ticket or combo. The affected modules are `gate.access-session`, `gate.validation`, `combo.redemption` and `messaging.router`. This dependency chain is locally validated and not yet deployed.
