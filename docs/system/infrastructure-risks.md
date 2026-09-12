# Riscos de infraestrutura e configuração

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

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

## Estado remoto observado

Os aliases consultados responderam 200. O domínio declarado pertence a **site**, o workspace está ligado a **rota5**, o alias rota5-khaki usa um deployment READY anterior e o deployment mais recente está ERROR. O SHA publicado continua NOT_VALIDATED. Nenhuma configuração remota foi alterada.
