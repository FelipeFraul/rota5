> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

# Hotspots arquiteturais as-is

**Data da leitura:** 2026-09-11
**Critério:** centralidade, concentração de responsabilidades, fan-in/fan-out, acesso compartilhado a dados ou dependência entre domínios.
**Escopo:** descrição do estado atual. Este documento não propõe correções ou refatorações.

## Resumo

| ID | Evidência principal | Áreas dependentes |
|---|---|---|
| hotspot.router | router.ts: 19.367 linhas e fan-out 41 | WhatsApp, catálogo, clientes, reservas, pagamentos, tickets, combos e mesas |
| hotspot.zapi-webhook | route.ts: 1.950 linhas e fan-out 22 | entrada WhatsApp, segurança, conversas, batches, router, Z-API e GitHub |
| hotspot.combo-offers | comboOffers.ts: 2.669 linhas e fan-out 15 | catálogo, pagamento, pedidos, QR, mensagens e resgate |
| hotspot.admin-events-service | adminEvents.ts: 2.758 linhas | editor, catálogo, sessões, setores, preços, inventário, tickets e combos |
| hotspot.admin-events-api | duas APIs com acesso direto a banco e RPC | UI administrativa, auth, serviço de eventos e entidades operacionais |
| hotspot.admin-editor-cycle | SCC de imports de tipo e componente central com fan-in 14 | componentes do editor de eventos |
| hotspot.supabase-client | src/lib/supabase/admin.ts com fan-in 44 | APIs, webhooks, serviços, crons e segurança |
| hotspot.central-tables | tickets com 13 consumidores; demais entidades centrais com 8–10 | vendas, portaria, relatórios, reservas e atendimento |
| hotspot.payment-webhook | fan-out 10 e tratamento de ticket e combo | Mercado Pago, pedidos, pagamentos, emissão, entrega e combos |
| hotspot.gate-sessions | gateSessions.ts com fan-in 15 | portaria, cozinha, ofertas, combo e admin |
| hotspot.brand-spread | valores e assets de Rota5/RockBar/Black House dispersos | shell, mensagens, páginas, scripts e assets |
| hotspot.table-map-boundary | acesso direto, filesystem/asset e reserva oficial | WhatsApp, admin, inventário e reservas |
| hotspot.batch-disabled | estado atual cancela batches no processamento de reply | webhook, conversas, cron e entregas |
| hotspot.admin-reports | adminReports.ts: 1.512 linhas e múltiplas entidades | dashboards, ingressos, validações, pedidos, pagamentos e combos |

## hotspot.router

**Evidência:** src/lib/tickets/router.ts possui 19.367 linhas no snapshot auditado e o maior fan-out do grafo, com 41 imports. Ele importa catálogo, estado de conversa, clientes, reservas, checkout, tickets, combos, mapa oficial, mensagens, telefones e infraestrutura.

**Centralidade:** é o ponto de decisão que traduz intenção recebida por WhatsApp em chamadas de múltiplos domínios. Também mantém partes de regra, composição de resposta e coordenação de persistência.

**Dependentes:** webhook Z-API, conversas públicas, catálogo de eventos, reservas, pagamentos, ticketing, combos e mapa de mesas.

**Status:** CONFIRMADO.

## hotspot.zapi-webhook

**Evidência:** src/app/api/webhook/zapi/route.ts possui 1.950 linhas e fan-out 22. O handler valida e normaliza o webhook, aplica segurança/rate limit, registra mensagens, coordena batches, chama o router, envia respostas e pode abrir issue no GitHub.

**Centralidade:** é a entrada pública do canal conversacional e liga o protocolo externo ao estado e às regras do sistema.

**Dependentes:** WhatsApp, clientes, conversas, batches, router, Z-API, GitHub issues, logging e rate limit.

**Status:** CONFIRMADO.

## hotspot.combo-offers

