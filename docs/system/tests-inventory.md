> **Current Baseline 2.7.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 current test evidence

There are 57 test files. Quality Gate 34998744062 on `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27` passed 280/280 Node behavioral cases and 4/4 PostgreSQL integration groups, plus typecheck, lint without errors and build. Test-file count and test-case count are distinct.

## Baseline 2.6.0 test state

The catalog has 57 test artifacts. Quality Gate 34984961888 passed 276/276 default Node cases and 4/4 PostgreSQL integration cases on `0a10618648fc3f873afffd8f60e60bd0396b62e7`.

## Historical snapshot — Baseline 2.5.3 test state

The catalog contains 53 test artifacts. The default Node suite passes **257/257**; the separate PostgreSQL 16 integration passes **2/2**. Quality Gate 34898804387 passed on `e931d66d03a620d5e26588c8f6c8714c62ef5d1d`. Do not combine these as 259/259.

# Baseline 2.2.0 — reproducible test runner inventory

Baseline 2.2.0 runner evidence on source `3e2bdc2979301301b3f1566a2ac75a477ee4c169`: typecheck PASS; lint PASS with 0 errors and 23 warnings; build PASS; workspace default suite 207/214; canonical Git materialization after npm ci 207/214; same seven known failures; new regressions 0.


Historical Baseline 2.5.x inventory: 53 records; default Node 257/257 and PostgreSQL 2/2 in Quality Gate 34898804387.

# Inventário de testes e auditorias

**Atualização da Etapa 3 (11/09/2026):** 39 arquivos executados isoladamente: 296 casos, 276 aprovados e 20 falhas em 12 arquivos. Os resultados históricos da suíte padrão abaixo são preservados e não representam esta nova execução. Três testes reais e o teste de mapa que grava artefatos não foram executados. Evidências e associação às capabilities: [capability-test-coverage.md](capability-test-coverage.md) e `tests.json.stage3Validation`.

## Resumo

- Testes nomeados `scripts/test-*.mjs`: **43**.
- Incluídos no comando `npm test`: **15**.
- Fora do comando padrão: **28**.
- Scripts `scripts/audit-*.mjs`: **3**.
- Ferramentas `.tools/audit_*.mjs`: **21**.
- Framework principal: `node:test` e `node:assert`; o comando padrão usa o loader TypeScript versionado `scripts/test-support/typescript-alias-loader.mjs`. O snapshot histórico da Etapa 3 usava `.tmp/typescript-alias-loader.mjs`.

A maior parte dos testes lê arquivos como texto e verifica contratos com regex/asserts. Esse tipo confirma que uma estrutura textual está presente; não confirma compilação, integração real, browser ou serviço externo. Os testes marcados como **real/integrado** usam Supabase, PostgreSQL ou servidor HTTP local e não foram executados nesta etapa para evitar inferir ambiente/credenciais e efeitos de cleanup.

## Resultado observado do comando padrão

`npm test` foi reexecutado na Etapa 7 em 12/09/2026 e executou 214 casos: **207 passaram e as mesmas 7 falharam**. O snapshot de 11/09/2026 (204/210) permanece histórico em `tests.json.defaultSuite.previousSnapshot`.

| Arquivo padrão | Objeto protegido | Resultado em 11/09/2026 |
| --- | --- | --- |
| `test-whatsapp-batch-compat.mjs` | contrato de claim/finish/retry dos batches | FAIL: 1 contrato textual de finalização divergiu |
| `test-conversation-inactivity.mjs` | TTL e finalização de conversa | PASS |
| `test-public-initial-flow.mjs` | bootstrap e comandos públicos | PASS |
| `test-public-all-events-formatting.mjs` | listagem `TODOS`, paginação e imagem | PASS |
| `test-public-help-flow.mjs` | busca/seleção da ajuda pública | FAIL: 2 casos, identificadores/keywords com `?` |
| `test-public-event-visibility-policy.mjs` | janela e acesso de eventos | PASS |
| `test-public-availability-classification.mjs` | estados públicos e ações | FAIL: 1 contrato de more-info divergiu |
| `test-admin-auth-pending-cancel.mjs` | prioridade/cancelamento do login admin pendente | FAIL: 1 contrato divergiu |
| `test-admin-event-artist-name-leak.mjs` | isolamento de artista na criação/duplicação | FAIL: 1 contrato de duplicação divergiu |
| `test-ticket-delivery-distribution.mjs` | reenvio, participantes e precedência de comandos | PASS |
| `test-combo-offer-qr-delivery-policy.mjs` | timestamp, atraso e deduplicação da oferta | PASS |
| `test-combo-qr-image-template.mjs` | renderização completa do QR de combo | PASS |
| `test-message-mojibake.mjs` | ausência de corrupção textual | FAIL: detectou mojibake/caracteres corrompidos |
| `test-admin-operational-dashboard.mjs` | endpoint/RPC/painel operacional | PASS |
| `test-official-table-map.mjs` | catálogo, coordenadas, persistência e render | PASS |

