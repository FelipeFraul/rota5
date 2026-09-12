# Risk register

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

## Critério

Cada finding tem evidência, impacto, status e confiança. Severidade mede impacto; prioridade inclui probabilidade, workaround e detectabilidade. UNKNOWN e NOT_VALIDATED preservam lacunas sem inventar defeito.

## Registro

| ID | Tipo | Severidade | Prioridade | Status | Confiança | Título |
|---|---|---|---|---|---|---|
| bug.create-event-invalid-jsx | BUG | HIGH | P0 | ACTIVE | CONFIRMED | JSX inválido impede compilar o workspace web de eventos |
| bug.combo-redemption-unreachable-consume | BROKEN_FLOW | HIGH | P0 | ACTIVE | CONFIRMED | Caso válido de combo não alcança a RPC que consome o resgate |
| bug.event-duplicate-artist-leak | BUG | MEDIUM | P1 | ACTIVE | CONFIRMED | Duplicação de evento preserva artista do evento de origem |
| bug.user-visible-text-corruption | BUG | MEDIUM | P1 | ACTIVE | CONFIRMED | Textos ativos contêm mojibake e substituições por interrogação |
| legacy.active-brand-contamination | LEGACY | HIGH | P1 | ACTIVE | CONFIRMED | Superfícies Rota5 exibem referências e assets Black House/RockBar |
| risk.gate-credential-revocation-does-not-revoke-session | AUTHORIZATION | HIGH | P1 | ACTIVE | CONFIRMED | Pausa/revogação da credencial não invalida sessões de leitor já emitidas |
| risk.admin-event-multistep-partial-state | DATA_INTEGRITY | HIGH | P1 | POTENTIAL | HIGH | Criação de evento e catálogo inicial cruza entidades sem transação única |
| risk.combo-metadata-read-modify-write-race | CONCURRENCY | MEDIUM | P2 | POTENTIAL | HIGH | Atualizações concorrentes podem sobrescrever metadados do combo |
| risk.github-issue-create-replay | IDEMPOTENCY | MEDIUM | P2 | POTENTIAL | HIGH | Criação de issue não possui chave de idempotência |
| risk.rate-limit-fails-open | SECURITY | MEDIUM | P2 | ACTIVE | CONFIRMED | Falha do rate limiter libera a requisição |
| risk.remote-database-controls-unvalidated | UNKNOWN | MEDIUM | P2 | NOT_VALIDATED | CONFIRMED | Controles remotos de banco além do schema visível não foram validados |
| risk.remote-webhook-registration-unvalidated | INTEGRATION | MEDIUM | P2 | NOT_VALIDATED | HIGH | Registro remoto dos dois webhooks não foi confirmado |
| risk.vercel-project-identity-drift | CONFIGURATION_DRIFT | HIGH | P0 | ACTIVE | CONFIRMED | Domínio declarado pertence a site, enquanto checkout local está ligado a rota5 |
| risk.latest-rota5-deployment-error | INFRASTRUCTURE | HIGH | P1 | ACTIVE | CONFIRMED | Deployment mais recente do projeto rota5 está em ERROR |
| risk.published-commit-unvalidated | OPERATIONAL | MEDIUM | P2 | NOT_VALIDATED | CONFIRMED | Commit publicado não pode ser reconciliado com o HEAD auditado |
| risk.local-runtime-env-incomplete | CONFIGURATION_DRIFT | MEDIUM | P2 | ACTIVE | CONFIRMED | Ambiente local não contém todas as variáveis exigidas |
| debt.seat-map-storage-contract-drift | CONFIGURATION_DRIFT | LOW | P3 | ACTIVE | CONFIRMED | Variável de bucket existe sem consumidor nem bucket remoto |
| gap.critical-flow-correlation | OBSERVABILITY | MEDIUM | P2 | ACTIVE | CONFIRMED | Fluxos críticos não têm correlação ponta a ponta |
| debt.router-responsibility-concentration | ARCHITECTURE | MEDIUM | P2 | ACTIVE | CONFIRMED | Roteador conversacional concentra coordenação de muitos domínios |
| debt.zapi-webhook-responsibility-coupling | COUPLING | MEDIUM | P2 | ACTIVE | CONFIRMED | Handler Z-API acopla transporte, deduplicação, automação e entrega |
| gap.default-test-suite-failing | TEST_GAP | HIGH | P1 | ACTIVE | CONFIRMED | Suíte padrão está vermelha com sete casos falhos |
| gap.critical-capability-and-flow-coverage | TEST_GAP | HIGH | P1 | ACTIVE | CONFIRMED | Capabilities e flows relevantes não têm teste direto |
| gap.real-integration-tests-outside-default | TEST_GAP | MEDIUM | P2 | ACTIVE | CONFIRMED | Testes reais e de integração ficam fora da suíte padrão |
| gap.source-contract-assertion-bias | TEST_GAP | MEDIUM | P2 | ACTIVE | CONFIRMED | Parte relevante dos testes valida texto-fonte e regex de implementação |
| gap.test-runner-depends-on-untracked-loader | TEST_GAP | HIGH | P1 | ACTIVE | CONFIRMED | npm test depende de loader em diretório temporário não versionado |
| gap.remote-database-behavior-tests | TEST_GAP | MEDIUM | P2 | NOT_VALIDATED | CONFIRMED | Equivalência remota de RPCs, triggers e constraints não tem teste de baseline |
| dead.brand-logo-component | DEAD_CODE | LOW | P3 | ACTIVE | CONFIRMED | BrandLogo.tsx não possui consumidor encontrado |
| orphan.ticket-validation-history | ORPHAN | LOW | P3 | ACTIVE | CONFIRMED | Capability de histórico de validações não tem entrypoint |
| orphan.gate-session-revoke | ORPHAN | MEDIUM | P2 | ACTIVE | CONFIRMED | Capability de revogar sessão de leitor não tem entrypoint |
| orphan.courtesy-event-limit | ORPHAN | LOW | P3 | ACTIVE | CONFIRMED | Limite global de cortesia existe sem entrypoint |
| orphan.gate-sessions-list | ORPHAN | LOW | P3 | ACTIVE | CONFIRMED | Listagem de sessões de leitor não tem entrypoint |
| orphan.seat-map-renders-table | ORPHAN | LOW | P3 | NOT_VALIDATED | HIGH | seat_map_renders não tem consumidor de aplicação confirmado |
| legacy.table-map-presentation-disabled | LEGACY | MEDIUM | P2 | ACTIVE | CONFIRMED | Mapa oficial e cortesia permanecem implementados, mas desativados na apresentação Rota5 |
| debt.direct-supabase-access-spread | COUPLING | MEDIUM | P2 | ACTIVE | CONFIRMED | Acesso privilegiado ao Supabase está espalhado por services e routes |
| debt.large-mixed-service-modules | MAINTAINABILITY | LOW | P3 | ACTIVE | CONFIRMED | Serviços grandes misturam consulta, regra, formatting e efeitos |
| risk.payment-confirmed-before-external-delivery | DATA_INTEGRITY | MEDIUM | P1 | POTENTIAL | HIGH | Confirmação atômica e entrega externa formam fronteira de consistência eventual |
| risk.whatsapp-conversation-context-race | CONCURRENCY | MEDIUM | P2 | POTENTIAL | MEDIUM | Mensagens simultâneas podem competir pela atualização do contexto conversacional |
| debt.payment-reconciliation-duplication-is-intentional | DUPLICATION | INFO | P4 | ACTIVE | CONFIRMED | Webhook e consulta de status repetem confirmação com guardas idempotentes |
| risk.checkout-status-fixed-polling | PERFORMANCE | LOW | P3 | ACTIVE | CONFIRMED | Checkouts consultam status a cada cinco segundos sem backoff |
| risk.production-capable-scripts-outside-test-isolation | OPERATIONAL | MEDIUM | P2 | POTENTIAL | HIGH | Scripts reais podem ler ou alterar ambientes remotos por configuração |
| gap.partial-flows-lack-end-to-end-proof | TEST_GAP | MEDIUM | P1 | ACTIVE | CONFIRMED | Sete flows parciais não possuem prova ponta a ponta |
| gap.client-errors-not-persisted | OBSERVABILITY | LOW | P3 | ACTIVE | CONFIRMED | Falhas de polling e scanner ficam apenas no estado do cliente |
| debt.distributed-status-literals | MAINTAINABILITY | INFO | P4 | ACTIVE | CONFIRMED | Estados e mensagens de negócio estão distribuídos em arquivos extensos |
| risk.service-role-application-authorization-boundary | SECURITY | MEDIUM | P2 | POTENTIAL | HIGH | A autorização da aplicação protege operações que usam service role |

