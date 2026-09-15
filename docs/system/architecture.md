# Arquitetura as-is do Rota5

> **HISTORICAL SNAPSHOT:** preserved original-stage inventory; current values are projected by the Baseline 2.5.3 bannered documents and canonical machine-readable catalogs.

**Data da leitura:** 2026-09-11
**Commit de referência:** a141c6004421fb8442f95493de3ca4ec4d4c997b
**Escopo:** código, configuração e migrations locais; o estado publicado e o banco remoto não foram validados nesta etapa.

## Visão geral

O Rota5 está implementado como uma aplicação Next.js única, baseada em App Router. Páginas React, route handlers, webhooks e endpoints de cron entram na mesma unidade de implantação. A lógica de negócio vive principalmente em src/lib/tickets/services, mas também aparece em routers, route handlers e componentes estruturais. Não há uma camada repository geral: serviços e onze arquivos de produção fora da pasta de serviços acessam o Supabase diretamente.

O PostgreSQL/Supabase é o sistema de registro. Além das tabelas, as migrations contêm RPCs para operações que exigem consistência transacional, como reserva, confirmação de pagamento, emissão de cortesia, validação de ingresso e resgate de combo. Z-API, Mercado Pago e GitHub são acessados por adapters locais; Vercel e Codex CLI aparecem como superfícies operacionais.

~~~mermaid
flowchart LR
  U[Browser / WhatsApp / cron / CLI] --> E[Páginas, APIs, webhooks e comandos]
  E --> O[Routers e orquestração]
  O --> S[Serviços e regras de domínio]
  E --> S
  E --> D[(Supabase / PostgreSQL)]
  S --> D
  D --> F[RPCs, funções e triggers]
  O --> X[Z-API / Mercado Pago / GitHub]
  S --> X
~~~

Essa topologia é real, mas não forma uma separação rígida. O webhook da Z-API e router.ts combinam protocolo HTTP, roteamento de intenções, regras e coordenação de persistência. Algumas APIs administrativas combinam autorização, validação, regra de negócio e acesso ao banco. Componentes do editor administrativo mantêm estado e regras de edição enquanto chamam APIs.

## Camadas observadas

| Camada | Implementação observada | Limite real |
|---|---|---|
| Apresentação/UI | src/app/**/page.tsx, componentes React, scanners, checkouts e editor administrativo | Há estado e validação de formulário nos componentes; não existe store global geral. |
| Entradas HTTP e comandos | 25 route.ts, 14 páginas, src/proxy.ts, crons e CLIs | Todas entram na mesma base Next.js, exceto scripts locais. |
| Orquestração e routing | webhook Z-API, router.ts, webhook Mercado Pago, APIs administrativas e crons | Vários desses módulos também executam regra e persistência. |
| Serviços e regras de domínio | src/lib/tickets/services e serviços de admin, combo, gate, reserva, pagamento e entrega | É a maior concentração de regra, sem exclusividade de acesso a dados. |
| Acesso a dados | cliente Supabase compartilhado e chamadas .from(), .rpc() ou REST | Não há repository dedicado; o acesso está distribuído. |
| Banco e transações SQL | 44 tabelas, 39 funções e 36 triggers extraídos de 79 migrations | Arquitetura local confirmada; aplicação e equivalência remotas não foram verificadas. |
| Integrações | adapters Supabase, Z-API, Mercado Pago, GitHub, Vercel e Codex CLI | Z-API e Mercado Pago são chamados por mais de um domínio. |
| Processamento agendado | expiração de reservas, finalização de conversas e batches | A ativação e execução efetiva em produção não foi verificada. |
| Infraestrutura transversal | ambiente, logging, respostas HTTP, rate limit, marca e estado de conversa | Esses módulos têm fan-in alto e atravessam vários domínios. |

## Unidades arquiteturais

A auditoria consolidou 17 domínios e 66 módulos. Os domínios não correspondem sempre a pastas isoladas. WhatsApp, por exemplo, concentra o webhook e o router em src/app/api/webhook/zapi e src/lib/tickets/router.ts, mas chama catálogo, reservas, pedidos, pagamento, ticketing, combos e mapa de mesas. Administração de eventos atravessa UI, APIs e o serviço adminEvents.ts. Identidade administrativa é usada por quase todas as APIs de administração e por sessões de portaria.

Os módulos canônicos, seus caminhos e relações estão em [modules.md](modules.md) e system-knowledge/modules.json. A composição por domínio está em [domains.md](domains.md) e system-knowledge/domains.json.

## Cadeias técnicas principais

| Entrada | Módulos principais | Banco/integração |
|---|---|---|
| Proxy de páginas | platform.edge-proxy | CSP e consume_rate_limit via REST direto ao Supabase |
| Webhook Z-API | messaging.webhook → messaging.router → serviços de domínio | Supabase, Z-API e GitHub |
| Checkout de ingresso | payment.api-ui → payment.checkout | Mercado Pago; webhook → confirm_paid_ticket_order; entrega por Z-API |
| Checkout de combo | combo.checkout-ui-api → combo.offers | Mercado Pago; webhook; QR e envio por Z-API |
| Administração de evento | event-admin.ui → event-admin.api → event-admin.service | Supabase; parte das APIs também acessa tabelas/RPCs diretamente |
| Portaria | gate.ui-api → gate.access-session → gate.validation | validate_ticket_entry e tabelas de gate/ticket |
| Leitor de oferta/combo | combo.kitchen-reader-ui-api → gate.access-session → combo.redemption | PARCIALMENTE CONFIRMADO: o leitor local alcança validate_combo_redemption após escolha confirmada e preparo; combo.redeem PARCIAL, sem prova mutante remota |
| Importação de programação | event-admin.program-importer | lê programacao.md; com --apply grava catálogo/inventário diretamente no Supabase |
| Cron de expiração | background.expire-cron → reservation.expiry | expire_reservations e Z-API |
| Cron de batches | background.batch-cron → messaging.finalizer/messaging.batches | Tabelas e RPCs de batches; execução publicada não validada |

