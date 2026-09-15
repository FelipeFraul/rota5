> **Current Baseline 2.7.3 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

# Dead code, órfãos e legado

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### legacy.active-brand-contamination - Scoped active surfaces resolved

- Type / severity / priority: **LEGACY / HIGH / P1**
- Status / confidence: **RESOLVED / CONFIRMED**
- Resolution: checkout pending/success, five public-help responses, the resend fallback and three additional audited router prompts, the dead greeting block, active CSS background references, static CORS and the unused environment-schema entry were corrected.
- Runtime proof: Preview `dpl_4MAmzsQ6NVM36W1uie5VoVJas9zW` and Production `dpl_H3kDzmLYYfQn8hmcynMhPWYjm5Qo` are READY on exact source `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; scoped legacy terms, CSS RockBar references, broken backgrounds and legacy CORS are zero; both Rota5 assets return HTTP 200; relevant Production log errors are zero.
- Historical evidence preserved: the original finding recorded active checkout copy, public help, router copy, CSS references and Black House CORS before remediation.
- Scope limitation: resolution covers `DOCUMENTED_AND_REAUDITED_ACTIVE_SURFACES`. It is not a repository-wide assertion that historical brand strings do not exist elsewhere.
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

## Classificação de candidatos

| Item | Classificação | Motivo |
|---|---|---|
| BrandLogo.tsx | DEAD_CODE | Sem consumidor estático encontrado |
| 4 capabilities standalone | ORPHAN | Implementadas sem entrypoint/flow |
| seat_map_renders | EXTERNAL_USAGE_UNKNOWN | Sem consumidor local; remoto externo não excluído |
| assets sem referência | EXTERNAL_USAGE_UNKNOWN | Podem ser consumidos por CSS, URL ou operação externa |
| scripts Black House | ACTIVE_SHARED/BLACKHOUSE_LEGACY pendente | Scripts operacionais explícitos, não dead code |
| rockbar.webp / rockbar_mb.webp | RESOLVED historical evidence | Active CSS now references valid rota5.webp / rota5_mb.webp assets |
| flags de mesa/cortesia | UNKNOWN/LEGACY | Implementação presente e apresentação Rota5 desativada |