## Evidências e impacto

### bug.create-event-invalid-jsx — JSX inválido impede compilar o workspace web de eventos

- Tipo / severidade / prioridade: **BUG / HIGH / P0**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: CreateEventModal fecha um div antes do footer e deixa o JSX estruturalmente inválido. TypeScript e ESLint param no parse.
- Evidência: `src/app/admin/eventos/event-editor/CreateEventModal.tsx`:19 — JSX em uma única linha contém fechamento incompatível.; `system-knowledge/flows.json` — admin.web_event_workspace está QUEBRADO pela mesma causa.
- Impacto: A aplicação no estado local não passa typecheck/build e o workspace administrativo web não pode ser entregue com segurança.
- Escopo: domains domain.event-administration, domain.analytics-reporting, domain.combo-commerce-fulfillment; capabilities event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, combo.list, analytics.general_dashboard, analytics.event_dashboard, analytics.contacts; flows admin.web_event_workspace.
- Blast radius: **MULTI_DOMAIN**
- Workaround: APIs e jornada administrativa por WhatsApp continuam estruturalmente presentes.
- Direção: Restaurar a estrutura JSX e só então revalidar build e workspace.
- Justificativa da prioridade: P0 porque bloqueia a compilação da baseline local e a evolução segura do principal workspace administrativo.

### bug.combo-redemption-unreachable-consume — Caso válido de combo não alcança a RPC que consome o resgate

- Tipo / severidade / prioridade: **BROKEN_FLOW / HIGH / P0**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Todos os ramos observados de paid + issued + escopo válido retornam antes da chamada validate_combo_redemption; a transição issued→used não ocorre pelo fluxo analisado.
- Evidência: `src/lib/tickets/services/comboRedemptions.ts`:935 — Início da validação do scan.; `src/lib/tickets/services/comboRedemptions.ts`:1462 — RPC de consumo aparece depois dos retornos dos casos válidos.; `system-knowledge/flows.json` — kitchen.combo_redemption está QUEBRADO.
- Impacto: A cozinha pode validar ou orientar entrega sem concluir atomicamente o consumo, permitindo reapresentação e divergência de estado.
- Escopo: domains domain.combo-commerce-fulfillment; capabilities combo.redeem, combo.delivery_prompt; flows kitchen.combo_redemption.
- Blast radius: **DOMAIN**
- Workaround: Não há conclusão equivalente comprovada no mesmo fluxo.
- Direção: Reconectar o caminho válido à transição atômica existente.
- Justificativa da prioridade: P0 porque o fluxo operacional de consumo está comprovadamente quebrado e afeta controle de entrega.

### bug.event-duplicate-artist-leak — Duplicação de evento preserva artista do evento de origem

- Tipo / severidade / prioridade: **BUG / MEDIUM / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: O título duplicado recebe sufixo, mas artist_name copia sourceEvent.artist_name, contrariando o contrato testado de sincronizar artista ao novo título.
- Evidência: `src/lib/tickets/services/adminEvents.ts`:1712 — Cria duplicatedTitle.; `src/lib/tickets/services/adminEvents.ts`:1715 — Copia artist_name da origem.; `scripts/test-admin-event-artist-name-leak.mjs`:143 — Teste direto falha nesta divergência.
- Impacto: Um rascunho duplicado pode exibir ou persistir artista incoerente com o título, exigindo correção manual.
- Escopo: domains domain.event-administration; capabilities event.duplicate; flows admin.whatsapp_event_management, admin.web_event_workspace.
- Blast radius: **DOMAIN**
- Workaround: Editar manualmente o artista após duplicar.
- Direção: Alinhar a regra de duplicação ao contrato de título/artista.
- Justificativa da prioridade: P1 por produzir dado administrativo incorreto em uma ação ativa, com workaround manual.

### bug.user-visible-text-corruption — Textos ativos contêm mojibake e substituições por interrogação

- Tipo / severidade / prioridade: **BUG / MEDIUM / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: A varredura encontra mojibake no dashboard; mensagens, ajuda, checkout e leitor de combo contêm bytes de emoji interpretados incorretamente e interrogações no lugar de acentos.
- Evidência: `src/app/admin/eventos/dashboard/AdminDashboardSection.tsx`:59 — Separador e mensagens do dashboard contêm sequências mojibake.; `src/lib/tickets/messages.ts`:61 — Emoji está armazenado como sequência de bytes interpretada incorretamente.; `src/lib/tickets/services/publicHelp.ts`:176 — ID e keywords usam interrogação no lugar do acento.; `scripts/test-message-mojibake.mjs`:18 — Teste de mensagens falha com nove ocorrências no dashboard.
- Impacto: Usuários e administradores recebem texto corrompido; IDs/keywords corrompidos também alteram resultados e contratos de busca.
- Escopo: domains domain.whatsapp-conversations, domain.analytics-reporting, domain.orders-payments, domain.combo-commerce-fulfillment; capabilities messaging.respond, messaging.help, payment.checkout_view, combo.kitchen_open, analytics.general_dashboard, analytics.event_dashboard; flows whatsapp.public_discovery, admin.web_event_workspace, kitchen.combo_redemption.
- Blast radius: **MULTI_DOMAIN**
- Workaround: O sanitizador de saída repara apenas parte dos casos e não corrige IDs ou UI web.
- Direção: Normalizar os arquivos fonte e ampliar a verificação para corrupção por substituição e bytes reinterpretados.
- Justificativa da prioridade: P1 porque o defeito é visível em jornadas públicas e administrativas e já quebra testes.

### legacy.active-brand-contamination — Superfícies Rota5 exibem referências e assets Black House/RockBar

