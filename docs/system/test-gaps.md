> **Current Baseline 2.7.0 (2026-09-15):** `MINOR_COMPATIBLE_FUNCTIONAL_CHANGE` on canonical functional source `1f504eb4e4a08ab8f8de3ff3a39e1803f625dc27`. Fingerprint `9a9ab1a24c824a879213174a34ba1940eded2eeaf90fca26494a6eb24bc9dbee`; 391 source files, 88 migrations, 45 tables, 63 SQL functions, 1 sequence, 57 test files and 47 findings. `risk.combo-metadata-read-modify-write-race` is RESOLVED; `risk.combo-direct-notification-concurrency-can-duplicate-or-stale` is ACTIVE MEDIUM/P2 and non-release-blocking. Release blockers: 0; Product and Infrastructure remain DEGRADED.

## Historical snapshot — Baseline 2.5.3 evidence update

Direct administrative event regression evidence is now in the 257/257 default suite and the separate 2/2 PostgreSQL integration. Broader end-to-end and remote-evidence gaps retain their existing lifecycle unless directly proven.

# Gaps e qualidade da suíte

> **HISTORICAL SNAPSHOT:** the detailed Baseline V1 sections below preserve original evidence. Current semantics for every `RESOLVED` record are machine-readable in `system-knowledge/findings.json`; these historical descriptions are not remediation instructions.

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### gap.default-test-suite-failing — Suíte padrão está vermelha com sete casos falhos

- Tipo / severidade / prioridade: **TEST_GAP / HIGH / P1**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: npm test executou 214 casos: 207 passaram e as mesmas 7 falharam em seis arquivos; a suíte não oferece sinal verde de regressão.
- Evidência: `package.json` — npm test contém 15 arquivos.; `scripts/test-admin-auth-pending-cancel.mjs`:32 — Expectativa de logout falha.; `scripts/test-admin-event-artist-name-leak.mjs`:143 — Duplicação falha.; `scripts/test-public-help-flow.mjs`:420 — Dois casos falham.; `scripts/test-whatsapp-batch-compat.mjs`:82 — Contrato textual falha.
- Impacto: Mudanças futuras não conseguem distinguir regressões novas de falhas preexistentes sem triagem manual.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: 203 casos passam e cada falha foi triada nesta etapa.
- Direção: Reconciliar defeitos reais e expectativas obsoletas em etapa de remediação.
- Justificativa da prioridade: P1 porque uma baseline evolutiva precisa de um gate padrão confiável.

### gap.critical-capability-and-flow-coverage — Capabilities e flows relevantes não têm teste direto

- Tipo / severidade / prioridade: **TEST_GAP / HIGH / P1**
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema: remediado por cobertura comportamental baseada em risco: 21/21 capabilities MUST e 2/2 flows críticos cobertos; o contador bruto UNCOVERED permanece informativo e não precisa ser zero.
- Evidência: `system-knowledge/capabilities.json` — 21 MUST cobertas, 0 gaps MUST e evidência incidental de `analytics.track_click` e `automation.list`; `system-knowledge/flows.json` — `event.auto_finish` e `codex.automation` cobertos, 0 high-risk flows sem cobertura; Quality Gate 34867214724 PASS.
- Impacto: Regressões em autorização, mutações e automação externa podem chegar sem detecção automatizada.
- Escopo: domains domain.event-administration, domain.gate-admission, domain.codex-automation, domain.background-processing; capabilities event.change_status, event.cancel, gate.fixed_create, gate.fixed_revoke, automation.issue, event.auto_finish; flows event.auto_finish, event.program_import, blackhouse.maintenance, codex.automation.
- Blast radius: **MULTI_DOMAIN**
- Resolução: testes executam módulos de produção e verificam autorização, mutações, idempotência e side effects; não são apenas source regex.
- Exclusões históricas/órfãs fora do risco corrente: `event.import_program`, `event.legacy_rename`, `event.legacy_split`, `event.legacy_update`, `ticket.validation_history`, `courtesy.event_limit`, `gate.sessions_list`.
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
- Status / confiança: **RESOLVED / CONFIRMED**
- Problema histórico preservado: package.json apontava para ./.tmp/typescript-alias-loader.mjs; Git não rastreava arquivos em .tmp, embora o loader existisse na máquina auditada.
- Evidência histórica: `package.json` referenciava `.tmp/typescript-alias-loader.mjs`; `.gitignore` mantinha `.tmp` ignorado.
- Resolução: loader byte-identical versionado em `scripts/test-support/typescript-alias-loader.mjs`; `npm ci` e `npm test` executados a partir de blobs Git canônicos, sem `.tmp` ou `node_modules` copiados; resultado 207/214, mesmas sete falhas e zero regressões novas.
- Impacto: Um checkout limpo ou CI pode falhar antes de executar qualquer teste por ausência do loader.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **SYSTEM_WIDE**
- Workaround: O arquivo existe no workspace auditado.
- Direção: Versionar o mecanismo de resolução ou usar configuração padrão do runner.
- Justificativa da prioridade: P1 porque compromete a portabilidade do único gate padrão.

