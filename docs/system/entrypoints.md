> **Current Baseline 2.6.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). Paid TICKET/COMBO delivery work is durably persisted in the payment transaction; external delivery remains **AT_LEAST_ONCE**, never claimed exactly-once. Findings: 46 total, 14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED, 0 release blockers. Product and infrastructure health remain **DEGRADED**. Quality Gate 34984961888 passed 276/276 Node and 4/4 PostgreSQL 16 on the exact source. Baseline commit is `SELF_NOT_RECORDED`; no deployment or database mutation occurs in this documentary freeze.

# Pontos de entrada

Esta baseline registra **56 mecanismos de entrada**, após revisão da Etapa 3. O número soma 25 módulos de rota HTTP, 14 páginas, 1 proxy, 8 scripts NPM, 6 programas operacionais e 2 disparos cron externos. Os dois cron apontam para rotas já contadas, e dois scripts NPM apontam para programas também contados; a sobreposição é mantida porque são mecanismos de início diferentes.

## Rotas HTTP

| # | Método(s) exportado(s) | Rota | Implementação | Finalidade observada |
| ---: | --- | --- | --- | --- |
| 1 | GET | `/admin/eventos/abrir/[token]` | `src/app/admin/eventos/abrir/[token]/route.ts` | consumir link administrativo e definir cookies de sessão/CSRF |
| 2 | GET, POST | `/api/admin/combo-offers` | `src/app/api/admin/combo-offers/route.ts` | listar e criar ofertas de combo autenticadas |
| 3 | PATCH, POST, DELETE | `/api/admin/combo-offers/[offerId]` | `src/app/api/admin/combo-offers/[offerId]/route.ts` | editar, duplicar/acionar e excluir oferta |
| 4 | GET, POST | `/api/admin/events` | `src/app/api/admin/events/route.ts` | listar, criar eventos e carregar consultas administrativas |
| 5 | GET, PATCH, POST, DELETE | `/api/admin/events/[eventId]` | `src/app/api/admin/events/[eventId]/route.ts` | detalhe, edição, duplicação/ações e exclusão de evento |
| 6 | GET, POST | `/api/admin/login/verify` | `src/app/api/admin/login/verify/route.ts` | validar código/login administrativo e diagnóstico de requisitos |
| 7 | GET | `/api/admin/operational-dashboard` | `src/app/api/admin/operational-dashboard/route.ts` | carregar painel operacional por RPC |
| 8 | GET, PUT | `/api/admin/table-map` | `src/app/api/admin/table-map/route.ts` | ler e persistir coordenadas do mapa oficial |
| 9 | POST + guardas | `/api/checkout/mercado-pago` | `src/app/api/checkout/mercado-pago/route.ts` | checkout interno legado/compatível protegido por segredo |
| 10 | POST + guardas | `/api/checkout/mercado-pago/pay` | `src/app/api/checkout/mercado-pago/pay/route.ts` | criar pagamento Pix de ingresso |
| 11 | GET + guardas | `/api/checkout/status` | `src/app/api/checkout/status/route.ts` | consultar estado do checkout de ingresso |
| 12 | POST + guardas | `/api/combo-checkout/mercado-pago/pay` | `src/app/api/combo-checkout/mercado-pago/pay/route.ts` | criar pagamento Pix de combo |
| 13 | GET + guardas | `/api/combo-checkout/status` | `src/app/api/combo-checkout/status/route.ts` | consultar estado do checkout de combo |
| 14 | GET, POST | `/api/cron/expire-reservations` | `src/app/api/cron/expire-reservations/route.ts` | expirar reservas vencidas |
| 15 | GET, POST | `/api/cron/process-whatsapp-batches` | `src/app/api/cron/process-whatsapp-batches/route.ts` | processar/finalizar lotes de mensagens e retries |
| 16 | POST + guarda | `/api/gate/session/consult` | `src/app/api/gate/session/consult/route.ts` | consultar ingresso na portaria |
| 17 | POST + guardas | `/api/gate/session/scan` | `src/app/api/gate/session/scan/route.ts` | interpretar leitura de QR de ingresso |
| 18 | POST + guardas | `/api/gate/session/validate` | `src/app/api/gate/session/validate/route.ts` | validar sessão do leitor e retornar resumo; não consumir ingresso |
| 19 | GET + guardas | `/api/health` | `src/app/api/health/route.ts` | health check |
| 20 | GET, POST | `/api/kitchen/session/open` | `src/app/api/kitchen/session/open/route.ts` | abrir/vincular sessão de cozinha ao dispositivo |
| 21 | POST + guarda | `/api/kitchen/session/prepare` | `src/app/api/kitchen/session/prepare/route.ts` | registrar preparação de combo |
| 22 | POST + guardas | `/api/kitchen/session/scan` | `src/app/api/kitchen/session/scan/route.ts` | interpretar QR de combo |
| 23 | POST + guardas | `/api/kitchen/session/validate` | `src/app/api/kitchen/session/validate/route.ts` | validar token/dispositivo da cozinha e retornar pedidos; não consumir resgate |
| 24 | POST + guardas | `/api/webhook/payment/mercado-pago` | `src/app/api/webhook/payment/mercado-pago/route.ts` | receber, autenticar e processar notificação de pagamento |
| 25 | POST + guardas | `/api/webhook/zapi` | `src/app/api/webhook/zapi/route.ts` | receber WhatsApp, persistir, rotear e responder pela Z-API |