- Tipo / severidade / prioridade: **LEGACY / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Checkout, ajuda e logs de pagamento usam Black House; CSS de checkout usa rockbar.webp/rockbar_mb.webp; domínio canônico declarado também é Black House.
- Evidência: `src/app/checkout/pending/page.tsx`:8 — Mensagem de pagamento cita Black House.; `src/app/checkout/success/page.tsx`:8 — Mensagem de confirmação cita Black House.; `src/app/globals.css`:174 — Checkout usa rockbar.webp.; `next.config.ts`:3 — Origin de produção aponta para domínio Black House.
- Impacto: A marca, confiança de pagamento e identidade visual podem ser incorretas para compradores Rota5, além de aumentar o risco de operar o projeto errado.
- Escopo: domains domain.brand-presentation, domain.orders-payments, domain.whatsapp-conversations, domain.platform-runtime; capabilities brand.present_individual_offers, payment.checkout_view, payment.return_notice, messaging.help; flows ticket.purchase, whatsapp.public_discovery.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Nenhum seletor de marca/tenant foi encontrado.
- Direção: Definir a identidade canônica antes de classificar cada referência como compartilhada ou legado removível.
- Justificativa da prioridade: P1 porque referências legadas estão ativas em pagamento e comunicação ao cliente.

### risk.gate-credential-revocation-does-not-revoke-session — Pausa/revogação da credencial não invalida sessões de leitor já emitidas

- Tipo / severidade / prioridade: **AUTHORIZATION / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: pauseGateAccess e revokeFixedGateAccess alteram somente as tabelas de credenciais. validateGateSessionToken autoriza consultando gate_sessions e não consulta a credencial originadora.
- Evidência: `src/lib/tickets/services/gateAccesses.ts`:126 — Pausa apenas gate_accesses.; `src/lib/tickets/services/fixedGateAccesses.ts`:84 — Revoga apenas fixed_gate_accesses.; `src/lib/tickets/services/gateSessions.ts`:282 — Validação consulta token/status/expiração da sessão.
- Impacto: Um operador removido pode continuar usando um link já emitido até expiração, inclusive para portaria ou cozinha.
- Escopo: domains domain.gate-admission, domain.combo-commerce-fulfillment, domain.admin-identity-access; capabilities gate.access_pause, gate.fixed_revoke, gate.admit, combo.kitchen_open; flows gate.ticket_admission, kitchen.combo_redemption.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Revogar diretamente gate_sessions existe como função órfã, sem entrypoint catalogado.
- Direção: Vincular e invalidar sessões derivadas ao revogar a credencial fonte.
- Justificativa da prioridade: P1 porque mantém autorização operacional após revogação explícita.

### risk.admin-event-multistep-partial-state — Criação de evento e catálogo inicial cruza entidades sem transação única

- Tipo / severidade / prioridade: **DATA_INTEGRITY / HIGH / P1**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: createAdminEvent coordena evento, local, sessão, setor, assentos, preços e mapa por chamadas Supabase sequenciais; o catálogo marca event.create como PARCIAL e registra possibilidade de resíduos.
- Evidência: `src/lib/tickets/services/adminEvents.ts` — Serviço executa criação multi-entidade via aplicação.; `system-knowledge/capabilities.json` — event.create está PARCIAL.; `system-knowledge/flows.json` — admin.whatsapp_event_management documenta drafts/resíduos em falhas intermediárias.
- Impacto: Falha intermediária pode deixar rascunho ou inventário incompleto e exigir limpeza manual antes de tentar novamente.
- Escopo: domains domain.event-administration, domain.reservation-inventory; capabilities event.create, event.session_create, event.section_create, event.seats_create, event.price_create; flows admin.whatsapp_event_management, admin.web_event_workspace.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Operar/limpar o rascunho parcialmente criado de forma manual.
- Direção: Definir uma fronteira transacional para a criação composta.
- Justificativa da prioridade: P1 pela quantidade de entidades e pelo risco de estado persistente incompleto.

### risk.combo-metadata-read-modify-write-race — Atualizações concorrentes podem sobrescrever metadados do combo

- Tipo / severidade / prioridade: **CONCURRENCY / MEDIUM / P2**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: O scan lê raw_metadata e depois grava um objeto mesclado em atualização separada; scans, cozinha e confirmação do cliente podem atualizar o mesmo JSON sem lock ou versão observável.
- Evidência: `src/lib/tickets/services/comboRedemptions.ts`:1025 — Lê metadata do resgate.; `src/lib/tickets/services/comboRedemptions.ts`:1113 — Relê e atualiza raw_metadata por read-modify-write.; `src/lib/tickets/services/comboRedemptions.ts`:1300 — Outro ramo também atualiza metadados do mesmo registro.
- Impacto: Campos de entrega, preparo ou notificação podem se perder sob operações simultâneas, prejudicando a recuperação operacional.
- Escopo: domains domain.combo-commerce-fulfillment; capabilities combo.delivery_prompt, combo.delivery_choose, combo.kitchen_release; flows combo.delivery_choice, kitchen.combo_redemption.
- Blast radius: **DOMAIN**
- Workaround: Alguns ramos releem metadados imediatamente antes do update, reduzindo mas não eliminando a janela.
- Direção: Serializar ou versionar atualizações de estado do resgate.
- Justificativa da prioridade: P2 porque depende de concorrência, mas afeta estado operacional persistido.

### risk.github-issue-create-replay — Criação de issue não possui chave de idempotência

- Tipo / severidade / prioridade: **IDEMPOTENCY / MEDIUM / P2**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: createGitHubIssue sempre executa POST e não envia chave nem consulta vínculo existente antes de criar; repetição após timeout pode duplicar issue.
- Evidência: `src/lib/github/issues.ts`:35 — Função cria issue via POST sem chave de idempotência.; `src/app/api/webhook/zapi/route.ts`:8 — Webhook integra criação ao fluxo de automação.
- Impacto: Retry manual ou ambiguidade de rede pode abrir issues duplicadas para a mesma solicitação Codex.
- Escopo: domains domain.codex-automation, domain.whatsapp-conversations; capabilities automation.issue; flows codex.automation.
- Blast radius: **EXTERNAL**
- Workaround: A solicitação persiste número/URL após sucesso observado; não cobre resposta perdida.
- Direção: Persistir uma chave/vínculo antes ou durante a operação externa.
- Justificativa da prioridade: P2 porque exige replay/timeout e o impacto externo é reversível, mas gera duplicação operacional.

### risk.rate-limit-fails-open — Falha do rate limiter libera a requisição

- Tipo / severidade / prioridade: **SECURITY / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: consumeRateLimit registra warning e retorna allowed em exceção, deixando endpoints públicos sem proteção durante indisponibilidade do banco/RPC.
- Evidência: `src/lib/security/rateLimit.ts`:127 — Catch explicitamente registra “failed open”.
- Impacto: Ataques de volume ou abuso não são contidos justamente durante falha da dependência de rate limit.
- Escopo: domains domain.platform-runtime; capabilities platform.limit_requests; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Autenticação/assinatura e validações específicas continuam aplicáveis onde existem.
- Direção: Definir política de degradação por criticidade de endpoint.
- Justificativa da prioridade: P2 porque é uma escolha ativa de disponibilidade com condição específica, sem exploração observada.

### risk.remote-database-controls-unvalidated — Controles remotos de banco além do schema visível não foram validados

