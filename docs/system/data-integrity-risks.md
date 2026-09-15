> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 combo concurrency reconciliation

`risk.combo-metadata-read-modify-write-race` is RESOLVED: CURRENT writers use row locks and merge JSONB over current database state, and consumption/delivery metadata are atomic. The separate `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` remains ACTIVE because external notifications can precede that serialization; it does not reintroduce raw_metadata lost updates.

## Current paid-delivery boundary — Baseline 2.6.0

The original payment-before-durable-work risk is RESOLVED. The remaining `risk.paid-delivery-ambiguous-external-ack` is ACTIVE MEDIUM/P2 and non-blocking: local work is at-least-once and an ambiguous Z-API ACK can duplicate an external message/QR.

# Riscos de integridade, transação, concorrência e idempotência

## Resolved administrative integrity findings in 2.5.0

`risk.admin-event-multistep-partial-state` and `bug.admin-event-location-consistency` are RESOLVED. Historical HIGH/P1 metadata remains, but both are non-operational and non-release-blocking. Canonical detail and historical evidence live in `system-knowledge/findings.json`.

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### risk.admin-event-multistep-partial-state — RESOLVED

- Type / severity / priority: **DATA_INTEGRITY / HIGH / P1** (severity and priority retained as history).
- Status / confidence: **RESOLVED / CONFIRMED**.
- Current state: CREATE, UPDATE and DUPLICATE execute through transactional PostgreSQL catalog functions with persistent idempotency; web and WhatsApp retries preserve stable operation intent.
- Current evidence: `20260914000100_create_admin_event_catalog_rpcs.sql`, `adminEvents.ts`, `router.ts`, `test-admin-event-atomic-mutations.mjs`, `test-admin-event-catalog-postgres.mjs` and Quality Gate 34898804387.
- Current impact: historical partial-state impact is no longer active in the proven scope; no workaround is required.
- History: Baseline 2.4.4 classified the finding as POTENTIAL; later audit reproduced partial CREATE/UPDATE/DUPLICATE state and duplicate retry behavior before the transactional remediation. Full history is under `resolution.historical_evidence` in `system-knowledge/findings.json`.

### bug.admin-event-location-consistency — RESOLVED

- Type / severity / priority: **DATA_INTEGRITY / HIGH / P1**.
- Status / confidence: **RESOLVED / CONFIRMED**.
- Current state: non-location saves preserve session venues; unsafe multi-venue or mapped changes are blocked; safe single-venue changes update event plus sessions atomically; venue/city/state follow one policy; ticket readers prefer session venue; legacy `update_admin_event_venue` is absent.
- Current evidence: migrations `20260914000300_enforce_admin_event_location_consistency.sql` and `20260914000400_retire_legacy_admin_event_venue_rpc.sql`, session-first reader code, PostgreSQL integration and final remote audit with zero divergences.
- Historical evidence, including the superseded migration 002 bypass, is preserved under `resolution.historical_evidence`.

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

### Historical pre-resolution snapshot: risk.payment-confirmed-before-external-delivery

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

## Fronteiras de transação

| Operação | Fronteira observada | Avaliação |
|---|---|---|
| Reserva de ingresso | RPCs locais de reserva/cancelamento | ATOMIC_RPC |
| Confirmação de pagamento e emissão | confirm_paid_ticket_order / confirmação de combo | ATOMIC_RPC; entrega externa posterior |
| Cortesia e ingresso gratuito | RPCs de emissão | ATOMIC_RPC |
| Resgate de combo | validate_combo_redemption | ATOMIC_RPC existente, mas inalcançável no caso válido |
| Criação completa de evento | múltiplos writes no serviço | MULTI_STEP_APPLICATION |
| Batches WhatsApp | claim RPC + estados/retry | ATOMIC_RPC no claim; processamento externo eventual |
| Gate session creation/replacement | múltiplos writes de aplicação | MULTI_STEP_APPLICATION |

Constraints, locks e corpos remotos permanecem UNKNOWN; a classificação ATOMIC_RPC descreve o limite local da função SQL.