`+ guardas` indica que o módulo também exporta handlers para métodos não suportados, respondendo com method-not-allowed. A existência das rotas e handlers é CONFIRMADA; exposição e tráfego em produção são NÃO VALIDADOS.

## Páginas

| # | URL | Implementação | Finalidade observada |
| ---: | --- | --- | --- |
| 26 | `/` | `src/app/page.tsx` | shell raiz atualmente vazio |
| 27 | `/admin/eventos` | `src/app/admin/eventos/page.tsx` | catálogo, criação/edição de eventos e ofertas |
| 28 | `/admin/login/[token]` | `src/app/admin/login/[token]/page.tsx` | formulário de código administrativo |
| 29 | `/admin/operacao` | `src/app/admin/operacao/page.tsx` | painel operacional |
| 30 | `/checkout/[orderId]` | `src/app/checkout/[orderId]/page.tsx` | checkout de ingresso |
| 31 | `/checkout/success` | `src/app/checkout/success/page.tsx` | retorno aprovado |
| 32 | `/checkout/pending` | `src/app/checkout/pending/page.tsx` | retorno pendente |
| 33 | `/checkout/failure` | `src/app/checkout/failure/page.tsx` | retorno com falha |
| 34 | `/combo-checkout/[orderId]` | `src/app/combo-checkout/[orderId]/page.tsx` | checkout de combo |
| 35 | `/gate/session/[token]` | `src/app/gate/session/[token]/page.tsx` | scanner da portaria |
| 36 | `/kitchen/access` | `src/app/kitchen/access/page.tsx` | entrada do dispositivo de cozinha |
| 37 | `/kitchen/session/[token]` | `src/app/kitchen/session/[token]/page.tsx` | scanner da cozinha |
| 38 | `/offer-reader/session/[token]` | `src/app/offer-reader/session/[token]/page.tsx` | leitor de QR de oferta |
| 39 | `/tickets/[token]` | `src/app/tickets/[token]/page.tsx` | visualização de ingresso |

`src/app/layout.tsx` e `src/app/globals.css` envolvem as páginas, mas não foram contados como URL independente.

## Proxy/middleware

| # | Mecanismo | Implementação | Finalidade observada |
| ---: | --- | --- | --- |
| 40 | proxy Next | `src/proxy.ts` | headers CSP/segurança e rate limit de páginas públicas sensíveis |

O matcher exclui assets estáticos, otimização de imagem, favicon e prefetch. O rate limit usa RPC quando a requisição GET começa por `/tickets/`, `/gate/session/` ou `/admin/login/`; falhas de configuração/RPC seguem em modo de liberação com log.