- Tipo / severidade / prioridade: **UNKNOWN / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / CONFIRMED**
- Problema: OpenAPI confirmou tabelas/colunas/RPCs, mas não constraints, índices, triggers, corpos de função, migrations aplicadas, RLS, policies, grants ou Auth remoto.
- Evidência: `system-knowledge/data-model.json` — Validação remota limitada ao contrato exposto.; `system-knowledge/integrations.json` — Integração Supabase registra explicitamente os controles não validados.
- Impacto: A baseline não pode afirmar que guardas locais de integridade, concorrência e autorização existem com a mesma forma em produção.
- Escopo: domains domain.platform-runtime, domain.reservation-inventory, domain.orders-payments, domain.ticketing-delivery; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Comparação de 44 tabelas/colunas e 33 RPCs reduz a incerteza de superfície.
- Direção: Comparar metadados e definições remotas por canal autorizado.
- Justificativa da prioridade: P2 porque é incerteza relevante, não vulnerabilidade ou divergência comprovada.

### risk.remote-webhook-registration-unvalidated — Registro remoto dos dois webhooks não foi confirmado

- Tipo / severidade / prioridade: **INTEGRATION / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / HIGH**
- Problema: Handlers, segredos e saúde dos provedores foram observados, mas não a configuração que entrega eventos Z-API e Mercado Pago aos endpoints corretos.
- Evidência: `system-knowledge/integrations.json` — Notas de Z-API e Mercado Pago deixam registro de webhook NOT_VALIDATED.; `system-knowledge/webhooks.json` — Catálogo contém dois webhooks locais.
- Impacto: Mensagens ou confirmações de pagamento podem não chegar mesmo com aplicação e credenciais saudáveis.
- Escopo: domains domain.whatsapp-conversations, domain.orders-payments; capabilities messaging.receive, payment.confirm; flows whatsapp.inbound_dispatch, ticket.payment_confirmation.
- Blast radius: **EXTERNAL**
- Workaround: Status dos provedores e rotas locais foram validados; registro e entrega real permanecem desconhecidos.
- Direção: Validar URLs, eventos inscritos e última entrega sem gerar transação.
- Justificativa da prioridade: P2 pela dependência externa crítica, com ocorrência ainda não comprovada.

### risk.vercel-project-identity-drift — Domínio declarado pertence a site, enquanto checkout local está ligado a rota5

- Tipo / severidade / prioridade: **CONFIGURATION_DRIFT / HIGH / P0**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: next.config.ts declara blackhouseclubedecomedia.vercel.app, resolvido para o projeto site; .vercel/project.json liga o workspace ao projeto rota5.
- Evidência: `next.config.ts`:3 — Origin declarado Black House.; `system-knowledge/infrastructure.json` — Projetos remoto declarado e ligado são diferentes.; `system-knowledge/configuration-drift.json` — Drift catalogado na Etapa 5.
- Impacto: Deploy, cron, URLs de checkout e validação de produção podem atingir projetos diferentes sem que o operador perceba.
- Escopo: domains domain.platform-runtime, domain.orders-payments; capabilities payment.checkout_create, payment.checkout_view; flows ticket.purchase.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Ambos os aliases responderam health 200 na observação, mas representam deployments distintos.
- Direção: Estabelecer um único projeto/domínio canônico antes de qualquer deploy.
- Justificativa da prioridade: P0 porque qualquer evolução/deploy pode ser aplicada ao alvo errado.

### risk.latest-rota5-deployment-error — Deployment mais recente do projeto rota5 está em ERROR

- Tipo / severidade / prioridade: **INFRASTRUCTURE / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: A inspeção remota encontrou o deployment mais recente de rota5 em ERROR, enquanto rota5-khaki permanece apontando para um deployment anterior READY.
- Evidência: `system-knowledge/runtime-validation.json` — runtime.vercel-linked-deployment = FAIL.; `system-knowledge/infrastructure.json` — Registra ready_deployment e latest_deployment_state ERROR.
- Impacto: Mudanças recentes não chegam ao alias produtivo e uma promoção/redeploy sem diagnóstico pode causar indisponibilidade.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **EXTERNAL**
- Workaround: O alias rota5-khaki observado continua saudável em deployment anterior.
- Direção: Diagnosticar o build do deployment falho depois da baseline.
- Justificativa da prioridade: P1 porque a produção observada está acessível, mas a linha de entrega mais recente falhou.

### risk.published-commit-unvalidated — Commit publicado não pode ser reconciliado com o HEAD auditado

- Tipo / severidade / prioridade: **OPERATIONAL / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / CONFIRMED**
- Problema: Os metadados retornados pelo deployment consultado não expuseram gitSource/commit; o HEAD local e origin/production foram confirmados, sem vínculo comprovado com o alias.
- Evidência: `system-knowledge/infrastructure.json` — published_commit está NOT_VALIDATED.; `system-knowledge/runtime-validation.json` — Validação Vercel não reconcilia commit.
- Impacto: Não é possível afirmar que a fotografia de código auditada corresponde ao binário publicado.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Health e identidades de deployment foram observados separadamente.
- Direção: Registrar SHA de origem nos deployments e reconciliar com a baseline.
- Justificativa da prioridade: P2 por limitar a confiança operacional sem provar divergência funcional.

### risk.local-runtime-env-incomplete — Ambiente local não contém todas as variáveis exigidas

- Tipo / severidade / prioridade: **CONFIGURATION_DRIFT / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: A Etapa 5 encontrou 44 variáveis catalogadas e presença remota de 24 nomes; o ambiente local usado na auditoria permanece incompleto.
- Evidência: `system-knowledge/environment.json` — Inventário e presença por ambiente.; `system-knowledge/configuration-drift.json` — Drift local/remoto catalogado.
- Impacto: Testes e execução local podem falhar ou seguir branches diferentes de produção, reduzindo reprodutibilidade.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Testes estáticos e checks remotos específicos podem ser executados de forma isolada.
- Direção: Definir conjuntos mínimos por modo de execução.
- Justificativa da prioridade: P2 por afetar validação e operação local, sem evidência de ausência no ambiente remoto.

### debt.seat-map-storage-contract-drift — Variável de bucket existe sem consumidor nem bucket remoto

- Tipo / severidade / prioridade: **CONFIGURATION_DRIFT / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: SEAT_MAP_STORAGE_BUCKET é catalogada, mas não há uso .storage no código e o Supabase remoto retornou zero buckets.
- Evidência: `system-knowledge/infrastructure.json` — storage.supabase registra variável, zero buckets e nenhum consumidor.; `system-knowledge/environment.json` — Variável está no inventário.
- Impacto: A configuração sugere uma persistência que não existe, confundindo operação e manutenção do mapa.
- Escopo: domains domain.table-map, domain.platform-runtime; capabilities table_map.preview; flows —.
- Blast radius: **DOMAIN**
- Workaround: Imagens atuais usam buffer/base64 ou filesystem temporário.
- Direção: Decidir se o contrato é legado ou infraestrutura ainda não implementada.
- Justificativa da prioridade: LOW com alcance DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### gap.critical-flow-correlation — Fluxos críticos não têm correlação ponta a ponta