Os resultados acima são CONFIRMADOS para a execução local. Eles não foram corrigidos.

## Catálogo dos 51 testes

| Arquivo | Objeto aparente | Tipo | Padrão | Limitação principal |
| --- | --- | --- | --- | --- |
| `test-admin-auth-pending-cancel.mjs` | login admin pendente, logout e precedência | contrato de fonte + módulos | sim | um caso falha na baseline |
| `test-admin-event-artist-name-leak.mjs` | limpeza/sincronização de `artistName` | contrato de fonte + módulos | sim | um caso falha na baseline |
| `test-admin-events-editor-card-memoization.mjs` | grids/cards memoizados | contrato de fonte | não | não renderiza browser |
| `test-admin-events-editor-combo-section-extraction.mjs` | isolamento da seção de combos | contrato de fonte | não | não chama API real |
| `test-admin-events-editor-dashboard-section-extraction.mjs` | extração do dashboard | contrato de fonte | não | não renderiza nem mede rede |
| `test-admin-events-editor-event-modal-extraction.mjs` | extração do modal de evento | contrato de fonte | não | PASS 4/4 após a correção; typecheck/build provam o parse |
| `test-admin-events-editor-lazy-modals.mjs` | imports lazy de modais | contrato de fonte | não | não executa bundle |
| `test-admin-events-editor-toolbar-extraction.mjs` | filtros e busca do toolbar | contrato de fonte | não | não exercita UI real |
| `test-admin-events-fast-mode.mjs` | payload rápido de eventos | contrato de fonte | não | sem banco |
| `test-admin-events-fast-rpc.mjs` | autenticação/isolamento da RPC rápida | contrato SQL/fonte | não | não consulta catálogo remoto |
| `test-admin-navigation.mjs` | pilha LIFO e limpeza de navegação | módulo isolado | não | não cobre router completo |
| `test-admin-operational-dashboard.mjs` | endpoint, RPC e UI operacional | contrato de fonte/SQL | sim | não valida métricas remotas |
| `test-admin-section-capacity-rpc-real.mjs` | atomicidade/capacidade real | Supabase + PostgreSQL real | não | exige credenciais e muta/limpa fixtures |
| `test-admin-slow-endpoints-optimized.mjs` | RPCs de detalhe/dashboard | contrato de fonte/SQL | não | não mede produção |
| `test-admin-ticket-price-label-edit.mjs` | label de ingresso independente | contrato de fonte | não | sem UI/API real |
| `test-admin-web-auth-fast.mjs` | cookie, sessão e usuário admin | contrato de fonte | não | sem browser/banco |
| `test-admin-whatsapp-outbound-status.mjs` | status outbound em analytics | contrato de fonte | não | sem mensagens reais |
| `test-checkout-pix-requirements.mjs` | exigência de e-mail/CPF | contrato de fonte | não | sem SDK/provedor |
| `test-combo-offer-priority.mjs` | prioridade e dedupe por evento | contrato de fonte/SQL | não | sem relógio/banco real |
| `test-combo-offer-priority-real.mjs` | oferta, prioridade e envio | Supabase real + HTTP local | não | exige credenciais, cria e remove dados |
| `test-combo-offer-qr-delivery-policy.mjs` | entrega QR e oferta pós-compra | contrato de fonte + módulos | sim | Z-API real não usada |
| `test-combo-qr-image-template.mjs` | imagem QR de combo | módulo/render de imagem | sim | não valida entrega WhatsApp |
| `test-conversation-inactivity.mjs` | expiração de contexto | módulo isolado | sim | sem persistência real |
| `test-function-search-path-hardening.mjs` | endurecimento de 17 funções SQL | contrato SQL | não | catálogo remoto não consultado |
| `test-message-mojibake.mjs` | texto público/admin | varredura de fonte | sim | falha; não cobre texto vindo do banco |
| `test-official-table-map.mjs` | lugares, coordenadas e PNG | contrato + módulos/render | sim | persistência real não executada |
| `test-paid-delivery-conversation-fallback.mjs` | entrega sem conversa | contrato de fonte | não | sem Z-API/Supabase reais |
| `test-paid-delivery-outbound-idempotency.mjs` | unidade idempotente outbound | contrato de fonte/SQL | não | concorrência remota não executada |
| `test-public-all-events-formatting.mjs` | saída do comando `TODOS` | módulos + contrato | sim | sem Z-API real |
| `test-public-availability-classification.mjs` | classificação e bloqueios públicos | contrato + módulos | sim | um caso falha na baseline |
| `test-public-event-visibility-policy.mjs` | corte temporal e fluxos | módulos + contrato | sim | usa cenários controlados |
| `test-public-help-flow.mjs` | catálogo e estado da ajuda | módulos + contrato | sim | dois casos falham por corrupção textual |
| `test-public-initial-flow.mjs` | primeira mensagem e atalhos | módulos + contrato | sim | mocks de dependências |
| `test-reservation-load-safe.mjs` | concorrência/carga de reserva | Supabase real + contratos | não | execução destrutiva controlada exige ambiente explícito |
| `test-single-event-more-info-buy-context.mjs` | contexto após mais informações | contrato de fonte | não | não executa conversa completa |
| `test-ticket-delivery-distribution.mjs` | comprador/participantes/reenvio | contrato + módulos | sim | sem entrega externa real |
| `test-ticket-qr-image-template.mjs` | uso do template Rota5 | contrato de fonte | não | não renderiza imagem |
| `test-whatsapp-batch-compat.mjs` | batches e pipeline desabilitado | contrato de fonte/SQL | sim | sem cron remoto |
| `test-whatsapp-messaging-regressions.mjs` | mensagens isoladas e não agregadas | contrato + módulos | não | sem concorrência real |
| `test-whatsapp-operational-outbound-null-conversation.mjs` | outbound operacional sem conversa | contrato de fonte | não | sem inserção remota |
| `test-whatsapp-outbound-delivery-security.mjs` | RLS/grants/service role | contrato de fonte/SQL | não | catálogo efetivo não consultado |
| `test-whatsapp-outbound-metadata-contract.mjs` | metadados sent/failed | contrato de fonte | não | sem provedor |
| `test-whatsapp-output-sanitization.mjs` | sanitização central de saída | módulos + contrato | não | não abrange toda UI/DB |

