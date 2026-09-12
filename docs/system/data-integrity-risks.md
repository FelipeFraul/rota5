# Riscos de integridade, transação, concorrência e idempotência

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

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