- Tipo / severidade / prioridade: **OBSERVABILITY / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Há logs estruturados e tabelas de eventos/delivery, mas não foi encontrado um correlation/request ID comum atravessando webhook, RPC, pagamento, ticket e WhatsApp; runtime de logs ficou PARTIAL.
- Evidência: `docs/system/observability.md` — Status canônico PARTIAL.; `system-knowledge/runtime-validation.json` — runtime.vercel-logs = PARTIAL.; `src/app/api/webhook/payment/mercado-pago/route.ts` — Logs usam IDs locais sem correlação comum de jornada.
- Impacto: Falhas entre confirmação, emissão e entrega exigem correlação manual e podem mascarar duplicidade ou estado intermediário.
- Escopo: domains domain.orders-payments, domain.ticketing-delivery, domain.whatsapp-conversations, domain.combo-commerce-fulfillment; capabilities payment.confirm, ticket.deliver, messaging.respond, combo.confirm; flows ticket.payment_confirmation, ticket.delivery, combo.payment_confirmation.
- Blast radius: **MULTI_DOMAIN**
- Workaround: IDs de pedido, pagamento, mensagem e delivery persistidos permitem reconstrução parcial.
- Direção: Propagar um identificador comum nos registros e logs críticos.
- Justificativa da prioridade: P2 porque reduz detecção e diagnóstico, mas não prova falha funcional.

### debt.router-responsibility-concentration — Roteador conversacional concentra coordenação de muitos domínios

- Tipo / severidade / prioridade: **ARCHITECTURE / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: router.ts tem 19.367 linhas, fan-out 41 e coordena parsing, estado, autorização, catálogo, reserva, pagamento, combo, cortesia, gate, formatting e persistência.
- Evidência: `src/lib/tickets/router.ts`:1 — Roteador central.; `docs/system/architecture-hotspots.md` — Hotspot registra tamanho e fan-out.
- Impacto: Mudanças locais têm superfície de regressão ampla e tornam branches inalcançáveis ou prioridades de estado difíceis de revisar.
- Escopo: domains domain.whatsapp-conversations, domain.event-administration, domain.reservation-inventory, domain.orders-payments, domain.courtesy, domain.combo-commerce-fulfillment, domain.gate-admission; capabilities —; flows whatsapp.public_discovery, ticket.purchase, admin.whatsapp_session, admin.whatsapp_event_management, admin.courtesy_management, combo.delivery_choice.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Serviços extraídos e testes de contrato cobrem partes dos ramos.
- Direção: Separar fronteiras por estado/domínio em etapa posterior.
- Justificativa da prioridade: P2 pelo alcance e histórico de regressões, sem tratar tamanho isolado como defeito.

### debt.zapi-webhook-responsibility-coupling — Handler Z-API acopla transporte, deduplicação, automação e entrega

- Tipo / severidade / prioridade: **COUPLING / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: A rota Z-API tem 1.950 linhas, fan-out 22, chama router, GitHub, persistence, batches e envio externo no mesmo entrypoint.
- Evidência: `src/app/api/webhook/zapi/route.ts`:1 — Handler de webhook central.; `docs/system/architecture-hotspots.md` — Hotspot registra fan-out e responsabilidades.
- Impacto: Falha ou alteração no transporte pode afetar múltiplas jornadas e dificulta isolar retries e observabilidade.
- Escopo: domains domain.whatsapp-conversations, domain.codex-automation, domain.background-processing; capabilities messaging.receive, messaging.respond, automation.issue; flows whatsapp.inbound_dispatch, codex.automation.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Persistência de mensagens e deliveries oferece alguns limites internos.
- Direção: Formalizar fronteiras de transporte, despacho e side effects.
- Justificativa da prioridade: MEDIUM com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### gap.default-test-suite-failing — Suíte padrão está vermelha com sete casos falhos

- Tipo / severidade / prioridade: **TEST_GAP / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: npm test executou 210 casos: 203 passaram e 7 falharam em seis arquivos; a suíte não oferece sinal verde de regressão.
- Evidência: `package.json` — npm test contém 15 arquivos.; `scripts/test-admin-auth-pending-cancel.mjs`:32 — Expectativa de logout falha.; `scripts/test-admin-event-artist-name-leak.mjs`:143 — Duplicação falha.; `scripts/test-public-help-flow.mjs`:420 — Dois casos falham.; `scripts/test-whatsapp-batch-compat.mjs`:82 — Contrato textual falha.
- Impacto: Mudanças futuras não conseguem distinguir regressões novas de falhas preexistentes sem triagem manual.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: 203 casos passam e cada falha foi triada nesta etapa.
- Direção: Reconciliar defeitos reais e expectativas obsoletas em etapa de remediação.
- Justificativa da prioridade: P1 porque uma baseline evolutiva precisa de um gate padrão confiável.

### gap.critical-capability-and-flow-coverage — Capabilities e flows relevantes não têm teste direto

- Tipo / severidade / prioridade: **TEST_GAP / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: 37 capabilities não têm referência de teste e 4 flows não têm teste; entre eles há status/eventos, acesso fixo, automação Codex e finalização de evento.
- Evidência: `system-knowledge/capabilities.json` — metrics.without_test = 37.; `system-knowledge/flows.json` — metrics.without_test = 4.
- Impacto: Regressões em autorização, mutações e automação externa podem chegar sem detecção automatizada.
- Escopo: domains domain.event-administration, domain.gate-admission, domain.codex-automation, domain.background-processing; capabilities event.change_status, event.cancel, gate.fixed_create, gate.fixed_revoke, automation.issue, event.auto_finish; flows event.auto_finish, event.program_import, blackhouse.maintenance, codex.automation.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Há auditorias manuais e contratos indiretos para parte da superfície.
- Direção: Priorizar testes por criticidade e side effect, não por contagem bruta.
- Justificativa da prioridade: P1 pela presença de ações privilegiadas e externas sem teste direto.

### gap.real-integration-tests-outside-default — Testes reais e de integração ficam fora da suíte padrão

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: 28 arquivos de teste catalogados não pertencem ao npm test; casos com Supabase real e HTTP local exigem ambiente e foram pulados na validação ampla.
- Evidência: `system-knowledge/tests.json` — nonDefaultTestFileCount = 28 e lista dependências de ambiente.; `scripts/test-reservation-load-safe.mjs` — Teste real de reserva fora da suíte padrão.; `scripts/test-combo-offer-priority-real.mjs` — Teste real de combo fora da suíte padrão.
- Impacto: O gate padrão cobre principalmente módulos/contratos e pode passar sem validar banco, concorrência ou integrações reais.
- Escopo: domains domain.platform-runtime, domain.reservation-inventory, domain.combo-commerce-fulfillment; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Scripts reais podem ser executados manualmente em ambiente controlado.
- Direção: Criar camadas de suíte explícitas e reproduzíveis por dependência.
- Justificativa da prioridade: MEDIUM com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### gap.source-contract-assertion-bias — Parte relevante dos testes valida texto-fonte e regex de implementação

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: O catálogo classifica muitos testes como source-contract; falhas atuais por negrito e estrutura textual demonstram acoplamento a representação interna sem necessariamente indicar defeito do comportamento.
- Evidência: `system-knowledge/tests.json` — Tipos source-contract predominam em arquivos catalogados.; `scripts/test-whatsapp-batch-compat.mjs`:82 — Regex rejeita *NOVO* apesar da semântica preservada.; `scripts/test-public-availability-classification.mjs` — Regex exige apresentação literal de NEW/NOVO.
- Impacto: Refactors e ajustes de texto geram falsos negativos, enquanto comportamento integrado pode continuar sem prova.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: Alguns arquivos também executam funções diretamente.
- Direção: Migrar assertivas críticas para comportamento e manter contratos de fonte apenas onde necessários.
- Justificativa da prioridade: MEDIUM com alcance SYSTEM_WIDE, considerando probabilidade, workaround e capacidade de detecção.

