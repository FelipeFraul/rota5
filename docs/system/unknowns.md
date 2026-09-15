> **Current Baseline 2.6.1 (2026-09-15):** `PATCH_DOCUMENTARY_CORRECTION` over functional Baseline 2.6.0 and unchanged canonical source `0a10618648fc3f873afffd8f60e60bd0396b62e7` (fingerprint `8ae8433d11de2ba5c137bd1aa99ee55d2fc85aecb80bbec89847904387c73dbf`, 390 files, 87 migrations, 57 SQL functions, 1 sequence). This patch corrects impossible future CURRENT timestamps and stale findings methodology metadata only. Findings remain 46 total (14 RESOLVED, 22 ACTIVE, 5 POTENTIAL, 5 NOT_VALIDATED), with 0 release blockers; product and infrastructure health remain **DEGRADED**. Node remains 276/276 and PostgreSQL 4/4. Baseline commit is `SELF_NOT_RECORDED`; no functional, database, deployment or lifecycle change occurred.

# Desconhecidos, contradições e validações futuras

> **HISTORICAL SNAPSHOT:** preserved original-stage inventory; current values are projected by the Baseline 2.6.0 bannered documents and canonical machine-readable catalogs.

Esta lista contém **18 registros**. Ela evita transformar ausência de evidência em conclusão. Não foram encontrados diretórios dedicados `fixtures/` ou `mocks/`; testes e auditorias criam fixtures/mocks dentro dos próprios scripts. Também não foi encontrado SDK dedicado de observabilidade.

| ID | Estado | Questão/lacuna | Evidência atual | O que permanece sem confirmação |
| --- | --- | --- | --- | --- |
| U-001 | NÃO VALIDADO | Commit efetivamente publicado | `HEAD` e `origin/production` estavam em `a141c60`; o repositório contém configuração Vercel | último deploy, commit servido e alias/domínio atuais |
| U-002 | NÃO VALIDADO | Projeto Supabase remoto desta baseline | existem `.env*` ignorados e migrations locais | project-ref vinculado, conta, região e ambiente correto |
| U-003 | NÃO VALIDADO | Estado das 79 migrations no remoto | arquivos SQL locais e documentos históricos | migrations aplicadas, divergências local-only/remote-only e schema drift |
| U-004 | NÃO VALIDADO | RLS, grants e funções efetivos | migrations habilitam RLS/revogam papéis públicos; nenhuma `CREATE POLICY` local | catálogo remoto, owners, grants, políticas adicionadas fora do Git |
| U-005 | NÃO VALIDADO | Consistência das variáveis por ambiente | schema e `.env.example` divergem em alguns nomes | presença/valor em Development, Preview e Production; nenhuma credencial foi registrada |
| U-006 | NÃO VALIDADO | Configuração dos webhooks Z-API e Mercado Pago | duas rotas POST e validação de segredo/assinatura estão no código | URLs cadastradas, segredo correspondente, retries e entrega reais |
| U-007 | NÃO VALIDADO | Execução dos cron jobs | `vercel.json` agenda duas rotas por minuto; rotas exigem `CRON_SECRET` | plano compatível, cron ativo, autenticação e histórico de execuções |
| U-008 | PARCIALMENTE CONFIRMADO | Relação entre fonte local corrigida e UI publicada | typecheck/lint/build locais passam após a correção de `CreateEventModal.tsx` | o commit/build efetivamente publicado continua NOT_VALIDATED |
| U-009 | PARCIALMENTE CONFIRMADO | Alcance total da corrupção textual | teste de mojibake falha; fontes têm `?`, `Ã` e mensagens divergentes | todo texto afetado em browser, WhatsApp, banco e dados externos |
| U-010 | PARCIALMENTE CONFIRMADO | Resultado dos testes fora de `npm test` | Etapa 3 executou 39 dos 43 arquivos, incluindo 25 dos 28 fora da suíte padrão: 276 casos aprovados e 20 falhas | três testes reais não executados; teste padrão do mapa apenas inspecionado nesta etapa. Ver capability-test-coverage.md |
| U-011 | ÓRFÃO / POSSÍVEL LEGADO | `seat_map_renders` e Storage | tabela/trigger/RLS e `SEAT_MAP_STORAGE_BUCKET` existem; nenhuma chamada `.storage`, upload/download ou `.from('seat_map_renders')` foi encontrada | uso externo, dados remotos, intenção de retomada ou aposentadoria |
| U-012 | ORPHAN / POSSIBLE LEGACY | Unused image assets and BrandLogo consumer remain uncertain | active CSS now uses valid Rota5 assets; `BrandLogo.tsx` still has no importer | dynamic URL/data consumers and inactive orphan assets |
| U-013 | DESCONHECIDO | Modelo de marca/tenant | Rota5, RockBar e Black House coexistem; flags Rota5 são constantes globais | se o sistema é single-brand, migração de marca, compartilhado ou multi-tenant |
| U-014 | POSSÍVEL LEGADO | Atualidade dos documentos preexistentes | docs registram datas, projetos Supabase, testes e restrições históricas | quais afirmações ainda representam infraestrutura atual |
| U-015 | PARCIALMENTE CONFIRMADO | Estado após falha intermediária de criação/duplicação | serviços fazem várias operações sequenciais e deixam o evento draft até o fim; não foi encontrada RPC única | casos reais de falha, resíduos existentes e processo operacional de recuperação |
| U-016 | PARCIALMENTE CONFIRMADO | Visibilidade imediata de novos/duplicados no admin | filtro inicial é `published`; criação/duplicação usa `draft`; callback carrega `all` sem mudar o estado do filtro | comportamento final em browser após efeitos/reload e intenção de UX |
| U-017 | DESCONHECIDO | Destino e operação da observabilidade | logger JSON mascara campos; algumas rotas usam `console` direto | coletor, retenção, dashboards, alertas, correlação e acesso aos logs |
| U-018 | DESCONHECIDO | Pacotes extraneous locais | `npm ls` encontrou `pg` e dependências, além de `@emnapi/runtime`, fora do manifesto | origem, consumidor local e se uma instalação limpa os contém |