**Evidência:** src/lib/tickets/services/comboOffers.ts possui 2.669 linhas e fan-out 15. O módulo cruza ofertas, escopos, locks, pedidos, pagamentos, eventos, mensagens, QR, Mercado Pago e Z-API.

**Centralidade:** coordena venda e comunicação de combo antes e depois do pagamento, atravessando catálogo, pagamento e fulfillment.

**Dependentes:** APIs e páginas de combo, webhook de pagamento, administração de ofertas, cozinha/resgate e mensagens.

**Status:** CONFIRMADO.

## hotspot.admin-events-service

**Evidência:** src/lib/tickets/services/adminEvents.ts possui 2.758 linhas e acessa múltiplas entidades de evento, sessão, setor, preço, inventário, venda, ticket e combo.

**Centralidade:** concentra consultas e mutações usadas pela edição administrativa de eventos e suas entidades dependentes.

**Dependentes:** APIs administrativas, AdminEventsEditor, criação/edição de evento, relatórios exibidos nos cards e operações de inventário.

**Status:** CONFIRMADO.

## hotspot.admin-events-api

**Evidência:** src/app/api/admin/events/route.ts e src/app/api/admin/events/[eventId]/route.ts combinam autenticação, parsing, validação, regras, chamadas de serviço e acesso direto a tabelas/RPCs. O handler por ID possui 979 linhas; o handler de coleção, 910.

**Centralidade:** é a fronteira entre o editor administrativo e a maior agregação de catálogo/inventário. Também alcança tickets, validações e combos.

**Dependentes:** UI administrativa, admin.auth, adminEvents.ts, eventos, sessões, setores, preços, assentos, pedidos, tickets, validações e ofertas de combo.

**Status:** CONFIRMADO.

## hotspot.admin-editor-cycle

**Evidência:** AdminEventsEditor.tsx importa seus componentes e quatorze componentes importam tipos declarados pelo pai. Isso cria um componente fortemente conexo no grafo que inclui imports de tipo. AdminEventsEditor.tsx tem fan-in 14.

**Centralidade:** o editor mantém tipos, estado, navegação por abas e integração com as APIs para a superfície administrativa de eventos.

**Dependentes:** formulários, cards, modais e tabs do editor administrativo.

**Status:** CONFIRMADO para o ciclo de tipos; nenhum ciclo de runtime foi confirmado após excluir import type.

## hotspot.supabase-client

**Evidência:** src/lib/supabase/admin.ts tem fan-in 44, o maior do grafo. APIs, webhooks, crons e serviços instanciam o cliente por esse módulo.

**Centralidade:** é a infraestrutura comum de acesso ao sistema de registro e às RPCs.

**Dependentes:** praticamente todos os domínios persistentes: conversas, catálogo, reservas, pagamento, ticketing, administração, portaria, cortesias, combos, mapas e analytics.

**Status:** CONFIRMADO.

## hotspot.central-tables

**Evidência:** tickets é acessada por 13 arquivos; session_seats por 10; event_sessions e events por 9; reservations, customers e orders por 8; ticket_prices, whatsapp_messages e ticket_validation_events por 7.

**Centralidade:** essas entidades formam os eixos de catálogo, inventário, compra, emissão, atendimento, validação e relatório. Alterações nelas repercutem em mais de um domínio.

**Dependentes:** WhatsApp, checkout, administração, portaria, relatórios, reservas, pagamentos, ticketing e combos.

**Status:** CONFIRMADO para acessos TypeScript; usos internos de RPC acrescentam dependências SQL catalogadas separadamente.

## hotspot.payment-webhook

**Evidência:** src/app/api/webhook/payment/mercado-pago/route.ts tem fan-out 10 e acesso direto a orders, payment_events, payments, combo_orders e RPCs de confirmação. Também chama adapter Mercado Pago e coordena emissão/entrega.

**Centralidade:** converte a confirmação externa em mudança financeira e fulfillment de dois tipos de produto.

