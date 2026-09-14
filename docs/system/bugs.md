# Bugs e flows quebrados

## Resolved location-consistency history in 2.5.0

`bug.admin-event-location-consistency` is incorporated as a DATA_INTEGRITY finding because the reproduced defect concerned cross-table venue/city/state invariants. It is RESOLVED/HIGH/P1; current evidence is top-level and historical defect evidence is preserved under `resolution.historical_evidence`.

> **HISTORICAL SNAPSHOT:** the detailed problem/evidence/impact fields below preserve the original Baseline V1 findings. For every `RESOLVED` record, current state is defined only by `system-knowledge/findings.json` top-level fields; historical claims live under `resolution.historical_evidence`.

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### bug.create-event-invalid-jsx — JSX inválido impede compilar o workspace web de eventos

- Tipo / severidade / prioridade: **BUG / HIGH / P0**
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema: CreateEventModal fecha um div antes do footer e deixa o JSX estruturalmente inválido. TypeScript e ESLint param no parse.
- Evidência: `src/app/admin/eventos/event-editor/CreateEventModal.tsx`:19 — JSX em uma única linha contém fechamento incompatível.; `system-knowledge/flows.json` — admin.web_event_workspace estava QUEBRADO na Baseline V1.0.0 e agora está PARCIAL.
- Impacto: A aplicação no estado local não passa typecheck/build e o workspace administrativo web não pode ser entregue com segurança.
- Escopo: domains domain.event-administration, domain.analytics-reporting, domain.combo-commerce-fulfillment; capabilities event.list, event.inspect, event.create, event.edit, event.publish, event.change_status, event.cancel, event.duplicate, combo.list, analytics.general_dashboard, analytics.event_dashboard, analytics.contacts; flows admin.web_event_workspace.
- Blast radius: **MULTI_DOMAIN**
- Workaround: APIs e jornada administrativa por WhatsApp continuam estruturalmente presentes.
- Direção: Restaurar a estrutura JSX e só então revalidar build e workspace.
- Justificativa da prioridade: P0 porque bloqueia a compilação da baseline local e a evolução segura do principal workspace administrativo.

- Resolução (2026-09-12): removido somente o fechamento `</div>` excedente; typecheck, lint e build passam. npm test permanece 203/210, sem mudança. ID, HIGH e P0 foram preservados como histórico.

### bug.combo-redemption-unreachable-consume — Caso válido de combo não alcança a RPC que consome o resgate

- Tipo / severidade / prioridade: **BROKEN_FLOW / HIGH / P0**
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema: O retorno antecipado abrangia também escolhas já confirmadas e foi restringido ao estado sem delivery_choice_confirmed_at; o caso confirmado e pronto agora alcança validate_combo_redemption.
- Evidência: `src/lib/tickets/services/comboRedemptions.ts`:935 — Início da validação do scan.; `src/lib/tickets/services/comboRedemptions.ts`:1462 — RPC de consumo aparece depois dos retornos dos casos válidos.; `system-knowledge/flows.json` — kitchen.combo_redemption está QUEBRADO.
- Impacto: A cozinha pode validar ou orientar entrega sem concluir atomicamente o consumo, permitindo reapresentação e divergência de estado.
- Escopo: domains domain.combo-commerce-fulfillment; capabilities combo.redeem, combo.delivery_prompt; flows kitchen.combo_redemption.
- Blast radius: **DOMAIN**
- Workaround: Não há conclusão equivalente comprovada no mesmo fluxo.
- Direção: Reconectar o caminho válido à transição atômica existente.
- Justificativa da prioridade: P0 porque o fluxo operacional de consumo está comprovadamente quebrado e afeta controle de entrega.

### bug.event-duplicate-artist-leak — Duplicação de evento preserva artista do evento de origem

- Tipo / severidade / prioridade: **BUG / MEDIUM / P1**
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema histórico preservado; o comportamento descrito não se reproduz no source atual.
- Evidência histórica: as linhas e falhas registradas no baseline original são preservadas como causa anterior, não como estado atual. Evidência atual: correção funcional presente; testes direcionados e suíte 257/257 PASS.
- Impacto: Um rascunho duplicado pode exibir ou persistir artista incoerente com o título, exigindo correção manual.
- Escopo: domains domain.event-administration; capabilities event.duplicate; flows admin.whatsapp_event_management, admin.web_event_workspace.
- Blast radius: **DOMAIN**
- Resolução: correção funcional já presente e prova direta incluída na suíte 257/257; lifecycle reconciliado em 2.4.1.
- Limitação: a resolução cobre o defeito específico e as superfícies revalidadas; não encerra riscos diferentes de fluxo administrativo nem garante ausência absoluta de corrupção textual futura.
- Justificativa da prioridade: P1 por produzir dado administrativo incorreto em uma ação ativa, com workaround manual.

### bug.user-visible-text-corruption — Textos ativos contêm mojibake e substituições por interrogação

- Tipo / severidade / prioridade: **BUG / MEDIUM / P1**
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema histórico preservado; o comportamento descrito não se reproduz no source atual.
- Evidência histórica: as linhas e falhas registradas no baseline original são preservadas como causa anterior, não como estado atual. Evidência atual: correção funcional presente; testes direcionados e suíte 257/257 PASS.
- Impacto: Usuários e administradores recebem texto corrompido; IDs/keywords corrompidos também alteram resultados e contratos de busca.
- Escopo: domains domain.whatsapp-conversations, domain.analytics-reporting, domain.orders-payments, domain.combo-commerce-fulfillment; capabilities messaging.respond, messaging.help, payment.checkout_view, combo.kitchen_open, analytics.general_dashboard, analytics.event_dashboard; flows whatsapp.public_discovery, admin.web_event_workspace, kitchen.combo_redemption.
- Blast radius: **MULTI_DOMAIN**
- Resolução: correção funcional já presente e prova direta incluída na suíte 257/257; lifecycle reconciliado em 2.4.1.
- Limitação: a resolução cobre o defeito específico e as superfícies revalidadas; não encerra riscos diferentes de fluxo administrativo nem garante ausência absoluta de corrupção textual futura.
- Justificativa da prioridade: P1 porque o defeito é visível em jornadas públicas e administrativas e já quebra testes.

## Revalidação dos flows

Nenhum flow permanece QUEBRADO. Há nove flows PARCIAIS: whatsapp.public_discovery, ticket.purchase, courtesy.public, combo.delivery_choice, admin.whatsapp_event_management, admin.courtesy_management, table_map.calibration, admin.web_event_workspace e kitchen.combo_redemption.
