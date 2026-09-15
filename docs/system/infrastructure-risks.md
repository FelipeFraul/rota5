> **Current Baseline 2.6.2 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over unchanged functional Baseline 2.6.0/source `0a10618648fc3f873afffd8f60e60bd0396b62e7` and documentary Baseline 2.6.1. This surgical patch corrects only the NEXT-ACTIONS priority placement and stale current Node evidence. Fingerprint remains `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`; counts remain 390 source files, 87 migrations, 45 tables, 57 SQL functions, 1 sequence, 57 tests and 46 findings. Lifecycle, release blockers (0), health, database and deployment are unchanged.

# Riscos de infraestrutura e configuração

Baseline V1 — Etapa 6 de 8. Gerado em 2026-09-12 sobre o commit a141c6004421fb8442f95493de3ca4ec4d4c997b e o working tree descrito no machine-readable. Esta etapa registra fatos e riscos; não aplica correções.

### risk.vercel-project-identity-drift — Identidade Git/Vercel do Rota5 separada da Ticketeira

- Tipo / severidade / prioridade: **CONFIGURATION_DRIFT / HIGH / P0**
- Status / confiança: **RESOLVED / CONFIRMED**
- Causa raiz: separação incorreta de identidade Git/Vercel entre Rota5 e Ticketeira.
- Evidência atual: `origin` e `origin/production` identificam `FelipeFraul/rota5`; `.vercel/project.json` identifica `rota5`; Vercel liga o projeto ao mesmo repo e à branch `production`; `git.deploymentEnabled=false`.
- Histórico preservado: Vercel `site` e GitHub `FelipeFraul/ticketeira` pertencem à Ticketeira e explicam a confusão anterior, sem integrar a cadeia operacional atual do Rota5.
- Estado de release: nenhum deployment novo; o HEAD atual não está publicado.

### risk.latest-rota5-deployment-error — Deployment ERROR histórico substituído pelo Production READY atual

- Tipo / severidade / prioridade: **INFRASTRUCTURE / HIGH / P1**
- Status / confiança: **RESOLVED / CONFIRMED**
- Condição histórica: a inspeção anterior encontrou o deployment mais recente de `rota5` em ERROR enquanto o alias servia um deployment READY anterior.
- Evidência de resolução: `dpl_4LxzB5GnHoW6VHYnkHyPC9NEQFVT` está READY, atende os aliases canônicos e passou health, página pública, admin auth e probe EXPAND, com zero erros relevantes nos logs e sem rollback.
- Impacto atual: a condição que definia o finding não existe; published-commit parity e outros riscos continuam separados.
- Escopo: domains domain.platform-runtime; capabilities —; flows —.
- Blast radius: **EXTERNAL**
- Workaround: Não necessário para este finding resolvido.
- Direção: Preservar a evidência histórica; tratar riscos restantes pelos respectivos IDs.
- Justificativa da prioridade histórica: P1 porque a produção permanecia acessível durante a falha da linha de entrega mais recente.

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

Os aliases consultados responderam 200. O domínio declarado pertence a **site**, o workspace está ligado a **rota5** e o deployment Production mais recente de `rota5` está READY e atende os aliases canônicos. A paridade do baseline HEAD publicado continua tratada separadamente como NOT_VALIDATED. Nenhuma configuração remota foi alterada nesta auditoria semântica.