### gap.remote-database-behavior-tests — Equivalência remota de RPCs, triggers e constraints não tem teste de baseline

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P2**
- Status / confiança: **NOT_VALIDATED / CONFIRMED**
- Problema: 39 rotas RPC de aplicação coincidem com definições locais, mas corpos, triggers, constraints e índices remotos não foram inspecionados; testes reais não fazem parte do npm test.
- Evidência: `system-knowledge/database-objects.json` — Catálogo local/rotas remotas.; `system-knowledge/runtime-validation.json` — OpenAPI não prova comportamento interno.; `system-knowledge/tests.json` — Testes reais ficam fora do gate padrão.
- Impacto: A camada responsável por atomicidade e idempotência pode divergir do repositório sem detecção pelo gate local.
- Escopo: domains domain.reservation-inventory, domain.orders-payments, domain.ticketing-delivery, domain.combo-commerce-fulfillment; capabilities —; flows —.
- Blast radius: **MULTI_DOMAIN**
- Workaround: As 39 rotas RPC de aplicação coincidem nominalmente e foram observadas diretamente no OpenAPI remoto.
- Direção: Adicionar verificação não destrutiva de definição/versão e testes controlados de invariantes.
- Justificativa da prioridade: MEDIUM com alcance MULTI_DOMAIN, considerando probabilidade, workaround e capacidade de detecção.

### gap.partial-flows-lack-end-to-end-proof — Sete flows parciais não possuem prova ponta a ponta

- Tipo / severidade / prioridade: **TEST_GAP / MEDIUM / P2**
- Status / confiança: **ACTIVE / CONFIRMED**
- Problema: gap E2E confirmado, porém heterogêneo; os sete flows foram avaliados individualmente e nenhum justificou P1 com a cobertura atual.
- Evidência: `system-knowledge/flows.json` — whatsapp.public_discovery, ticket.purchase, courtesy.public, combo.delivery_choice, admin.whatsapp_event_management, admin.courtesy_management e table_map.calibration estão PARCIAL.
- Impacto: A saúde dessas jornadas não pode ser promovida a HEALTHY e regressões entre módulos podem escapar.
- Escopo: domains domain.whatsapp-conversations, domain.reservation-inventory, domain.courtesy, domain.combo-commerce-fulfillment, domain.event-administration, domain.table-map; capabilities —; flows whatsapp.public_discovery, ticket.purchase, courtesy.public, combo.delivery_choice, admin.whatsapp_event_management, admin.courtesy_management, table_map.calibration.
- Blast radius: **MULTI_DOMAIN**
- Workaround: Cada flow possui evidência estrutural e cobertura parcial documentada.
- Direção: manter ACTIVE/P2 e ampliar prova E2E por risco, priorizando `ticket.purchase`; ausência de E2E isoladamente não bloqueia release.
- Justificativa da prioridade: P2 após decomposição; os sete flows têm cobertura comportamental relevante e nenhum defeito atual demonstrado, mas a prova E2E unificada continua incompleta.

## Execução atual

- npm test: 257 casos, 257 PASS, 0 FAIL, 0 skip, 0 todo.
- typecheck: PASS, zero diagnósticos após a resolução de bug.create-event-invalid-jsx.
- lint: PASS no Quality Gate atual.
- Suíte padrão: 23 arquivos.
- Testes catalogados fora da suíte: 30 arquivos.
- Catálogo corrente: 53 testes, além de auditorias/tools.

## Qualidade

Há fixtures e execução direta de módulos, mas muitos testes usam regex sobre fonte. Testes reais dependem de ambiente e alguns podem escrever dados; não foram executados destrutivamente. A segunda passagem classificou três failures como expectativas possivelmente obsoletas, sem apagar o fato de que a suíte está vermelha.
