> **Current Baseline 2.4.1 (2026-09-14):** `PATCH_DOCUMENTARY_CORRECTION` on canonical source `67845326088eac47452224b00ef1e866036e86f1` (fingerprint `df6e8976738d2c05dd13d4ea988af12c05531e533f9b8b0feb456084ad82d6c0`, 368 files, 79 migrations). Findings `bug.event-duplicate-artist-leak` and `bug.user-visible-text-corruption` are **RESOLVED** as stale. `gap.partial-flows-lack-end-to-end-proof` remains **ACTIVE**, decomposed from P1 to P2; no specific P1 was justified. Canonical release blockers: **0**. Metrics: ACTIVE HIGH 0, POTENTIAL HIGH 1, OPEN HIGH 1, RESOLVED 11. PRODUCT_HEALTH: **DEGRADED**; INFRASTRUCTURE_HEALTH: **DEGRADED**. Quality evidence remains 236/236, PostgreSQL 1/1 and Quality Gate 34867214724 PASS. Production remains `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` on `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; no deployment, Supabase change or Ticketeira access.

# Next actions from existing findings

## HIGH #1 RESOLVED

EXPAND and CONTRACT are APPLIED_AND_VALIDATED, gates A-I passed and authorization is strict-only. OLD_APP rollback is not safe after FINAL_DB. Git auto-deploy remains disabled.

This document orders current findings; it does not introduce features or patches.

## P0 — BEFORE EVOLUTION

Nenhum finding P0 ativo.

## RESOLVED
- `legacy.active-brand-contamination` - scoped active surfaces passed Preview and Production validation on `d2b2857c2ccf4023bfd4dc926b7b46b8acf836b8`; historical strings outside the audited scope are not covered.
- `risk.gate-credential-revocation-does-not-revoke-session` — EXPAND/CONTRACT complete; gates A-I and strict runtime passed.
- `bug.create-event-invalid-jsx` — JSX corrigido; typecheck, lint e build passam.
- `bug.combo-redemption-unreachable-consume` — caminho atômico restaurado localmente; equivalência remota continua não validada.
- `risk.vercel-project-identity-drift` — cadeia canônica separada como `FelipeFraul/rota5` `production` → Vercel `rota5`; nenhum deployment realizado.
- `risk.latest-rota5-deployment-error` — deployment Production mais recente está READY, serve os aliases canônicos e passou os probes de runtime.

## P1 — ACTIVE AND POTENTIAL STABILIZATION
- `bug.event-duplicate-artist-leak` — Duplicação de evento preserva artista do evento de origem
- `bug.user-visible-text-corruption` — Textos ativos contêm mojibake e substituições por interrogação
- `risk.admin-event-multistep-partial-state` (POTENTIAL) — Criação de evento e catálogo inicial cruza entidades sem transação única
- `gap.default-test-suite-failing` — Suíte padrão está vermelha com sete casos falhos
- `gap.critical-capability-and-flow-coverage` is RESOLVED in Baseline 2.4.0; no ACTIVE HIGH remains.
- `risk.payment-confirmed-before-external-delivery` (POTENTIAL) — Confirmação atômica e entrega externa formam fronteira de consistência eventual
- `gap.partial-flows-lack-end-to-end-proof` — Sete flows parciais não possuem prova ponta a ponta

## P2 — STRUCTURAL DEBT
- `risk.combo-metadata-read-modify-write-race` — Atualizações concorrentes podem sobrescrever metadados do combo
- `risk.github-issue-create-replay` — Criação de issue não possui chave de idempotência
- `risk.rate-limit-fails-open` — Falha do rate limiter libera a requisição
- `risk.remote-database-controls-unvalidated` — Controles remotos de banco além do schema visível não foram validados
- `risk.remote-webhook-registration-unvalidated` — Registro remoto dos dois webhooks não foi confirmado
- `risk.published-commit-unvalidated` — Commit publicado não pode ser reconciliado com o HEAD auditado
- `risk.local-runtime-env-incomplete` — Ambiente local não contém todas as variáveis exigidas
- `gap.critical-flow-correlation` — Fluxos críticos não têm correlação ponta a ponta
- `debt.router-responsibility-concentration` — Roteador conversacional concentra coordenação de muitos domínios
- `debt.zapi-webhook-responsibility-coupling` — Handler Z-API acopla transporte, deduplicação, automação e entrega
- `gap.real-integration-tests-outside-default` — Testes reais e de integração ficam fora da suíte padrão
- `gap.source-contract-assertion-bias` — Parte relevante dos testes valida texto-fonte e regex de implementação
- `gap.remote-database-behavior-tests` — Equivalência remota de RPCs, triggers e constraints não tem teste de baseline
- `orphan.gate-session-revoke` — Capability de revogar sessão de leitor não tem entrypoint
- `legacy.table-map-presentation-disabled` — Mapa oficial e cortesia permanecem implementados, mas desativados na apresentação Rota5
- `debt.direct-supabase-access-spread` — Acesso privilegiado ao Supabase está espalhado por services e routes
- `risk.whatsapp-conversation-context-race` — Mensagens simultâneas podem competir pela atualização do contexto conversacional
- `risk.production-capable-scripts-outside-test-isolation` — Scripts reais podem ler ou alterar ambientes remotos por configuração
- `risk.service-role-application-authorization-boundary` — A autorização da aplicação protege operações que usam service role

## LATER
- `debt.seat-map-storage-contract-drift` (P3) — Variável de bucket existe sem consumidor nem bucket remoto
- `dead.brand-logo-component` (P3) — BrandLogo.tsx não possui consumidor encontrado
- `orphan.ticket-validation-history` (P3) — Capability de histórico de validações não tem entrypoint
- `orphan.courtesy-event-limit` (P3) — Limite global de cortesia existe sem entrypoint
- `orphan.gate-sessions-list` (P3) — Listagem de sessões de leitor não tem entrypoint
- `orphan.seat-map-renders-table` (P3) — seat_map_renders não tem consumidor de aplicação confirmado
- `debt.large-mixed-service-modules` (P3) — Serviços grandes misturam consulta, regra, formatting e efeitos
- `debt.payment-reconciliation-duplication-is-intentional` (P4) — Webhook e consulta de status repetem confirmação com guardas idempotentes
- `risk.checkout-status-fixed-polling` (P3) — Checkouts consultam status a cada cinco segundos sem backoff
- `gap.client-errors-not-persisted` (P3) — Falhas de polling e scanner ficam apenas no estado do cliente
- `debt.distributed-status-literals` (P4) — Estados e mensagens de negócio estão distribuídos em arquivos extensos

## RESOLVED STABILIZATION ITEMS
- `gap.test-runner-depends-on-untracked-loader` — loader byte-identical versionado; checkout Git canônico executou npm ci e 207/214 sem depender de .tmp.
