> **Current Baseline 2.8.0 (2026-09-16):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `c48405e41df3d1cd69eb3d383b7c6dd17257155e`. Fingerprint `ef5d175d8edf5c867131ac4e65f80555e0e5839640595b486ee79c9b99885f91`; 394 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 59 test files and 47 findings. `risk.rate-limit-fails-open` is RESOLVED with explicit outage policy across 19 boundaries. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Dívida técnica

## Separate hardening candidate

Retention/cleanup for `admin_event_operations` is a **SEPARATE_HARDENING_CANDIDATE**. Current evidence does not justify a formal HIGH/P1 finding or release blocker.

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

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

### debt.distributed-status-literals — Estados e mensagens de negócio estão distribuídos em arquivos extensos

- Tipo / severidade / prioridade: **MAINTAINABILITY / INFO / P4**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: Status de evento, sessão, pagamento, entrega e conversa aparecem em unions, branches, SQL e strings de UI/router; o catálogo reconstruiu 68 transições para reconciliá-los.
- Evidência: `system-knowledge/state-transitions.json` — 68 transições catalogadas.; `src/lib/tickets/router.ts` — Branches de estado conversacional.; `src/lib/tickets/services/comboRedemptions.ts` — Estados operacionais também vivem em raw_metadata.
- Impacto: Alterações de lifecycle exigem sincronização manual entre aplicação, SQL, UI e testes.
- Escopo: domains domain.event-administration, domain.orders-payments, domain.combo-commerce-fulfillment, domain.whatsapp-conversations; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Nenhum necessário ou comprovado.
- Direção: Centralizar contratos de estado gradualmente, guiado pelo catálogo.
- Justificativa da prioridade: INFO com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

## Duplicação avaliada

A confirmação por webhook e por consulta de status é **DUPLICATION_INTENTIONAL**: ambos convergem para RPC com sinal idempotent. Wrappers e adapters legítimos não foram marcados. O risco real permanece na manutenção comum dos invariantes, com prioridade P4.