## Scripts de auditoria em `scripts/`

| Arquivo | Finalidade aparente | Estado |
| --- | --- | --- |
| `audit-whatsapp-intent-100.mjs` | matriz ampla de classificação de intenção | CONFIRMADO estaticamente; não executado |
| `audit-whatsapp-intent-gate.mjs` | guarda/baixa confiança de intenção | CONFIRMADO estaticamente; não executado |
| `audit-whatsapp-santana-search.mjs` | busca real por Santana via RPC | PARCIALMENTE CONFIRMADO; exige Supabase |

## Ferramentas integradas em `.tools/`

Todas as 21 ferramentas usam nomes `audit_*`, constroem fixtures e/ou verificam código/banco. Elas não são chamadas por `package.json`.

| Arquivo | Área principal |
| --- | --- |
| `audit_admin_courtesies.mjs` | cortesias e validação |
| `audit_admin_event_creation_flow.mjs` | criação administrativa de evento |
| `audit_admin_event_edit_duplicate.mjs` | edição e duplicação de evento |
| `audit_admin_login_lockout.mjs` | bloqueio de login |
| `audit_admin_navigation_flow.mjs` | navegação administrativa |
| `audit_admin_orders_tickets.mjs` | pedidos e ingressos admin |
| `audit_admin_profiles_permissions.mjs` | perfis e permissões |
| `audit_admin_reports.mjs` | relatórios |
| `audit_admin_tokenized_login.mjs` | login tokenizado |
| `audit_admin_users_flow.mjs` | usuários admin |
| `audit_buyer_anti_abuse.mjs` | risco/antiabuso |
| `audit_buy_flow.mjs` | compra ponta a ponta com fixtures |
| `audit_cancel_pending_reservation_rpc.mjs` | cancelamento transacional |
| `audit_combo_redemption_security.mjs` | segurança de resgate de combo |
| `audit_gate_phone_checkin.mjs` | check-in por telefone |
| `audit_gate_wrong_event.mjs` | bloqueio de evento incorreto |
| `audit_mercado_pago_security.mjs` | pagamento/webhook |
| `audit_rate_limit.mjs` | rate limit |
| `audit_reservation_expiration_cancel.mjs` | expiração e cancelamento |
| `audit_seatmap_qr_image.mjs` | mapa, QR e imagem |
| `audit_system_closure.mjs` | fechamento transversal |

Limitação comum: várias ferramentas usam Supabase real/service role, criam dados e tentam cleanup. A presença de cleanup não garante execução segura em qualquer projeto; nenhuma foi rodada nesta etapa.

## Outras verificações executadas

| Comando | Resultado | Evidência principal |
| --- | --- | --- |
| `npm run typecheck` | PASS | 0 diagnósticos após a correção mínima |
| `npm run lint` | PASS | 0 erros; 23 warnings |
| `npm run build` | PASS | compilação concluída; warning NFT/Turbopack preexistente no mapa |
| `npm test` | PASS | 280/280 passed; 0 failures, skips, todos or regressions |

O lint sinalizou ainda imports, funções e variáveis sem uso, uso de `<img>` e uma dependência desnecessária de hook. Esses sinais foram inventariados como possíveis lacunas/legado; nenhum foi alterado.

## Runner reproducibility — Baseline 2.2.0

The original untracked loader failed with `ERR_MODULE_NOT_FOUND` before useful test execution. The tracked loader has the same SHA-256 `3581a09ff5a8e0c5641409ef3127521b382613c5b89155141777c5b705ae9eb8`, uses only Node built-ins and preserves behavior. A clean canonical Git materialization passed `npm ci` and returned 207/214. A separate Windows CRLF materialization exposed two extra source-assertion failures; this is not a loader regression.