## Scripts NPM

| # | Comando | Alvo |
| ---: | --- | --- |
| 41 | `npm run dev` | `next dev` |
| 42 | `npm run build` | `next build` |
| 43 | `npm test` | Node test runner com 15 arquivos explícitos |
| 44 | `npm start` | `next start` |
| 45 | `npm run codex:requests` | `scripts/list-codex-requests.mjs` |
| 46 | `npm run codex:runner` | `scripts/codex-local-runner.mjs` |
| 55 | `npm run lint` | `eslint .` — toolchain |
| 56 | `npm run typecheck` | `tsc --noEmit` — toolchain |

## Programas operacionais

| # | Arquivo | Finalidade observada | Estado |
| ---: | --- | --- | --- |
| 47 | `scripts/codex-local-runner.mjs` | polling local de pedidos Codex aprovados, execução do CLI e resposta opcional por WhatsApp | PARCIALMENTE CONFIRMADO |
| 48 | `scripts/list-codex-requests.mjs` | listar pedidos Codex aprovados por telefone | CONFIRMADO estaticamente |
| 49 | `scripts/import-programacao-events.mjs` | interpretar `programacao.md` e criar catálogo no Supabase | CONFIRMADO estaticamente; execução atual NÃO VALIDADA |
| 50 | `scripts/rename-black-house-ticket-sections.mjs` | renomear setores/aliases Black House | POSSÍVEL LEGADO |
| 51 | `scripts/split-black-house-special-items.mjs` | dividir itens/setores especiais Black House | POSSÍVEL LEGADO |
| 52 | `scripts/update-black-house-sectors.mjs` | atualizar setores Black House | POSSÍVEL LEGADO |

Os 51 testes, 3 scripts de auditoria de intenção e 21 ferramentas `.tools/audit_*.mjs` também são executáveis manualmente, mas são catalogados como verificação em [tests-inventory.md](tests-inventory.md), sem inflar esta contagem de entrypoints operacionais.

## Disparos externos configurados

| # | Agenda | Destino | Evidência |
| ---: | --- | --- | --- |
| 53 | `* * * * *` | `/api/cron/expire-reservations` | `vercel.json` |
| 54 | `* * * * *` | `/api/cron/process-whatsapp-batches` | `vercel.json` |

A configuração versionada é CONFIRMADA. A ativação efetiva das agendas no projeto Vercel é NÃO VALIDADA.

## Cadeias principais iniciadas

1. **WhatsApp:** Z-API webhook → cliente/conversa/mensagem → `routeTicketMessage` → serviços de domínio → persistência outbound → envio Z-API.
2. **Compra:** conversa ou página → reserva/pedido → endpoint Pix → Mercado Pago → webhook assinado → confirmação SQL → entrega de QR.
3. **Admin web:** link/challenge → cookies assinados → APIs administrativas → serviços/RPCs → Supabase.
4. **Portaria:** token de sessão → câmera/QR → endpoint scan → `validate_ticket_entry`; consult consulta o ingresso e validate valida sessão/resumo, sem consumir ingresso.
5. **Cozinha/oferta:** dispositivo/sessão → leitor de oferta → endpoint scan → `validateComboRedemptionScan`; a guarda de escolha retorna apenas quando `delivery_choice_confirmed_at` está ausente; após confirmação e preparo o caso válido alcança `validate_combo_redemption`. Arquitetura PARCIALMENTE CONFIRMADA; capability `combo.redeem` PARCIAL. O endpoint validate valida sessão/pedidos, sem consumir combo.
6. **Manutenção:** Vercel cron → expiração de reservas ou lote WhatsApp.

As ligações estáticas acima não comprovam conclusão funcional. O bloqueio local do resgate está identificado na cadeia de cozinha/oferta; a execução ponta a ponta em serviços externos permanece PARCIALMENTE CONFIRMADA ou NÃO VALIDADA conforme [unknowns.md](unknowns.md).