## Contradições confirmadas

### Compilação versus testes de estrutura

`test-admin-events-editor-event-modal-extraction.mjs` passou 4/4 após a correção, mas continua fora de `npm test`. A validade sintática foi comprovada separadamente por TypeScript, ESLint e Next build.

### Texto sanitizado versus fonte corrompida

`src/lib/zapi/textEncoding.ts` e `test-whatsapp-output-sanitization.mjs` implementam/validam sanitização central. Mesmo assim, `test-message-mojibake.mjs` falha e foram encontradas strings corrompidas em UI, rotas e catálogo de ajuda. Sanitização de uma saída não prova integridade de todas as superfícies.

### Criação em draft versus filtro published

`createAdminEvent` e `duplicateAdminEvent` persistem `draft`. `AdminEventsEditor` inicia com filtro `published`. O callback de criação solicita `status=all`, mas o estado visível do filtro permanece `published`. Essa combinação explica estaticamente por que um evento novo pode não permanecer na lista após nova carga, mas somente um teste de browser pode fechar o comportamento.

### Armazenamento declarado versus uso encontrado

`SEAT_MAP_STORAGE_BUCKET` é obrigatório no schema e `seat_map_renders` existe desde a primeira migration, porém a implementação atual gera imagens em memória/filesystem e persiste coordenadas em `official_table_map_places`. Nenhum consumidor do bucket/tabela foi localizado.

### Identidade Rota5 versus referências anteriores

A identidade visual principal usa Rota5, mas mensagens e fallbacks ainda dizem Rock Bar/Black House, há três scripts Black House, um PSD Black House, uma origem CORS Black House e seletores CSS RockBar sem assets correspondentes. Não há discriminador de tenant encontrado que escolha uma marca em runtime.

## Itens conhecidos que não são desconhecidos

- A raiz `/` renderiza um `<main>` vazio: CONFIRMADO.
- O pipeline de resposta ao cliente por batches retorna `customer_reply_pipeline_disabled`: CONFIRMADO.
- Os flags Rota5 de ingresso individual, mapa e cortesia estão fixos em `true/false`: CONFIRMADO.
- Não existem views versionadas nem declarações `CREATE POLICY`: CONFIRMADO para os arquivos locais; não implica ausência remota.
- O build atual falha: CONFIRMADO para a máquina e commit auditados.