### gap.test-runner-depends-on-untracked-loader — npm test depende de loader em diretório temporário não versionado

- Tipo / severidade / prioridade: **TEST_GAP / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: package.json aponta para ./.tmp/typescript-alias-loader.mjs; git não rastreia arquivos em .tmp, embora o loader exista nesta máquina.
- Evidência: `package.json` — Script test referencia .tmp/typescript-alias-loader.mjs.; `.gitignore` — .tmp é área ignorada/temporária conforme inventário do repositório.
- Impacto: Um checkout limpo ou CI pode falhar antes de executar qualquer teste por ausência do loader.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: O arquivo existe no workspace auditado.
- Direção: Versionar o mecanismo de resolução ou usar configuração padrão do runner.
- Justificativa da prioridade: P1 porque compromete a portabilidade do único gate padrão.

### gap.remote-database-behavior-tests — Equivalência remota de RPCs, triggers e constraints não tem teste de baseline

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / CONFIRMED**
- Problema: 33 nomes de RPC coincidem parcialmente com definições locais, mas corpos, triggers, constraints e índices remotos não foram inspecionados; testes reais não fazem parte do npm test.
- Evidência: `system-knowledge/database-objects.json` — Catálogo local/rotas remotas.; `system-knowledge/runtime-validation.json` — OpenAPI não prova comportamento interno.; `system-knowledge/tests.json` — Testes reais ficam fora do gate padrão.
- Impacto: A camada responsável por atomicidade e idempotência pode divergir do repositório sem detecção pelo gate local.
- Escopo: domains domain.reservation-inventory, domain.orders-payments, domain.ticketing-delivery, domain.combo-commerce-fulfillment; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Nomes de 30 RPCs de aplicação coincidem e rotas remotas foram observadas.
- Direção: Adicionar verificação não destrutiva de definição/versão e testes controlados de invariantes.
- Justificativa da prioridade: MEDIUM com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### dead.brand-logo-component — BrandLogo.tsx não possui consumidor encontrado

- Tipo / severidade / prioridade: **DEAD_CODE / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: BrandLogo exporta um componente comum, mas a busca de imports/uso encontrou somente sua própria definição.
- Evidência: `src/app/BrandLogo.tsx`:7 — Export default sem consumidor estático encontrado.
- Impacto: Mantém um componente e asset contract que aparentam ativos, aumentando ruído de marca e manutenção.
- Escopo: domains domain.brand-presentation; capabilities —; flows —.
- Blast radius: **LOCAL**
- Workaround: Nenhum impacto funcional atual comprovado.
- Direção: Confirmar ausência de import dinâmico antes de remoção futura.
- Justificativa da prioridade: LOW com alcance LOCAL, considerando probabilidade, workaround e capacidade de detecção.

### orphan.ticket-validation-history — Capability de histórico de validações não tem entrypoint

- Tipo / severidade / prioridade: **ORPHAN / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: listAdminTicketValidations existe e foi catalogada, mas nenhuma rota, UI ou comando alcançável foi encontrado.
- Evidência: `system-knowledge/capabilities.json` — ticket.validation_history está ÓRFÃ.; `src/lib/tickets/services/adminTickets.ts` — Implementação do histórico existe.
- Impacto: Código e consulta ficam sem uso operacional comprovado.
- Escopo: domains domain.ticketing-delivery; capabilities ticket.validation_history; flows —.
- Blast radius: **LOCAL**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Decidir se ganhará entrypoint ou será removida.
- Justificativa da prioridade: LOW com alcance LOCAL, considerando probabilidade, workaround e capacidade de detecção.

### orphan.gate-session-revoke — Capability de revogar sessão de leitor não tem entrypoint

- Tipo / severidade / prioridade: **ORPHAN / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: revokeGateSession existe, mas o catálogo não encontra consumidor/entrypoint; isso impede usar a revogação granular como resposta operacional comum.
- Evidência: `src/lib/tickets/services/gateSessions.ts`:488 — Função de revogação existe.; `system-knowledge/capabilities.json` — gate.session_revoke está ÓRFÃ.
- Impacto: Sessões emitidas não podem ser revogadas pelo fluxo catalogado, ampliando o risco de autorização já registrado.
- Escopo: domains domain.gate-admission; capabilities gate.session_revoke; flows —.
- Blast radius: **DOMAIN**
- Workaround: Alteração direta no banco seria possível, mas não é um fluxo de produto.
- Direção: Expor a capacidade com autorização administrativa apropriada.
- Justificativa da prioridade: P2 porque a ausência agrava revogação, embora a função exista.

### orphan.courtesy-event-limit — Limite global de cortesia existe sem entrypoint

- Tipo / severidade / prioridade: **ORPHAN / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: setCourtesyLimit está implementada, porém courtesy.event_limit não participa de flow/entrypoint; o fluxo usa limite por setor parcialmente.
- Evidência: `system-knowledge/capabilities.json` — courtesy.event_limit está ÓRFÃ.; `src/lib/tickets/services/adminCourtesies.ts` — Serviço contém a operação.
- Impacto: A regra global pode ficar divergente ou sem governança operacional.
- Escopo: domains domain.courtesy; capabilities courtesy.event_limit; flows —.
- Blast radius: **DOMAIN**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Definir se a regra global é legado ou deve ter gestão.
- Justificativa da prioridade: LOW com alcance DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### orphan.gate-sessions-list — Listagem de sessões de leitor não tem entrypoint

- Tipo / severidade / prioridade: **ORPHAN / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: listGateSessions consulta até 50 sessões, mas não há consumidor alcançável catalogado.
- Evidência: `src/lib/tickets/services/gateSessions.ts`:510 — Listagem está implementada.; `system-knowledge/capabilities.json` — gate.sessions_list está ÓRFÃ.
- Impacto: Operadores não têm visão catalogada das sessões ativas/revogadas, dificultando diagnóstico e resposta.
- Escopo: domains domain.gate-admission; capabilities gate.sessions_list; flows —.
- Blast radius: **DOMAIN**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Conectar a uma superfície administrativa ou remover se legado.
- Justificativa da prioridade: LOW com alcance DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### orphan.seat-map-renders-table — seat_map_renders não tem consumidor de aplicação confirmado

- Tipo / severidade / prioridade: **ORPHAN / LOW / P3**
- Status / confiança: **NOT_VALIDATED / HIGH**
- Problema: A tabela existe no modelo, mas não há .from("seat_map_renders") nem função local que a consuma; uso externo/dinâmico não pôde ser excluído.
- Evidência: `system-knowledge/data-model.json` — Tabela seat_map_renders catalogada.; `system-knowledge/infrastructure.json` — Imagens atuais usam buffer/base64 e nenhum .storage.
- Impacto: Tabela pode acumular custo e confundir o modelo de persistência de mapas.
- Escopo: domains domain.table-map; capabilities —; flows —.
- Blast radius: **LOCAL**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Verificar uso externo e retenção antes de classificar como dead code.
- Justificativa da prioridade: LOW com alcance LOCAL, considerando probabilidade, workaround e capacidade de detecção.

### legacy.table-map-presentation-disabled — Mapa oficial e cortesia permanecem implementados, mas desativados na apresentação Rota5

