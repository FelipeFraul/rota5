> **Current Baseline 2.7.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Baseline 2.7.0 distinct external duplication risks

`risk.combo-direct-notification-concurrency-can-duplicate-or-stale` concerns two concurrent operations sending before the database transition is observed. `risk.paid-delivery-ambiguous-external-ack` concerns a single effect accepted by the provider with an ambiguous local ACK. They are not semantically merged.

## Current paid-delivery boundary — Baseline 2.6.0

The original payment-before-durable-work risk is RESOLVED. The remaining `risk.paid-delivery-ambiguous-external-ack` is ACTIVE MEDIUM/P2 and non-blocking: local work is at-least-once and an ambiguous Z-API ACK can duplicate an external message/QR.

# Riscos de integração

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

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

## Matriz das seis integrações

| Integração | Falha/retry/idempotência | Observabilidade e validação |
|---|---|---|
| Supabase | RPCs protegem operações críticas; app depende de service role | OpenAPI parcial; internals remotos NOT_VALIDATED |
| Z-API | deliveries/batches persistem retry e idempotency key | instância conectada; webhook/entrega real NOT_VALIDATED |
| Mercado Pago | assinatura e RPC idempotente; entrega é eventual | conta validada; webhook/pagamento real NOT_VALIDATED |
| Vercel | deployment Production mais recente READY nos aliases canônicos | projeto/identidade e runtime confirmados; logs completos continuam PARTIAL |
| GitHub | POST de issue sem chave idempotente | repositório validado; criação real não executada |
| Codex CLI | processo local com estado de solicitação | versão validada; execução depende da máquina |