## Estado e fronteiras

O estado persistente de conversa, clientes, inventário, pedidos, pagamentos, tickets, sessões administrativas, combos e mapa oficial reside no banco. O estado transitório de UI fica em componentes React. conversationState.ts centraliza a representação e a evolução do contexto conversacional. O cliente administrativo do Supabase e a leitura de ambiente são compartilhados no processo. Não foi encontrada uma store global de aplicação nem uma camada geral de eventos internos.

As fronteiras transacionais mais claras estão nas RPCs PostgreSQL. As operações administrativas de criação/edição de evento também incluem sequências de chamadas TypeScript; portanto, nem toda operação multi-entidade está comprovadamente encerrada em uma única transação de banco. As APIs validam autenticação administrativa antes de chamar serviços ou o Supabase, mas parte da regra ainda vive no próprio handler.

Foram confirmados onze arquivos de produção fora de src/lib/tickets/services que acessam o Supabase por .from(), .rpc() ou REST direto. A lista e os alvos estão em [dependencies.md](dependencies.md). Essa contagem descreve a fronteira existente e não classifica o comportamento como defeito.

## Arquitetura do banco observada nas migrations

As 44 tabelas foram agrupadas por responsabilidade:

- mensagens e conversas: conversations, whatsapp_messages, entregas e batches;
- clientes e risco: customers e tabelas/eventos associados ao controle de comprador;
- catálogo e inventário: venues, setores, assentos, eventos, sessões, aliases, preços e assentos de sessão;
- reserva, pedido e pagamento: reservations, orders, payments e payment_events;
- tickets e entrada: tickets, validações, sessões e acessos de portaria;
- administração: usuários, tentativas e desafios de login;
- cortesias: limites, limites por setor e emissões;
- combos: ofertas, escopos, locks, pedidos, pagamentos, resgates e eventos;
- mapa de mesas: reservas do mapa oficial e seat_map_renders;
- analytics/operação: assentamentos de divisão e dados derivados das entidades centrais.

As relações por chave estrangeira formam o eixo events → event_sessions → session_seats/ticket_prices → reservations → orders/payments → tickets. Combos mantêm um eixo próprio ligado a oferta, evento, pedido, pagamento e resgate. Funções SQL executam reserva, concorrência, confirmação, cortesia, rate limit, busca e validação. Trinta e dois triggers delegam atualização temporal a set_updated_at; um trigger sincroniza o status do mapa oficial a partir de reservas.

events, event_sessions, tickets, session_seats, reservations, customers e orders são entidades centrais pela quantidade de módulos TypeScript que as acessam. O inventário machine-readable preserva relações module → table, function → table/function e trigger → function.

## Rota5, RockBar e Black House

Rota5 é a marca fixa predominante em textos, metadados, assets e shell da aplicação. RockBar e Black House aparecem em assets, mensagens, scripts ou configurações específicas já inventariadas na Etapa 1. Não foi localizada uma entidade de tenant, coluna de tenant, resolver de marca ou seleção de estabelecimento em runtime. Também não foi confirmada uma abstração comum de tema/marca que governe as três referências.

O importador scripts/import-programacao-events.mjs fixa Black House/Sorocaba/SP em constantes e cria cliente Supabase próprio. Existem outras flags e constantes de comportamento, mas as evidências não demonstram multi-tenancy. Três scripts adicionais fazem manutenção de setores, preços e inventário fixos da Black House.

## Dependências circulares

O grafo estático de 428 imports encontrou dois componentes fortemente conexos quando imports de tipo são incluídos:

1. AdminEventsEditor.tsx e componentes do editor, porque o componente pai importa os filhos e os filhos importam tipos do pai.
2. whatsappBatchCore.ts e whatsappMessageBatches.ts, com uma aresta de tipo.

Ao excluir imports explicitamente declarados como import type, nenhum ciclo de runtime foi confirmado. Essa segunda contagem é uma aproximação estática e não cobre carregamentos construídos dinamicamente.

## Limites de validação

- A estrutura remota do Supabase e o histórico aplicado de migrations não foram comparados.
- A configuração, os crons e as variáveis realmente ativos na Vercel não foram inspecionados nesta etapa.
- As integrações externas não foram chamadas.
- O grafo de imports não resolve dependências dinâmicas construídas em runtime.
- seat_map_renders continua sem consumidor TypeScript confirmado.
- A ativação operacional de batches e o papel atual dos assets RockBar/Black House permanecem parcialmente confirmados.

Esses limites estão registrados como desconhecidos, sem converter ausência de evidência em conclusão arquitetural.