- Tipo / severidade / prioridade: **LEGACY / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: ROTA5_PRESENTATION_TABLE_MAP_ENABLED e ROTA5_PRESENTATION_COURTESY_ENABLED são false, enquanto serviços, API, tabela, assets e flows continuam presentes/parciais.
- Evidência: `src/lib/tickets/rota5Presentation.ts`:2 — Flags desativam mapa e cortesia na apresentação.; `system-knowledge/flows.json` — ticket.purchase e table_map.calibration permanecem PARCIAL.; `system-knowledge/infrastructure.json` — Contrato de storage não implementado.
- Impacto: Há duas realidades operacionais: código e dados de mesa/cortesia existem, mas a jornada pública Rota5 não os oferece integralmente.
- Escopo: domains domain.table-map, domain.courtesy, domain.brand-presentation; capabilities table_map.reserve, table_map.calibrate, courtesy.public_issue; flows ticket.purchase, courtesy.public, table_map.calibration.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Jornada individual de ingresso permanece ativa.
- Direção: Classificar explicitamente o que é produto futuro, compartilhado ou legado.
- Justificativa da prioridade: MEDIUM com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### debt.direct-supabase-access-spread — Acesso privilegiado ao Supabase está espalhado por services e routes

- Tipo / severidade / prioridade: **COUPLING / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: getSupabaseAdmin e chamadas .from/.rpc aparecem transversalmente em módulos de domínio e handlers, ligando regra, persistência e service role.
- Evidência: `src/lib/supabase/admin.ts` — Cliente administrativo central.; `docs/system/architecture-hotspots.md` — Supabase admin tem fan-in 44.; `system-knowledge/dependencies.json` — 817 dependências catalogadas mostram o acesso transversal.
- Impacto: Mudanças de schema, política de erro ou autorização exigem revisão ampla e um erro de boundary pode operar com privilégios elevados.
- Escopo: domains domain.platform-runtime, domain.event-administration, domain.orders-payments, domain.ticketing-delivery, domain.combo-commerce-fulfillment; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: O módulo do cliente mantém segredo no servidor e RLS local está habilitado.
- Direção: Concentrar contratos de dados e autorização por caso de uso.
- Justificativa da prioridade: MEDIUM com alcance SYSTEM_WIDE, considerando probabilidade, workaround e capacidade de detecção.

### debt.large-mixed-service-modules — Serviços grandes misturam consulta, regra, formatting e efeitos

- Tipo / severidade / prioridade: **MAINTAINABILITY / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: adminEvents.ts tem 2.758 linhas, comboOffers.ts 2.669 e adminReports.ts 1.512; os hotspots mostram múltiplas responsabilidades/fan-out.
- Evidência: `docs/system/architecture-hotspots.md` — Métricas e responsabilidades dos 14 hotspots.; `src/lib/tickets/services/adminEvents.ts`:1 — Serviço administrativo amplo.; `src/lib/tickets/services/comboOffers.ts`:1 — Serviço de oferta e distribuição amplo.
- Impacto: A revisão e alteração dessas áreas exige contexto extenso e aumenta risco de regressão, sem defeito funcional adicional comprovado.
- Escopo: domains domain.event-administration, domain.combo-commerce-fulfillment, domain.analytics-reporting; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Separar responsabilidades em etapa futura guiada pelos flows.
- Justificativa da prioridade: LOW com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### risk.payment-confirmed-before-external-delivery — Confirmação atômica e entrega externa formam fronteira de consistência eventual

- Tipo / severidade / prioridade: **DATA_INTEGRITY / MEDIUM / P1**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: A RPC confirma pedido/emite tickets; depois o handler chama entrega Z-API. Falha de entrega é registrada e não reverte pagamento/emissão, exigindo reaper/reenvio.
- Evidência: `src/app/api/webhook/payment/mercado-pago/route.ts`:497 — Confirma pedido por confirm_paid_ticket_order.; `src/app/api/webhook/payment/mercado-pago/route.ts`:538 — Entrega ocorre depois da confirmação.; `src/lib/tickets/services/whatsappOutboundDeliveries.ts`:14 — Delivery persiste idempotency_key e estado.
- Impacto: Cliente pode ficar temporariamente pago e emitido sem receber o ingresso; a recuperação depende da fila/reaper e observabilidade.
- Escopo: domains domain.orders-payments, domain.ticketing-delivery, domain.whatsapp-conversations; capabilities payment.confirm, ticket.deliver; flows ticket.payment_confirmation, ticket.delivery.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Idempotency key, estados de delivery, reenvio e reaper reduzem o risco e permitem recuperação.
- Direção: Tratar a fronteira como saga observável com recuperação testada.
- Justificativa da prioridade: P1 pelo vínculo com dinheiro/entrega, apesar das mitigações existentes.

### risk.whatsapp-conversation-context-race — Mensagens simultâneas podem competir pela atualização do contexto conversacional

- Tipo / severidade / prioridade: **CONCURRENCY / MEDIUM / P2**
- Status / confiança: **POTENTIAL / MEDIUM**
- Problema: Deduplicação protege message ID e batches têm claim RPC, mas o webhook lê estado, roteia e atualiza conversation context em etapas de aplicação; não foi encontrado lock/versionamento comum ao despacho.
- Evidência: `src/app/api/webhook/zapi/route.ts`:832 — POST coordena leitura, roteamento, envio e persistência.; `src/lib/tickets/services/conversations.ts` — Contexto é lido/atualizado por chamadas separadas.; `src/lib/tickets/services/messages.ts`:116 — Inbound deduplica mensagem, não serializa toda a conversa.
- Impacto: Duas mensagens válidas próximas podem produzir respostas fora de ordem ou sobrescrever o estado esperado.
- Escopo: domains domain.whatsapp-conversations; capabilities messaging.receive, messaging.respond; flows whatsapp.inbound_dispatch, whatsapp.public_discovery.
- Blast radius: **DOMAIN**
- Workaround: Chave de mensagem evita reprocessar o mesmo inbound; não cobre dois inbounds distintos concorrentes.
- Direção: Serializar processamento por conversa ou aplicar versão otimista.
- Justificativa da prioridade: MEDIUM com alcance DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### debt.payment-reconciliation-duplication-is-intentional — Webhook e consulta de status repetem confirmação com guardas idempotentes

- Tipo / severidade / prioridade: **DUPLICATION / INFO / P4**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Existem caminhos alternativos de confirmação por webhook e polling/status; ambos convergem para RPCs que retornam idempotent e evitam nova entrega quando a confirmação já ocorreu.
- Evidência: `src/app/api/webhook/payment/mercado-pago/route.ts`:497 — Webhook usa RPC atômica.; `src/app/api/checkout/status/route.ts` — Status pode reconciliar aprovação.; `supabase/migrations` — Definições locais de confirmação contêm guardas/idempotência.
- Impacto: A duplicação aumenta superfície de manutenção, mas fornece reconciliação legítima e não há defeito duplicado comprovado.
- Escopo: domains domain.orders-payments; capabilities payment.confirm, payment.status; flows ticket.payment_confirmation, ticket.purchase.
- Blast radius: **DOMAIN**
- Workaround: RPC central e flag idempotent são a mitigação atual.
- Direção: Preservar invariantes comuns ao manter os dois gatilhos.
- Justificativa da prioridade: P4 por ser duplicação intencional com guardas, registrada para evitar falso positivo.