**Dependentes:** checkout de tickets, combo, pedidos, pagamentos, emissão de tickets, QR, entrega Z-API e resgates.

**Status:** CONFIRMADO.

## hotspot.gate-sessions

**Evidência:** src/lib/tickets/services/gateSessions.ts tem fan-in 15. Suas sessões de acesso são usadas por rotas e páginas de portaria e cozinha, além de operações administrativas e de combo.

**Centralidade:** fornece a identidade operacional compartilhada dos leitores e limita o acesso aos fluxos de validação/resgate.

**Dependentes:** portaria, gate, cozinha, combo, ofertas e administração.

**Status:** CONFIRMADO.

## hotspot.brand-spread

**Evidência:** textos, metadados, assets, mensagens, scripts e configurações contêm referências a Rota5, RockBar e Black House. Não há entidade de tenant, campo de tenant, brand resolver nem seleção de marca em runtime confirmada. Os scripts rename-black-house-ticket-sections.mjs, split-black-house-special-items.mjs e update-black-house-sectors.mjs fixam Black House/Sorocaba e acessam o Supabase diretamente.

**Centralidade:** Rota5 está embutida na apresentação e comunicação; as outras referências coexistem no mesmo repositório e não estão isoladas por uma fronteira arquitetural comprovada.

**Dependentes:** layout/shell, páginas públicas, mensagens WhatsApp, assets e scripts operacionais.

**Status:** PARCIALMENTE CONFIRMADO; RockBar/Black House permanecem POSSÍVEL LEGADO onde não há consumidor atual comprovado.

## hotspot.table-map-boundary

**Evidência:** officialPlaceCoordinates.ts e persistOfficialPlaces.ts acessam official_table_map_reservations fora da pasta de serviços. O domínio também cruza assets/representação espacial, reservas e integração com os fluxos conversacional e administrativo. seat_map_renders não possui consumidor TypeScript confirmado.

**Centralidade:** conecta coordenadas e lugares oficiais ao inventário/reserva usado pelo usuário e pelo admin.

**Dependentes:** WhatsApp, reservas, editor/mapa administrativo e inventário de evento.

**Status:** CONFIRMADO para os acessos; consumidor de seat_map_renders é ÓRFÃO/não confirmado.

## hotspot.batch-disabled

**Evidência:** módulos de batches, finalizador e cron existem, com tabelas/RPCs próprias. O processamento atual de reply contém comportamento explícito de cancelamento de batches.

**Centralidade:** a infraestrutura de envio diferido atravessa webhook, conversa e processamento agendado, mas sua ativação operacional não pode ser inferida apenas da presença dos módulos.

**Dependentes:** webhook Z-API, conversas, entregas de WhatsApp, finalizador e cron.

**Status:** PARCIALMENTE CONFIRMADO; execução efetiva na Vercel não validada.

## hotspot.admin-reports

**Evidência:** src/lib/tickets/services/adminReports.ts possui 1.512 linhas e lê diversas entidades operacionais. APIs e páginas de relatório dependem de agregações sobre eventos, sessões, tickets, validações, pedidos, pagamentos e combos.

**Centralidade:** consolida leitura transversal do sistema para administração e operação, incluindo funções SQL legadas ou especializadas catalogadas nas migrations.

**Dependentes:** dashboards, relatórios administrativos, operação ao vivo e entidades centrais de venda/entrada.

**Status:** CONFIRMADO para dependências locais; valores e performance remotos não foram validados.

## Ciclos e pontos sem consumidor

Há dois ciclos no grafo que inclui imports de tipo e zero ciclos de runtime confirmados na aproximação estática. BrandLogo.tsx e a tabela seat_map_renders não possuem consumidor TypeScript confirmado no snapshot. Assets sem referência também foram mantidos no inventário como órfãos ou possível legado. Nenhum desses itens foi removido ou alterado nesta etapa.

