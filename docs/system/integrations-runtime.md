# Integrações e runtime — Etapa 5

### Supabase/PostgreSQL

- **ID:** `integration-supabase`
- **Propósito:** Persistência relacional e RPCs transacionais.
- **Auth:** Service role no servidor; anon key apenas em ferramentas de auditoria; DATABASE_URL em script operacional.
- **Outbound:** PostgREST .from(); PostgREST RPC
- **Inbound/webhooks:** nenhum
- **Retry/timeout:** Implementado por fluxos específicos, sem retry global do cliente. Sem timeout global explícito no cliente Supabase.
- **Idempotência:** Constraints, RPCs transacionais e chaves específicas por fluxo.
- **Erros/logs:** Erros verificados pelos serviços e handlers. Logger estruturado em handlers; cobertura varia por fluxo.
- **Validação:** local LOCAL_DECLARED; remote REMOTE_SCHEMA; runtime RUNTIME_OBSERVED; resultado PARTIAL_MATCH.
- **Relações:** modules platform.supabase-client; flows ticket.purchase, ticket.payment_confirmation, combo.payment_confirmation; entrypoints http-zapi-webhook, http-mp-webhook, http-cron-expire, http-cron-batches.

### Z-API / WhatsApp

- **ID:** `integration-zapi`
- **Propósito:** Receber e enviar mensagens WhatsApp.
- **Auth:** Instance token no caminho, Client-Token no header e segredo próprio no webhook.
- **Outbound:** POST send-text; POST send-image
- **Inbound/webhooks:** POST /api/webhook/zapi; webhook.zapi
- **Retry/timeout:** Fila de deliveries/batches controla tentativas; cliente HTTP não possui retry global. 10 s no cliente.
- **Idempotência:** provider_message_id, idempotency_key e claims persistidos.
- **Erros/logs:** Falhas persistidas e reprogramadas; estado terminal registrado conforme o fluxo. Logs estruturados com telefone mascarado e segredos redigidos.
- **Validação:** local LOCAL_DECLARED; remote REMOTE_CONFIG; runtime RUNTIME_OBSERVED; resultado PARTIAL_MATCH.
- **Relações:** modules integration.zapi, messaging.webhook, messaging.outbound-deliveries, messaging.batches; flows whatsapp.inbound_dispatch, whatsapp.batch_processing, ticket.delivery; entrypoints http-zapi-webhook.

### Mercado Pago

- **ID:** `integration-mercado-pago`
- **Propósito:** Pix, checkout, consulta e confirmação de pagamentos.
- **Auth:** Bearer token outbound; assinatura x-signature e request-id inbound; segredo interno no checkout.
- **Outbound:** POST preferences; POST payments; GET payment
- **Inbound/webhooks:** POST /api/webhook/payment/mercado-pago; webhook.mercado-pago
- **Retry/timeout:** Sem retry global do cliente; reconciliação por consulta e webhook. 10 s no cliente.
- **Idempotência:** X-Idempotency-Key na criação de pagamento e deduplicação de payment_events.
- **Erros/logs:** Status HTTP e payload validados; evento persiste resultado/falha. IDs de pedido/pagamento presentes em pontos do fluxo.
- **Validação:** local LOCAL_DECLARED; remote REMOTE_CONFIG; runtime RUNTIME_OBSERVED; resultado PARTIAL_MATCH.
- **Relações:** modules integration.mercado-pago, payment.checkout, payment.webhook, payment.primitives; flows ticket.checkout, ticket.payment_confirmation, combo.payment_confirmation; entrypoints http-checkout-mp, http-checkout-pay, http-checkout-status, http-combo-pay, http-combo-status, http-mp-webhook.

### Vercel

- **ID:** `integration-vercel`
- **Propósito:** Hospedagem Next.js e agendamento cron.
- **Auth:** Conta Vercel existente; cron autentica por Bearer CRON_SECRET.
- **Outbound:** nenhum
- **Inbound/webhooks:** GET dos crons pela Vercel
- **Retry/timeout:** Agendamento a cada minuto; sem política de retry documentada no vercel.json. Plataforma; não declarado localmente.
- **Idempotência:** Handlers usam seleção/claims transacionais conforme o fluxo.
- **Erros/logs:** HTTP status e logs de execução. Logs de deployment/runtime acessíveis em leitura.
- **Validação:** local LOCAL_DECLARED; remote REMOTE_CONFIG; runtime RUNTIME_OBSERVED; resultado DRIFT.
- **Relações:** modules background.expire-cron, background.batch-cron; flows reservation.expiration, whatsapp.batch_processing; entrypoints http-cron-expire, http-cron-batches, trigger-cron-expire, trigger-cron-batches.

### GitHub Issues

- **ID:** `integration-github`
- **Propósito:** Criar issue para pedido Codex aprovado.
- **Auth:** Bearer token quando configurado; gh local autenticado para leitura.
- **Outbound:** POST GitHub Issues
- **Inbound/webhooks:** nenhum
- **Retry/timeout:** Sem retry explícito. Sem timeout explícito.
- **Idempotência:** Não há chave de idempotência explícita na chamada de criação.
- **Erros/logs:** Resultados not_configured, github_error e network_error. Resultado tratado pelo fluxo Codex.
- **Validação:** local LOCAL_DECLARED; remote REMOTE_CONFIG; runtime NOT_VALIDATED; resultado PARTIAL_MATCH.
- **Relações:** modules automation.github-issues, automation.codex-requests; flows codex.automation; entrypoints http-zapi-webhook.

### Codex CLI local

- **ID:** `integration-codex-cli`
- **Propósito:** Executar localmente pedidos aprovados.
- **Auth:** Sessão local do CLI e service role para fila.
- **Outbound:** processo Codex local; Z-API opcional para resultado
- **Inbound/webhooks:** nenhum
- **Retry/timeout:** Polling configurável; execução não tem retry genérico documentado. Não identificado.
- **Idempotência:** Claim de request no banco reduz dupla execução.
- **Erros/logs:** Estado e erro da execução persistidos. Console do runner e registros da fila.
- **Validação:** local LOCAL_DECLARED; remote NOT_VALIDATED; runtime RUNTIME_OBSERVED; resultado PARTIAL_MATCH.
- **Relações:** modules automation.local-runner, automation.codex-requests; flows codex.automation; entrypoints npm-codex-runner, script-codex-runner.

## Idempotência e risco de repetição

WhatsApp usa `provider_message_id`, `idempotency_key`, claims, contadores e estado terminal nas filas. Mercado Pago envia `X-Idempotency-Key` ao criar pagamento e registra eventos para deduplicação/reconciliação. RPCs de reserva e confirmação concentram operações transacionais. GitHub Issues não apresenta chave de idempotência explícita, portanto uma repetição após resultado ambíguo pode duplicar o efeito. Crons rodam a cada minuto e dependem de claims/estado persistido para tolerar execução repetida.