### risk.checkout-status-fixed-polling — Checkouts consultam status a cada cinco segundos sem backoff

- Tipo / severidade / prioridade: **PERFORMANCE / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Clientes de checkout iniciam setInterval de 5 s e silenciam falhas enquanto a página permanece aberta.
- Evidência: `src/app/checkout/[orderId]/checkout-client.tsx`:220 — Polling fixo de 5 segundos.; `src/app/combo-checkout/[orderId]/combo-checkout-client.tsx`:138 — Polling equivalente para combo.
- Impacto: Muitas páginas abertas ampliam chamadas ao status/MP e logs, sobretudo durante incidentes de integração.
- Escopo: domains domain.orders-payments, domain.combo-commerce-fulfillment; capabilities payment.status, combo.status; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Polling termina com a página e a aprovação; rate limit protege endpoints.
- Direção: Aplicar backoff/limite ou evento push em etapa futura.
- Justificativa da prioridade: LOW com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### risk.production-capable-scripts-outside-test-isolation — Scripts reais podem ler ou alterar ambientes remotos por configuração

- Tipo / severidade / prioridade: **OPERATIONAL / MEDIUM / P2**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: O repositório contém auditorias e testes *-real/*-prod e scripts de manutenção que usam service role/DATABASE_URL; eles ficam fora do npm test e dependem de pré-condições/flags específicas.
- Evidência: `system-knowledge/tests.json` — Testes reais são dependentes de ambiente e fora da suíte padrão.; `scripts/test-combo-offer-priority-real.mjs` — Teste real combina Supabase e HTTP local.; `scripts/update-black-house-sectors.mjs`:38 — Script de manutenção consulta e pode atualizar escopo remoto.
- Impacto: Execução no ambiente errado pode criar, alterar ou remover dados operacionais.
- Escopo: domains domain.codex-automation, domain.event-administration, domain.platform-runtime; capabilities —; flows —.
- Blast radius: **EXTERNAL**
- Workaround: Vários scripts exigem --apply ou usam nomes de auditoria e limpeza explícita; não há runner único impondo isolamento.
- Direção: Classificar scripts por efeito e ambiente com guardas uniformes.
- Justificativa da prioridade: MEDIUM com alcance EXTERNAL, considerando probabilidade, workaround e capacidade de detecção.

### gap.partial-flows-lack-end-to-end-proof — Sete flows parciais não possuem prova ponta a ponta

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Os sete flows permanecem PARCIAL após revalidação; testes cobrem ramos ou contratos, mas não demonstram todos os terminais, integrações e recuperação.
- Evidência: `system-knowledge/flows.json` — whatsapp.public_discovery, ticket.purchase, courtesy.public, combo.delivery_choice, admin.whatsapp_event_management, admin.courtesy_management e table_map.calibration estão PARCIAL.
- Impacto: A saúde dessas jornadas não pode ser promovida a HEALTHY e regressões entre módulos podem escapar.
- Escopo: domains domain.whatsapp-conversations, domain.reservation-inventory, domain.courtesy, domain.combo-commerce-fulfillment, domain.event-administration, domain.table-map; capabilities —; flows whatsapp.public_discovery, ticket.purchase, courtesy.public, combo.delivery_choice, admin.whatsapp_event_management, admin.courtesy_management, table_map.calibration.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Cada flow possui evidência estrutural e cobertura parcial documentada.
- Direção: Criar cenários end-to-end não destrutivos para cada terminal crítico.
- Justificativa da prioridade: P1 porque são jornadas de compra/admin/entrega ativas, embora não estejam todas quebradas.

### gap.client-errors-not-persisted — Falhas de polling e scanner ficam apenas no estado do cliente

- Tipo / severidade / prioridade: **OBSERVABILITY / LOW / P3**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Vários catch em checkout/scanners apenas atualizam texto local ou ignoram erro de polling; não há persistência/telemetria do erro do browser.
- Evidência: `src/app/checkout/[orderId]/checkout-client.tsx`:215 — Falha de polling é silenciosa.; `src/app/gate/session/[token]/GateSessionScanner.tsx`:279 — Falha de scan vira mensagem local.; `src/app/kitchen/session/[token]/KitchenSessionScanner.tsx`:208 — Falha de atualização vira notice local.
- Impacto: Incidentes de browser, câmera e conectividade não aparecem na observabilidade do servidor, reduzindo diagnóstico.
- Escopo: domains domain.orders-payments, domain.gate-admission, domain.combo-commerce-fulfillment; capabilities —; flows ticket.purchase, gate.ticket_admission, kitchen.combo_redemption.
- Blast radius: **MULTI_DOMAIN**
- Workaround: O operador/cliente recebe feedback visual e tentativas subsequentes podem recuperar.
- Direção: Definir telemetria mínima e sem dados sensíveis para falhas críticas do cliente.
- Justificativa da prioridade: LOW com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### debt.distributed-status-literals — Estados e mensagens de negócio estão distribuídos em arquivos extensos

- Tipo / severidade / prioridade: **MAINTAINABILITY / INFO / P4**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Status de evento, sessão, pagamento, entrega e conversa aparecem em unions, branches, SQL e strings de UI/router; o catálogo reconstruiu 66 transições para reconciliá-los.
- Evidência: `system-knowledge/state-transitions.json` — 66 transições catalogadas.; `src/lib/tickets/router.ts` — Branches de estado conversacional.; `src/lib/tickets/services/comboRedemptions.ts` — Estados operacionais também vivem em raw_metadata.
- Impacto: Alterações de lifecycle exigem sincronização manual entre aplicação, SQL, UI e testes.
- Escopo: domains domain.event-administration, domain.orders-payments, domain.combo-commerce-fulfillment, domain.whatsapp-conversations; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Centralizar contratos de estado gradualmente, guiado pelo catálogo.
- Justificativa da prioridade: INFO com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### risk.service-role-application-authorization-boundary — A autorização da aplicação protege operações que usam service role

- Tipo / severidade / prioridade: **SECURITY / MEDIUM / P2**
- Status / confiança: **POTENTIAL / HIGH**
- Problema: APIs server-side usam o cliente administrativo que contorna RLS; segurança depende de cada handler validar sessão, CSRF, segredo, token e ownership antes da consulta/mutação.
- Evidência: `src/lib/supabase/admin.ts` — Cria cliente com service role no servidor.; `system-knowledge/infrastructure.json` — Boundary API→Supabase registra bypass de RLS.; `system-knowledge/entrypoints.json` — 56 entrypoints ampliam a superfície a revisar.
- Impacto: Uma omissão de autorização em um único handler teria privilégios amplos no banco; nenhuma rota explorável foi confirmada nesta etapa.
- Escopo: domains domain.platform-runtime, domain.admin-identity-access; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: server-only, proxy, cookies, CSRF, tokens e schemas são usados nas rotas catalogadas.
- Direção: Manter uma matriz verificável de autorização por entrypoint e reduzir privilégios quando possível.
- Justificativa da prioridade: P2 por ser risco estrutural real com controles presentes e sem exploração confirmada.

## Segunda passagem adversarial

Foram removidos 3 falsos positivos e 4 duplicados. Mensagens de logout/NOVO e negrito foram tratadas como contratos de teste divergentes; caminhos webhook/status de pagamento foram classificados como reconciliação intencional com RPC idempotente. Nenhum finding HIGH/CRITICAL ficou sem blast radius.
